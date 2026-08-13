import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { addAiCredits, getAiCreditsWallet } from '@/lib/ai-studio/server';
import { firePlanUpgradedEmail, fireSubscriptionCancelledEmail } from '@/lib/billing';
import { getContactForOrg } from '@/lib/billing/org-contact';
import { activateAddonFromCheckout } from '@/lib/msi/addon-service';
import { fulfillOrder } from '@/lib/msi/provisioning';
import { notifyBilling } from '@/lib/notifications';
import { getPlanByPolarProductId, getPolarProductInterval, PLAN_CONFIGS } from '@/lib/plans';
import { sendTrustpilotInvitation } from '@/lib/trustpilot';
import { getDb } from '@/libs/DB';
import { msiProvisioningOrderSchema, organizationSchema } from '@/models/Schema';

// Raw body is required for signature verification, so this route must never be
// statically analysed into a cached handler.
export const dynamic = 'force-dynamic';

// -----------------------------------------------------------
// POST /api/billing/polar-webhook
//
// The Polar counterpart to /api/billing/stripe-webhook. Every side-effect the
// Stripe webhook performs is performed here: org plan/status sync, MSI order
// fulfilment, AI credit top-ups, billing notifications, the plan.upgraded and
// subscription.cancelled emails, and the Trustpilot invitation.
//
// Event mapping (Polar → the Stripe event it stands in for):
//   order.paid                → checkout.session.completed (money captured)
//   subscription.created      → checkout.session.completed (subscription part)
//   subscription.active       → customer.subscription.updated / payment_succeeded
//   subscription.updated      → customer.subscription.updated (catch-all,
//                               and what fires on renewal: SDK 0.49 does not
//                               yet type the separate subscription.cycled
//                               event, and `updated` covers the same cycle)
//   subscription.past_due     → invoice.payment_failed
//   subscription.uncanceled   → (no Stripe analogue — cancellation reversed)
//   subscription.canceled     → cancellation SCHEDULED; access continues
//   subscription.revoked      → customer.subscription.deleted (access ends)
//
// Two Polar behaviours differ from Stripe and are handled deliberately:
//
//   * `subscription.canceled` does NOT end access. Polar keeps the subscription
//     `active` with cancelAtPeriodEnd until the period ends, then sends
//     `subscription.revoked`. So the cancellation email fires on `canceled`
//     while the plan reset happens on `revoked`.
//
//   * There is no trial_will_end event. Polar sends its own trial conversion
//     reminders, so the `trial.ending` email has no Polar trigger. NativPost's
//     own 7-day free window is app-side and unaffected either way.
//
// Signature verification uses Standard Webhooks via the Polar SDK. A bad
// signature is a 403 and is never processed.
// -----------------------------------------------------------

// Payload types are derived from the SDK's own validated-event union rather
// than imported from a deep model path: the SDK's export map only exposes
// top-level entry points, and this way the handlers below stay correct across
// SDK upgrades that add or reshape events.
type PolarEvent = ReturnType<typeof import('@polar-sh/sdk/webhooks').validateEvent>;
type Subscription = Extract<PolarEvent, { type: 'subscription.updated' }>['data'];
type Order = Extract<PolarEvent, { type: 'order.paid' }>['data'];

/** Map a Polar subscription status onto NativPost's `plan_status` column. */
function toPlanStatus(status: string): 'trialing' | 'active' | 'past_due' | 'cancelled' | null {
  switch (status) {
    case 'trialing':
      return 'trialing';
    case 'active':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
    case 'paused':
      return 'cancelled';
    case 'incomplete':
      // Payment never completed — the org was never granted anything, so
      // leave whatever state it already had rather than downgrading it.
      return null;
    default:
      return null;
  }
}

