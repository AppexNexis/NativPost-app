import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { BillingConfigError, getBillingProvider } from '@/lib/billing/provider';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// -----------------------------------------------------------
// POST /api/billing/manage
// Creates a self-service billing portal session on the active provider.
//
// The portal handles ALL subscription management on both rails:
// - View/change plan
// - Update payment method
// - View billing history and invoices
// - Cancel subscription
//
// STRIPE: a Billing Portal session. Configure in Stripe Dashboard →
//   Settings → Customer Portal (enable plan changes, payment method
//   updates, invoice history, cancellation).
//
// POLAR: a Customer Session, which returns a pre-authenticated link into
//   Polar's hosted Customer Portal — the customer does not have to request
//   an email code. Configure in polar.sh → Settings → Customer Portal.
//   Note that updating a default payment method is only available in
//   Polar's hosted portal, which is exactly what this returns.
//
// Either way this is the failed-payment recovery path, so it must keep
// working while the org is past_due.
// -----------------------------------------------------------
export async function POST() {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  try {
    const provider = await getBillingProvider();
    const { url } = await provider.createPortalSession({
      orgId: orgId!,
      returnUrl: `${APP_URL}/dashboard/billing`,
    });

    return NextResponse.json({ url });
  } catch (err) {
    // "No billing account found" is a legitimate answer for an org that has
    // never checked out — a 400 with the reason, not a 500.
    if (err instanceof BillingConfigError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error('[Billing Portal] Error:', err);
    return NextResponse.json({ error: 'Failed to create portal session' }, { status: 500 });
  }
}
