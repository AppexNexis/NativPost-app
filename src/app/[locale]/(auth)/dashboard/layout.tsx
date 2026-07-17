import { auth } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { getOrgBillingState } from '@/lib/billing';
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

  // ── Billing gate ───────────────────────────────────────────────────
  let billing;
  try {
    billing = await getOrgBillingState(orgId);
  } catch (err) {
    console.error('[Dashboard Gate] billing fetch failed', err);
    billing = null;
  }

  const isActive = billing?.isActive;
  const isTrialing = billing?.isTrialing;
  const trialExpired = billing?.trialExpired;
  const isPastDueOrCancelled =
    billing?.planStatus === 'past_due' || billing?.planStatus === 'cancelled';

  // past_due/cancelled users CAN access the dashboard (specifically billing)
  // They get redirected to /dashboard/billing by the client-side billing gate below
  const canAccess =
    isActive ||
    (isTrialing && !trialExpired) ||
    (isPastDueOrCancelled && !!billing?.setupFeePaid);

  if (!canAccess) {
    redirect('/subscribe?redirect=/dashboard');
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}