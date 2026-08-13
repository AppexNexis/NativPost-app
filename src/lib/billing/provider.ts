/**
 * The billing provider seam.
 *
 * NativPost sells through one of two international rails — Stripe (direct) or
 * Polar (Merchant of Record) — chosen app-wide by BILLING_PROVIDER. Everything
 * above this file talks to `BillingProvider`; nothing above it imports the
 * Stripe or Polar SDK. Switching rails is an env var, not a code change.
 *
 * Paystack is deliberately NOT part of this union. It is a regional rail the
 * customer picks at checkout (Nigerian/African cards), not the app-wide
 * provider, and it keeps its own dedicated routes exactly as before.
 *
 * The two implementations live in ./stripe-provider and ./polar-provider and
 * are loaded lazily, so a Polar-only deployment never instantiates Stripe and
 * vice versa.
 *
 * Where the models genuinely differ, this interface follows the SUPERSET and
 * each implementation documents its own mapping:
 *  - Stripe bills a *price*; Polar bills a *product* (monthly and yearly are
 *    two separate Polar products). Callers pass planId + interval and let the
 *    provider resolve its own identifier.
 *  - Stripe's Billing Portal is a hosted session; Polar's is a customer session
 *    that returns a portal URL. Both surface as createPortalSession().
 */

import type { BillingInterval, BillingProviderId } from '@/lib/plans';
import { getActiveBillingProvider } from '@/lib/plans';

export type { BillingProviderId };

// -----------------------------------------------------------
// PARAMS
// -----------------------------------------------------------

export type SubscriptionCheckoutParams = {
  /** Clerk org id. Doubles as the provider-side external customer reference. */
  orgId: string;
  planId: string;
  interval: BillingInterval;
  /**
   * Post-payment redirect, WITHOUT a session-id placeholder. Each provider
   * appends its own — Stripe interpolates `{CHECKOUT_SESSION_ID}` and Polar
   * `{CHECKOUT_ID}`, so callers must not hardcode either.
   */
  successUrl: string;
  /** Where "back"/"cancel" returns the customer. */
  cancelUrl: string;
  /** Pre-fills the checkout email when known. */
  email?: string | null;
};

/**
 * Append a provider's checkout-id placeholder to a success URL. Keeps the
 * query-string assembly in one place so neither provider has to care whether
 * the caller's URL already carries params.
 */
export function withCheckoutIdParam(url: string, param: string, token: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${param}=${token}`;
}

export type CreditsCheckoutParams = {
  orgId: string;
  /** Number of AI credits being bought. */
  credits: number;
  /** Price in whole US dollars (may be fractional). */
  amountUsd: number;
  successUrl: string;
  cancelUrl: string;
  email?: string | null;
};

export type ManagedAccountCheckoutParams = {
  orgId: string;
  /** msi_provisioning_order.id — echoed back on the webhook to fulfil it. */
  orderId: string;
  quantity: number;
  /** Per-account monthly price, in cents. */
  unitAmountCents: number;
  /** Shown on the checkout line item, e.g. "instagram · NG". */
  description?: string | null;
  successUrl: string;
  cancelUrl: string;
};

export type PortalSessionParams = {
  orgId: string;
  returnUrl: string;
};

export type CheckoutResult = { url: string };

/**
 * Raised when a provider is asked to do something it is not configured for
 * (missing key, unconfigured plan id, org with no customer record). Routes
 * translate this into a 400 with the message shown to the user, rather than a
 * 500 — these are configuration problems, not crashes.
 */
export class BillingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingConfigError';
  }
}

// -----------------------------------------------------------
// THE INTERFACE
// -----------------------------------------------------------

export type BillingProvider = {
  readonly id: BillingProviderId;
  /** Human-readable name for UI ("Stripe" / "Polar"). */
  readonly label: string;

  /** Whether credentials are present. False → the rail cannot be used at all. */
  isConfigured: () => boolean;

  /** Whether this specific plan+interval has a real id (not a placeholder). */
  isPlanPurchasable: (planId: string, interval?: BillingInterval) => boolean;

  /** Hosted checkout for a recurring plan. */
  createSubscriptionCheckout: (
    params: SubscriptionCheckoutParams,
  ) => Promise<CheckoutResult>;

  /** Hosted checkout for a one-time AI credit top-up. */
  createCreditsCheckout: (
    params: CreditsCheckoutParams,
  ) => Promise<CheckoutResult>;

  /** Hosted checkout for an MSI managed-account order (recurring, quantity N). */
  createManagedAccountCheckout: (
    params: ManagedAccountCheckoutParams,
  ) => Promise<CheckoutResult>;

  /**
   * Self-service portal: payment method, invoices, cancellation. This is the
   * failed-payment recovery path on both rails, so it must stay reachable even
   * when the org's subscription is past_due.
   */
  createPortalSession: (params: PortalSessionParams) => Promise<CheckoutResult>;
};

// -----------------------------------------------------------
// RESOLUTION
// -----------------------------------------------------------

/**
 * Load a provider by id. Dynamic import keeps the unused SDK out of the module
 * graph — a Polar-only deployment never constructs a Stripe client.
 */
export async function resolveBillingProvider(
  id: BillingProviderId,
): Promise<BillingProvider> {
  if (id === 'polar') {
    const { polarProvider } = await import('./polar-provider');
    return polarProvider;
  }
  const { stripeProvider } = await import('./stripe-provider');
  return stripeProvider;
}

/** The provider selected by BILLING_PROVIDER (default: stripe). */
export async function getBillingProvider(): Promise<BillingProvider> {
  return resolveBillingProvider(getActiveBillingProvider());
}