/** Polar stores the Clerk org id both in metadata and as the external customer id. */
function orgIdOf(payload: { metadata?: Record<string, unknown>; customer?: { externalId?: string | null } }): string | null {
  const fromMetadata = payload.metadata?.orgId;
  if (typeof fromMetadata === 'string' && fromMetadata) {
    return fromMetadata;
  }
  return payload.customer?.externalId ?? null;
}

/** Unix seconds, matching the integer column the Stripe path writes. */
function toUnixSeconds(date: Date | null | undefined): number | null {
  return date ? Math.floor(date.getTime() / 1000) : null;
}

// -----------------------------------------------------------
// SUBSCRIPTION STATE SYNC
// One writer for every subscription.* event — the status on the payload is
// always the current truth, so there is no need for per-event branching.
// -----------------------------------------------------------
async function applySubscriptionState(subscription: Subscription): Promise<void> {
  const db = await getDb();
  const orgId = orgIdOf(subscription);
  if (!orgId) {
    console.warn(
      `[Polar Webhook] subscription ${subscription.id} has no orgId in metadata `
      + 'or external customer id — skipping.',
    );
    return;
  }

  const planStatus = toPlanStatus(String(subscription.status));
  if (!planStatus) {
    return;
  }

  const plan = getPlanByPolarProductId(subscription.productId);
  const interval = getPolarProductInterval(subscription.productId);

  const [previous] = await db
    .select({ planStatus: organizationSchema.planStatus })
    .from(organizationSchema)
    .where(eq(organizationSchema.id, orgId))
    .limit(1);

  await db
    .update(organizationSchema)
    .set({
      planStatus,
      paymentType: 'polar',
      polarCustomerId: subscription.customerId,
      polarSubscriptionId: subscription.id,
      polarProductId: subscription.productId,
      polarSubscriptionStatus: String(subscription.status),
      polarSubscriptionCurrentPeriodEnd: toUnixSeconds(subscription.currentPeriodEnd),
      ...(interval ? { billingInterval: interval } : {}),
      ...(plan
        ? {
            plan: plan.id,
            postsPerMonth: plan.features.postsPerMonth === -1 ? 999999 : plan.features.postsPerMonth,
            platformsLimit: plan.features.platformsLimit === -1 ? 99 : plan.features.platformsLimit,
            setupFeePaid: true,
          }
        : {}),
      trialEndsAt: subscription.trialEnd ?? null,
      updatedAt: new Date(),
    })
    .where(eq(organizationSchema.id, orgId));

  console.log(
    `[Polar Webhook] subscription state: org=${orgId} status=${subscription.status} plan=${plan?.id ?? 'unmapped'}`,
  );

  if (!plan) {
    // A product id that maps to no plan means plans.ts and the Polar catalog
    // are out of sync. Status still synced above; loud so it gets fixed.
    console.error(
      `[Polar Webhook] product ${subscription.productId} maps to no plan — `
      + 'check polarProductId/polarAnnualProductId in src/lib/plans.ts.',
    );
    return;
  }

  // ── First transition into active: notify, email, invite review ──
  // The wasNotActive guard keeps this to the one-off conversion and off every
  // subsequent renewal, exactly as the Stripe webhook does.
  const wasNotActive = previous?.planStatus !== 'active';
  if (planStatus === 'active' && wasNotActive) {
    void notifyBilling(
      orgId,
      `You are now on the ${plan.name} plan`,
      'Your subscription is active. New limits and features are unlocked.',
      'success',
    );

    const { email, name } = await getContactForOrg(orgId);
    if (email) {
      await firePlanUpgradedEmail(email, plan.id);

      // Trustpilot invitation — sends 7 days after conversion.
      // Fire-and-forget, never throws, never blocks billing.
      sendTrustpilotInvitation({
        customerEmail: email,
        customerName: name || 'there',
        orgId,
        plan: plan.id,
      }).catch(() => null);
    }
  }

  if (planStatus === 'past_due') {
    void notifyBilling(
      orgId,
      'Payment failed',
      'We could not process your latest payment. Update your billing details to avoid losing access.',
      'error',
    );
  }
}

