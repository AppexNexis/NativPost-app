#!/usr/bin/env node
/**
 * MSI review-flow smoke test — exercises BOTH review transitions against the
 * real DB using the SAME state machine as POST /api/msi/accounts/[id]/review,
 * then cleans up after itself. Net-neutral: the demo account is left exactly as
 * seeded (customer_review), with its original timeline.
 *
 * Requires the demo account — run `npm run msi:seed-demo-account` first.
 *
 * Usage:
 *   dotenv -c production -- npx tsx scripts/msi-review-smoke.ts
 */

import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { buildActivityEvent } from '../src/lib/msi/audit';
import { transitionAccount } from '../src/lib/msi/lifecycle';
import * as schema from '../src/models/Schema';

const GRANT_MARKER = 'smoke-demo-user';
const DAY = 86_400_000;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    'DATABASE_URL is required. Run with: dotenv -c production -- npx tsx scripts/msi-review-smoke.ts',
  );
  process.exit(1);
}

type Db = ReturnType<typeof drizzle<typeof schema>>;

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
  const db: Db = drizzle(pool, { schema });

  try {
    const grants = await db
      .select({ id: schema.authorizationGrantSchema.id })
      .from(schema.authorizationGrantSchema)
      .where(eq(schema.authorizationGrantSchema.signedByUserId, GRANT_MARKER));
    const grantIds = grants.map(g => g.id);
    if (grantIds.length === 0) {
      console.error('No demo account found. Run: npm run msi:seed-demo-account');
      process.exit(1);
    }

    const [account] = await db
      .select()
      .from(schema.managedAccountSchema)
      .where(inArray(schema.managedAccountSchema.authorizationGrantId, grantIds))
      .limit(1);
    if (!account) {
      console.error('No demo managed account. Run: npm run msi:seed-demo-account');
      process.exit(1);
    }
    const id = account.id;

    const countTimeline = async () =>
      (
        await db
          .select({ id: schema.msiActivityLogSchema.id })
          .from(schema.msiActivityLogSchema)
          .where(eq(schema.msiActivityLogSchema.managedAccountId, id))
      ).length;

    const setState = (state: string, liveAt: Date | null = null) =>
      db
        .update(schema.managedAccountSchema)
        .set({ lifecycleState: state, liveAt })
        .where(eq(schema.managedAccountSchema.id, id));

    const initialState = account.lifecycleState;
    const initialCount = await countTimeline();
    console.log(`Demo account ${id} (${account.displayName ?? '—'})`);
    console.log(`  initial state: ${initialState}, timeline events: ${initialCount}\n`);

    if (initialState !== 'customer_review') {
      await setState('customer_review');
      console.log(`  reset ${initialState} → customer_review to start\n`);
    }

    const reviewIds: string[] = [];
    const activityIds: string[] = [];
    const now = new Date();

    // 1) request_changes  (customer_review → revisions)
    const s1 = transitionAccount('customer_review', 'revisions');
    await setState(s1);
    const [rev1] = await db
      .insert(schema.msiAccountReviewSchema)
      .values({
        managedAccountId: id,
        windowOpensAt: now,
        windowClosesAt: new Date(now.getTime() + 3 * DAY),
        status: 'changes_requested',
        requestedChanges: [{ field: 'Bio', note: 'smoke test' }],
        respondedAt: now,
        respondedByUserId: GRANT_MARKER,
      })
      .returning({ id: schema.msiAccountReviewSchema.id });
    const [act1] = await db
      .insert(schema.msiActivityLogSchema)
      .values(
        buildActivityEvent({
          managedAccountId: id,
          actorType: 'customer',
          actorId: GRANT_MARKER,
          action: 'changes_requested',
          detail: { count: 1 },
        }),
      )
      .returning({ id: schema.msiActivityLogSchema.id });
    if (rev1) {
      reviewIds.push(rev1.id);
    }
    if (act1) {
      activityIds.push(act1.id);
    }
    console.log(`  request_changes → state '${s1}'  + review 'changes_requested' + timeline event  ✓`);
    await setState('customer_review');

    // 2) approve  (customer_review → live)
    const s2 = transitionAccount('customer_review', 'live', { customerApproved: true });
    await setState(s2, now);
    const [rev2] = await db
      .insert(schema.msiAccountReviewSchema)
      .values({
        managedAccountId: id,
        windowOpensAt: now,
        windowClosesAt: now,
        status: 'approved',
        respondedAt: now,
        respondedByUserId: GRANT_MARKER,
      })
      .returning({ id: schema.msiAccountReviewSchema.id });
    const [act2] = await db
      .insert(schema.msiActivityLogSchema)
      .values(
        buildActivityEvent({
          managedAccountId: id,
          actorType: 'customer',
          actorId: GRANT_MARKER,
          action: 'customer_approved',
        }),
      )
      .returning({ id: schema.msiActivityLogSchema.id });
    if (rev2) {
      reviewIds.push(rev2.id);
    }
    if (act2) {
      activityIds.push(act2.id);
    }
    console.log(`  approve         → state '${s2}'  + review 'approved' + timeline event  ✓`);

    // Clean up everything this smoke wrote; reset to customer_review.
    if (activityIds.length > 0) {
      await db
        .delete(schema.msiActivityLogSchema)
        .where(inArray(schema.msiActivityLogSchema.id, activityIds));
    }
    if (reviewIds.length > 0) {
      await db
        .delete(schema.msiAccountReviewSchema)
        .where(inArray(schema.msiAccountReviewSchema.id, reviewIds));
    }
    await setState('customer_review');

    const finalCount = await countTimeline();
    console.log(
      `\n  cleaned up → state customer_review, timeline events ${finalCount} (was ${initialCount})`,
    );
    console.log(
      finalCount === initialCount
        ? '\nReview flow OK — both transitions valid; DB left exactly as seeded.'
        : '\nWARNING: timeline count changed — inspect for leftover rows.',
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Review smoke failed:', err);
  process.exit(1);
});
