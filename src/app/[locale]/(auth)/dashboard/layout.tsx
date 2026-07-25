import { auth } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { ensureOrgFreePlan } from '@/lib/billing';
import { getDb } from '@/libs/DB';
import { onboardingProgressSchema } from '@/models/Schema';

import DashboardLayout from './DashboardClientLayout';

export const dynamic = 'force-dynamic';

export default async function DashboardLayoutGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, orgId } = await auth();

  if (!userId) redirect('/sign-in');
  if (!orgId) redirect('/onboarding/organization-selection');

  // ── Authoritative onboarding gate ──────────────────────────────────
  // Checks the DB for the post_signup completion row. This is the
  // definitive check — unlike the removed middleware gate, it survives
  // cookie clears, new browsers, and stale Clerk session tokens.
  // NOTE: redirect() must live OUTSIDE the try block — it throws a
  // special internal error that would be swallowed by catch.
  let isOnboarded = false;
  try {
    const db = await getDb();
    const [onboardingRow] = await db
      .select({ id: onboardingProgressSchema.id })
      .from(onboardingProgressSchema)
      .where(
        and(
          eq(onboardingProgressSchema.orgId, orgId),
          eq(onboardingProgressSchema.step, 'post_signup'),
          eq(onboardingProgressSchema.completed, true),
        ),
      )
      .limit(1);

    isOnboarded = !!onboardingRow;
  } catch (err) {
    console.error('[Dashboard Gate] onboarding check failed', err);
    // DB error — treat as onboarded so a transient outage doesn't
    // redirect already-completed users to the setup page.
    isOnboarded = true;
  }

  if (!isOnboarded) {
    redirect('/onboarding/setup');
  }

  // ── Billing provisioning ───────────────────────────────────────────
  // Nothing here ever redirects. There is no purchase step in front of
  // the dashboard: an org with no billing row (missed Clerk webhook) or
  // a legacy `inactive` row is repaired onto the free plan and carries on.
  //
  // Routing for a lapsed free window or a failed payment is the client
  // BillingGate's job — it can see the pathname, so it can send the user
  // to /dashboard/billing without fighting this layout for the same URL.
  try {
    await ensureOrgFreePlan(orgId);
  } catch (err) {
    console.error('[Dashboard Gate] free plan provisioning failed', err);
    // Non-fatal: getOrgBillingState has its own fallback insert, and
    // API-level limit checks still refuse work for an unprovisioned org.
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}