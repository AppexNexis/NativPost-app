import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { getOrgBillingState } from '@/lib/billing';

import DashboardClientLayout from './DashboardClientLayout';

export const dynamic = 'force-dynamic';

export default async function DashboardLayoutGate({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const { userId, orgId } = await auth();

  // Not signed in
  if (!userId) {
    const locale = params?.locale && params.locale !== 'en' ? `/${params.locale}` : '';
    redirect(`${locale}/sign-in`);
  }

  // No org selected yet
  if (!orgId) {
    redirect('/onboarding/organization-selection');
  }

  // ── Billing gate ─────────────────────────────────────────
  // IMPORTANT: if the DB call fails for any reason (cold start,
  // connection timeout, etc.) we MUST allow through — never block
  // a user because of an infra error.
  //
  // Only redirect to /subscribe when we get a definitive
  // "not active" signal from the DB.
  try {
    const billing = await getOrgBillingState(orgId);

    // billing is null = org record doesn't exist yet (new org)
    // Send to subscribe to create their subscription
    if (billing === null) {
      const locale = params?.locale && params.locale !== 'en' ? `/${params.locale}` : '';
      redirect(`${locale}/subscribe`);
    }

    // Has a billing record — check if subscription is active
    // isActive = true means either trialing (not expired) or paid active
    if (billing.isActive === false) {
      const locale = params?.locale && params.locale !== 'en' ? `/${params.locale}` : '';
      redirect(`${locale}/subscribe?redirect=/dashboard`);
    }

    // billing.isActive === true → fall through and render dashboard
  } catch (err) {
    // DB error, network timeout, etc.
    // LOG the error but DO NOT block the user.
    // Better to let someone in during an outage than lock everyone out.
    console.error('[DashboardLayoutGate] Billing check failed — allowing through:', err);
  }

  return <DashboardClientLayout>{children}</DashboardClientLayout>;
}