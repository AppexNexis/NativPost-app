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

import { clerkClient } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { sendWelcomeEmail } from '@/lib/email';
import { syncOnboardingCompleteToClerkUser } from '@/lib/sync-clerk-metadata';
import { getDb } from '@/libs/DB';
import { brandProfileSchema, onboardingProgressSchema } from '@/models/Schema';

export const dynamic = 'force-dynamic';

/**
 * Look up who to greet, then send the welcome email.
 *
 * Best-effort by design: every lookup falls back to something sensible rather
 * than aborting. A welcome addressed to "there" is a far better outcome than
 * no welcome at all, which is what shipped before this was wired up.
 */
async function sendWelcomeForOrg(userId: string, orgId: string): Promise<void> {
  const clerk = await clerkClient();
  const user = await clerk.users.getUser(userId);
  const to = user.primaryEmailAddress?.emailAddress
    ?? user.emailAddresses[0]?.emailAddress;

  if (!to) {
    console.warn('[onboarding/complete] No email on user — skipping welcome');
    return;
  }

  const db = await getDb();
  const [brand] = await db
    .select({ brandName: brandProfileSchema.brandName })
    .from(brandProfileSchema)
    .where(eq(brandProfileSchema.orgId, orgId))
    .limit(1);

  await sendWelcomeEmail(
    to,
    user.firstName?.trim() || 'there',
    brand?.brandName ?? null,
  );
}

export async function POST() {
  const { error, orgId, userId } = await getAuthContext();
  if (error) {
    return error;
  }

  const db = await getDb();

  try {
    const [existing] = await db
      .select({ id: onboardingProgressSchema.id, completed: onboardingProgressSchema.completed })
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

    // Welcome email. Sent here rather than at signup: onboarding is where the
    // brand profile actually gets created, so this is the first moment the
    // email can name the brand and link to steps the account can do.
    //
    // Gated on the TRANSITION, not on completion — this endpoint is idempotent
    // and the wizard can re-post it, which would otherwise mean a second
    // welcome email every time.
    const wasAlreadyComplete = existing?.completed === true;
    if (!wasAlreadyComplete && userId) {
      // Non-blocking: a Resend outage must never fail onboarding.
      void sendWelcomeForOrg(userId, orgId!).catch(err =>
        console.error('[onboarding/complete] Welcome email failed:', err),
      );
    }

    const res = NextResponse.json({ ok: true }, { status: 200 });
    return res;
  } catch (err) {
    console.error('[onboarding/complete] Failed:', err);
    return NextResponse.json({ error: 'Failed to mark onboarding complete' }, { status: 500 });
  }
}