// -----------------------------------------------------------
// ORDER PAID — one-time purchases and the money side of subscriptions
// -----------------------------------------------------------
async function handleOrderPaid(order: Order): Promise<void> {
  const db = await getDb();
  const orgId = orgIdOf(order);
  if (!orgId) {
    return;
  }

  const type = order.metadata?.type;

  // ── MSI managed-account order: mark paid + fulfil (provision) ──
  if (type === 'msi_order') {
    const msiOrderId = order.metadata?.msiOrderId;
    if (typeof msiOrderId !== 'string' || !msiOrderId) {
      return;
    }

    // Guarded on `pending` so a webhook redelivery cannot re-provision an
    // order that is already paid or fulfilling. The UPDATE and the guard are
    // one statement, so two concurrent deliveries cannot both win it: whichever
    // loses matches no rows and returns empty.
    const updated = await db
      .update(msiProvisioningOrderSchema)
      .set({
        status: 'paid',
        polarCheckoutId: order.checkoutId,
        polarSubscriptionId: order.subscriptionId,
        paidAt: new Date(),
      })
      .where(
        and(
          eq(msiProvisioningOrderSchema.id, msiOrderId),
          eq(msiProvisioningOrderSchema.status, 'pending'),
        ),
      )
      .returning({ id: msiProvisioningOrderSchema.id });

    if (!updated.length) {
      console.log(
        `[Polar Webhook] msi_order ${msiOrderId} already processed — skipping.`,
      );
      return;
    }

    try {
      await fulfillOrder(msiOrderId);
      console.log(`[Polar Webhook] msi_order paid + fulfilled: ${msiOrderId}`);
    } catch (fulfilErr) {
      console.error('[Polar Webhook] msi fulfilment failed:', fulfilErr);
    }
    return;
  }

  // ── MSI add-on: activate now that the subscription is paid for ──
  // The add-on was deliberately NOT activated when the customer clicked
  // "Activate" (see beginAddonActivation) — Polar cannot start a paid
  // subscription server-side, so this is the point where entitlement is granted.
  if (type === 'msi_addon') {
    const addonId = order.metadata?.addonId;
    if (typeof addonId !== 'string' || !addonId) {
      return;
    }
    const rawTier = order.metadata?.tierId;
    const tierId = typeof rawTier === 'string' && rawTier ? rawTier : null;

    const result = await activateAddonFromCheckout({
      orgId,
      addonId,
      tierId,
      polarSubscriptionId: order.subscriptionId,
    });

    if (!result.ok) {
      // The catalog rejected an add-on the customer has already paid for.
      // Loud, because it needs a human: refund or fix the catalog.
      console.error(
        `[Polar Webhook] msi_addon ${addonId}${tierId ? `/${tierId}` : ''} PAID `
        + `but not activated for org=${orgId}: ${result.error}`,
      );
      return;
    }

    console.log(
      `[Polar Webhook] msi_addon activated: org=${orgId} addon=${addonId}`
      + `${tierId ? ` tier=${tierId}` : ''} sub=${order.subscriptionId ?? 'none'}`,
    );

    void notifyBilling(
      orgId,
      `${result.addon.name} is active`,
      'Your add-on is live and will be billed with your next invoice.',
      'success',
    );
    return;
  }

  // ── AI credits purchase ──
  if (type === 'ai_credits') {
    // Credit packs are one-time products, so only the initial purchase order
    // grants credits — never a subscription renewal that happened to carry
    // this metadata forward.
    if (String(order.billingReason) !== 'purchase') {
      return;
    }

    const credits = Number.parseInt(String(order.metadata?.credits ?? '0'), 10);
    if (!Number.isFinite(credits) || credits <= 0) {
      return;
    }

    // Polar redelivers on non-2xx, and the credit ledger has no idempotency
    // key, so the order id is stamped into the activity description and
    // checked here. This covers the retained activity window, which is far
    // longer than any redelivery window.
    const marker = `polar:${order.id}`;
    const wallet = await getAiCreditsWallet(orgId);
    if (wallet.recentActivity?.some(a => a.description?.includes(marker))) {
      console.log(`[Polar Webhook] ai_credits already granted for order ${order.id}`);
      return;
    }

    await addAiCredits(orgId, credits, {
      type: 'purchase',
      description: `Purchased ${credits} AI credits (${marker})`,
    });
    console.log(`[Polar Webhook] ai_credits: org=${orgId} credits=${credits}`);
  }
}

