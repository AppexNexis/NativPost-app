/**
 * POST /api/onboarding-progress/complete
 *
 * Called by the onboarding wizard on the final step. Records completion in
 * BOTH signals:
 *   1. onboarding_progress row (step=post_signup, completed=true) - DB source of truth.
 *   2. Clerk user publicMetadata.onboardedOrgs[orgId] - session claim used by
 *      middleware to gate /dashboard without a DB call.
 *
 * The response sets a signed cookie np_onb_<orgId>=1 (30 day expiry) so the
 * middleware fallback for pre-existing users has a fast path even before the
 * next session token refresh.
 */

import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { syncOnboardingCompleteToClerkUser } from '@/lib/sync-clerk-metadata';
import { getDb } from '@/libs/DB';
import { onboardingProgressSchema } from '@/models/Schema';

export const dynamic = 'force-dynamic';

export async function POST() {
  const { error, orgId, userId } = await getAuthContext();
  if (error) {
    return error;
  }

  const db = await getDb();

  try {
    const [existing] = await db
      .select({ id: onboardingProgressSchema.id })
      .from(onboardingProgressSchema)
      .where(
        and(
          eq(onboardingProgressSchema.orgId, orgId!),
          eq(onboardingProgressSchema.step, 'post_signup'),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(onboardingProgressSchema)
        .set({ completed: true, completedAt: new Date() })
        .where(eq(onboardingProgressSchema.id, existing.id));
    } else {
      await db.insert(onboardingProgressSchema).values({
        orgId: orgId!,
        step: 'post_signup',
        completed: true,
        data: {},
        completedAt: new Date(),
      });
    }

    if (userId) {
      await syncOnboardingCompleteToClerkUser(userId, orgId!);
    }

    const res = NextResponse.json({ ok: true }, { status: 200 });
    // 30 day expiry cookie - middleware fast path for pre-existing users.
    res.cookies.set(`np_onb_${orgId}`, '1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (err) {
    console.error('[onboarding/complete] Failed:', err);
    return NextResponse.json({ error: 'Failed to mark onboarding complete' }, { status: 500 });
  }
}
