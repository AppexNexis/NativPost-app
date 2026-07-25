#!/usr/bin/env node
/**
 * MSI LIVE Instagram test account — READ-ONLY status. Writes nothing.
 *
 * Prints the current state of the account seeded by msi-seed-live-ig.ts so you
 * can watch it progress between worker ticks: lifecycle, whether credentials are
 * sealed, each job's state (+ async upload handle / platform post id / failure),
 * the task checklist, recent activity, and any billable event.
 *
 * Usage:
 *   dotenv -c production -- npx tsx scripts/msi-live-ig-status.ts
 *   dotenv -c production -- npx tsx scripts/msi-live-ig-status.ts --account=<uuid>
 */

import { desc, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '../src/models/Schema';

const GRANT_MARKER = 'live-ig-test-user';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required. Run with: dotenv -c production -- npx tsx scripts/msi-live-ig-status.ts');
  process.exit(1);
}

type Db = ReturnType<typeof drizzle<typeof schema>>;

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : undefined;
}

const fmt = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' }) : '—';

async function resolveAccountId(db: Db): Promise<string | null> {
  const override = flag('account');
  if (override) {
    return override;
  }
  const grants = await db
    .select({ id: schema.authorizationGrantSchema.id })
    .from(schema.authorizationGrantSchema)
    .where(eq(schema.authorizationGrantSchema.signedByUserId, GRANT_MARKER));
  if (grants.length === 0) {
    return null;
  }
  const [account] = await db
    .select({ id: schema.managedAccountSchema.id })
    .from(schema.managedAccountSchema)
    .where(inArray(schema.managedAccountSchema.authorizationGrantId, grants.map(g => g.id)))
    .orderBy(desc(schema.managedAccountSchema.updatedAt))
    .limit(1);
  return account?.id ?? null;
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
  const db = drizzle(pool, { schema });
  try {
    const accountId = await resolveAccountId(db);
    if (!accountId) {
      console.log('No seeded live-IG account found. Run: npm run msi:seed-live-ig');
      return;
    }

    const [account] = await db
      .select()
      .from(schema.managedAccountSchema)
      .where(eq(schema.managedAccountSchema.id, accountId))
      .limit(1);
    if (!account) {
      console.log(`Account ${accountId} not found.`);
      return;
    }

    console.log('=== Managed account ===');
    console.log(`  id:          ${account.id}`);
    console.log(`  handle:      ${account.displayName}`);
    console.log(`  platform:    ${account.platform} · ${account.country}`);
    console.log(`  lifecycle:   ${account.lifecycleState}`);
    console.log(`  strategy:    ${account.executionStrategy ?? '(default → manual)'}`);
    console.log(`  custody:     ${account.credentialCustody}`);
    console.log(`  health:      ${account.healthScore ?? '—'}`);
    console.log(`  publish target: ${account.socialAccountId ? `linked (${account.socialAccountId})` : 'not linked'}`);

    const [cred] = await db
      .select()
      .from(schema.msiCredentialSchema)
      .where(eq(schema.msiCredentialSchema.managedAccountId, accountId))
      .limit(1);
    console.log('\n=== Credentials (vault) ===');
    if (cred) {
      console.log(`  sealed:      yes (custody ${cred.custodyState})`);
      console.log(`  vaultRef:    ${cred.vaultRef}`);
      console.log(`  rotatedAt:   ${fmt(cred.lastRotatedAt)}`);
    } else {
      console.log('  sealed:      NO — capture via Ops → Credential vault → Capture.');
    }

    const jobs = await db
      .select()
      .from(schema.msiJobSchema)
      .where(eq(schema.msiJobSchema.managedAccountId, accountId))
      .orderBy(desc(schema.msiJobSchema.createdAt));
    console.log(`\n=== Jobs (${jobs.length}) ===`);
    const jobIds = jobs.map(j => j.id);
    const tasks = jobIds.length
      ? await db.select().from(schema.msiTaskSchema).where(inArray(schema.msiTaskSchema.jobId, jobIds))
      : [];
    for (const j of jobs) {
      console.log(`  • ${j.jobType} — ${j.state}  (attempt ${j.attempts}/${j.maxAttempts})`);
      if (j.executionHandle) {
        const short = j.executionHandle.length > 60 ? `${j.executionHandle.slice(0, 57)}…` : j.executionHandle;
        console.log(`      async handle: ${short}`);
      }
      if (j.platformPostId) {
        console.log(`      platformPostId: ${j.platformPostId}`);
      }
      if (j.failureReason) {
        console.log(`      FAILED: ${j.failureReason}`);
      }
      console.log(`      started ${fmt(j.startedAt)} · completed ${fmt(j.completedAt)}`);
      for (const t of tasks.filter(t => t.jobId === j.id).sort((a, b) => a.sequence - b.sequence)) {
        console.log(`        ${t.sequence + 1}. ${t.taskType} — ${t.status}`);
      }
    }
    if (jobs.length === 0) {
      console.log('  (none — re-seed without --no-job for a ready publish job.)');
    }

    const events = await db
      .select({
        action: schema.msiActivityLogSchema.action,
        actorType: schema.msiActivityLogSchema.actorType,
        occurredAt: schema.msiActivityLogSchema.occurredAt,
      })
      .from(schema.msiActivityLogSchema)
      .where(eq(schema.msiActivityLogSchema.managedAccountId, accountId))
      .orderBy(desc(schema.msiActivityLogSchema.occurredAt))
      .limit(8);
    console.log('\n=== Recent activity ===');
    for (const e of events) {
      console.log(`  ${fmt(e.occurredAt)}  ${e.actorType.padEnd(9)} ${e.action}`);
    }
    if (events.length === 0) {
      console.log('  (none yet)');
    }

    const billable = await db
      .select({
        platformPostId: schema.msiBillablePublishEventSchema.platformPostId,
        permalink: schema.msiBillablePublishEventSchema.permalink,
        billingPeriod: schema.msiBillablePublishEventSchema.billingPeriod,
        occurredAt: schema.msiBillablePublishEventSchema.occurredAt,
        reportedAt: schema.msiBillablePublishEventSchema.reportedAt,
      })
      .from(schema.msiBillablePublishEventSchema)
      .where(eq(schema.msiBillablePublishEventSchema.managedAccountId, accountId))
      .orderBy(desc(schema.msiBillablePublishEventSchema.occurredAt));
    console.log(`\n=== Billable publish events (${billable.length}) ===`);
    for (const b of billable) {
      console.log(`  ${b.billingPeriod}  post ${b.platformPostId ?? '—'}  · ${fmt(b.occurredAt)}  · reported ${b.reportedAt ? fmt(b.reportedAt) : 'no'}`);
    }
    if (billable.length === 0) {
      console.log('  (none yet — recorded when a publish job clears QA)');
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Status failed:', err);
  process.exit(1);
});