// -----------------------------------------------------------
// REVOKED — access actually ends (Stripe: customer.subscription.deleted)
// -----------------------------------------------------------
async function handleSubscriptionRevoked(subscription: Subscription): Promise<void> {
  const db = await getDb();
  const orgId = orgIdOf(subscription);
  if (!orgId) {
    return;
  }

  // Mirrors the Stripe path, including its reset to the starter tier: the org
  // is left on `cancelled`, so every limit check refuses regardless of which
  // plan row it lands on.
  const starterPlan = PLAN_CONFIGS.starter!;

  await db
    .update(organizationSchema)
    .set({
      planStatus: 'cancelled',
      polarSubscriptionStatus: 'canceled',
      polarSubscriptionId: null,
      plan: 'starter',
      postsPerMonth: starterPlan.features.postsPerMonth,
      platformsLimit: starterPlan.features.platformsLimit,
      updatedAt: new Date(),
    })
    .where(eq(organizationSchema.id, orgId));

  console.log(`[Polar Webhook] subscription.revoked: org=${orgId}`);

  const { email } = await getContactForOrg(orgId);
  if (email) {
    await fireSubscriptionCancelledEmail(email);
  }
}

// -----------------------------------------------------------
// ROUTE
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const webhookSecret = process.env.POLAR_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[Polar Webhook] POLAR_WEBHOOK_SECRET is not set — rejecting.');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const body = await request.text();
  const headersList = await headers();

  // validateEvent needs the raw header map, not a Headers instance.
  const headerRecord: Record<string, string> = {};
  headersList.forEach((value, key) => {
    headerRecord[key] = value;
  });

  const { validateEvent, WebhookVerificationError } = await import(
    '@polar-sh/sdk/webhooks'
  );

  let event: ReturnType<typeof validateEvent>;
  try {
    event = validateEvent(body, headerRecord, webhookSecret);
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      console.error('[Polar Webhook] Signature verification failed:', err.message);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }
    console.error('[Polar Webhook] Could not parse payload:', err);
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'order.paid':
        await handleOrderPaid(event.data);
        break;

      // Every one of these carries the full, current subscription — a single
      // status-driven writer keeps them from disagreeing with each other.
      case 'subscription.created':
      case 'subscription.active':
      case 'subscription.updated':
      case 'subscription.uncanceled':
      case 'subscription.past_due':
        await applySubscriptionState(event.data);
        break;

      case 'subscription.canceled': {
        // Cancellation SCHEDULED — Polar keeps the subscription active until
        // the period ends. Sync state (which stays active) and send the
        // cancellation email now, while the customer is expecting it.
        await applySubscriptionState(event.data);
        const orgId = orgIdOf(event.data);
        if (orgId) {
          const { email } = await getContactForOrg(orgId);
          if (email) {
            await fireSubscriptionCancelledEmail(email);
          }
        }
        break;
      }

      case 'subscription.revoked':
        await handleSubscriptionRevoked(event.data);
        break;

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    // Matches the Stripe webhook: a handler failure is logged and acknowledged
    // rather than 500'd, so Polar does not redeliver an event whose side
    // effects may have partially landed.
    console.error('[Polar Webhook] Processing error:', err);
    return NextResponse.json({ error: 'Processing failed', received: true });
  }
}
