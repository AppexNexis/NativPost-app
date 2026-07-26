import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

import { getAuthContext } from '@/lib/auth';
import { perAccountCents } from '@/lib/msi/pricing';
import { getDb } from '@/libs/DB';
import { msiProvisioningOrderSchema, organizationSchema } from '@/models/Schema';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
// Metered price ($1.50/post) linked to the Managed Posts meter. When set, it's
// added as a second subscription item so managed-post usage is billed on the
// SAME subscription as the per-account fee. Unset → checkout behaves exactly as
// before (per-account only); safe to deploy before the price exists in Stripe.
const MSI_POST_PRICE_ID = process.env.STRIPE_MSI_POST_PRICE_ID;

type RouteParams = { params: Promise<{ orderId: string }> };

// POST /api/msi/orders/[orderId]/checkout
// Create a Stripe subscription Checkout session for a pending managed-account
// order (per-account/mo × quantity). The webhook fulfils it on payment.
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }
  const { orderId } = await params;
  const db = await getDb();

  const [order] = await db
    .select()
    .from(msiProvisioningOrderSchema)
    .where(
      and(
        eq(msiProvisioningOrderSchema.id, orderId),
        eq(msiProvisioningOrderSchema.orgId, orgId!),
        eq(msiProvisioningOrderSchema.status, 'pending'),
      ),
    )
    .limit(1);
  if (!order) {
    return NextResponse.json({ error: 'Order not found or not payable' }, { status: 404 });
  }

  // Ensure the org has a Stripe customer.
  const [org] = await db
    .select({ stripeCustomerId: organizationSchema.stripeCustomerId })
    .from(organizationSchema)
    .where(eq(organizationSchema.id, orgId!))
    .limit(1);
  let customerId = org?.stripeCustomerId ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({ metadata: { orgId: orgId! } });
    customerId = customer.id;
    await db
      .update(organizationSchema)
      .set({ stripeCustomerId: customerId })
      .where(eq(organizationSchema.id, orgId!));
  }

  const config = (order.configSnapshot ?? {}) as { platform?: string; country?: string };
  const descriptionParts = [config.platform, config.country].filter(Boolean);
  const metadata = { type: 'msi_order', msiOrderId: orderId, orgId: orgId! };

  try {
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Managed social account',
              ...(descriptionParts.length
                ? { description: descriptionParts.join(' · ') }
                : {}),
            },
            unit_amount: perAccountCents(),
            recurring: { interval: 'month' },
          },
          quantity: order.quantity,
        },
        // Metered per-post usage item. No `quantity` — a metered price derives
        // its quantity from reported meter events (docs §6). Omitted entirely
        // when the price id isn't configured.
        ...(MSI_POST_PRICE_ID ? [{ price: MSI_POST_PRICE_ID }] : []),
      ],
      metadata,
      subscription_data: { metadata },
      billing_address_collection: 'auto',
      success_url: `${APP_URL}/dashboard/infrastructure?order=success`,
      cancel_url: `${APP_URL}/dashboard/infrastructure/new?cancelled=true`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('MSI checkout failed:', err);
    return NextResponse.json({ error: 'Could not start checkout' }, { status: 500 });
  }
}
