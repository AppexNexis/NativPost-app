/**
 * POST /api/onboarding-progress/complete
 *
 * Called by the onboarding wizard on the final step. Writes a
 * onboarding_progress row (step=post_signup, completed=true) in the DB.
 *
 * The dashboard layout gate reads this row as its authoritative check.
 * Clerk user metadata sync is a non-critical optimisation so the
 * session token path is warm on subsequent requests.
 *
 * No cookie is set — the DB is the single source of truth that survives
 * cookie clears, new browsers, and stale Clerk session tokens.
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
    return res;
  } catch (err) {
    console.error('[onboarding/complete] Failed:', err);
    return NextResponse.json({ error: 'Failed to mark onboarding complete' }, { status: 500 });
  }
}
