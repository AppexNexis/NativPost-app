#!/usr/bin/env node
/**
 * MSI demo jobs/tasks seed / teardown — WRITES to the database.
 *
 * Populates the Ops per-account job board (/admin/msi/[id]) with a realistic
 * spread of jobs + task checklists for the existing demo managed account, so
 * the board isn't empty. Requires the demo account — run
 * `npm run msi:seed-demo-account` first.
 *
 * Teardown is scoped to the demo account's own jobs (found via the grant
 * marker), so it can never touch a real account's jobs. Deleting a job cascades
 * its tasks.
 *
 * Usage:
 *   dotenv -c production -- npx tsx scripts/msi-seed-demo-jobs.ts seed
 *   dotenv -c production -- npx tsx scripts/msi-seed-demo-jobs.ts teardown
 */

import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '../src/models/Schema';

const GRANT_MARKER = 'smoke-demo-user'; // the demo account's grant
const DAY = 86_400_000;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    'DATABASE_URL is required. Run with: dotenv -c production -- npx tsx scripts/msi-seed-demo-jobs.ts seed',
  );
  process.exit(1);
}

type Db = ReturnType<typeof drizzle<typeof schema>>;

const mode = (process.argv[2] ?? 'seed');

type TaskDef = { taskType: string; status: string; sequence: number };
type JobDef = {
  jobType: string;
  state: string;
  priority: number;
  attempts: number;
  maxAttempts: number;
  slaDueAt: Date | null;
  failureReason?: string;
  completedAt?: Date | null;
  tasks: TaskDef[];
};

function jobDefs(now: number): JobDef[] {
  const past = new Date(now - 2 * DAY);
  const future = new Date(now + DAY);
  return [
    {
      jobType: 'create_account',
      state: 'completed',
      priority: 1,
      attempts: 0,
      maxAttempts: 3,
      slaDueAt: null,
      completedAt: past,
      tasks: [
        { taskType: 'create_account', status: 'done', sequence: 0 },
        { taskType: 'upload_avatar', status: 'done', sequence: 1 },
        { taskType: 'write_bio', status: 'done', sequence: 2 },
        { taskType: 'prepare_first_posts', status: 'done', sequence: 3 },
        { taskType: 'qa_review', status: 'done', sequence: 4 },
      ],
    },
    {
      jobType: 'publish_post',
      state: 'peer_review',
      priority: 0,
      attempts: 0,
      maxAttempts: 3,
      slaDueAt: future,
      tasks: [
        { taskType: 'render_video', status: 'done', sequence: 0 },
        { taskType: 'upload_post', status: 'in_progress', sequence: 1 },
      ],
    },
    {
      jobType: 'update_profile',
      state: 'failed',
      priority: 0,
      attempts: 1,
      maxAttempts: 3,
      slaDueAt: past,
      failureReason: 'transient upload error',
      tasks: [{ taskType: 'update_bio', status: 'pending', sequence: 0 }],
    },
    {
      // Queued → a worker tick allocates an operator+device (queued → assigned,
      // needs seeded inventory via `msi:seed-demo`) then starts it through the
      // Execution Layer adapter (manual → pending_operator).
      jobType: 'update_bio',
      state: 'queued',
      priority: 2,
      attempts: 0,
      maxAttempts: 3,
      slaDueAt: future,
      tasks: [{ taskType: 'update_bio', status: 'pending', sequence: 0 }],
    },
  ];
}

async function findDemoAccount(db: Db) {
  const grants = await db
    .select({ id: schema.authorizationGrantSchema.id })
    .from(schema.authorizationGrantSchema)
    .where(eq(schema.authorizationGrantSchema.signedByUserId, GRANT_MARKER));
  const grantIds = grants.map(g => g.id);
  if (grantIds.length === 0) {
    return null;
  }
  const [account] = await db
    .select({
      id: schema.managedAccountSchema.id,
      orgId: schema.managedAccountSchema.orgId,
      displayName: schema.managedAccountSchema.displayName,
    })
    .from(schema.managedAccountSchema)
    .where(inArray(schema.managedAccountSchema.authorizationGrantId, grantIds))
    .limit(1);
  return account ?? null;
}

async function teardownJobs(db: Db, accountId: string) {
  // Deleting a job cascades its tasks (msi_task.job_id ON DELETE CASCADE).
  const removed = await db
    .delete(schema.msiJobSchema)
    .where(eq(schema.msiJobSchema.managedAccountId, accountId))
    .returning({ id: schema.msiJobSchema.id });
  return removed.length;
}

async function seed(db: Db, account: { id: string; orgId: string; displayName: string | null }) {
  await teardownJobs(db, account.id); // idempotent re-seed

  const defs = jobDefs(Date.now());
  let taskCount = 0;
  for (const jd of defs) {
    const [job] = await db
      .insert(schema.msiJobSchema)
      .values({
        orgId: account.orgId,
        managedAccountId: account.id,
        jobType: jd.jobType,
        state: jd.state,
        priority: jd.priority,
        attempts: jd.attempts,
        maxAttempts: jd.maxAttempts,
        slaDueAt: jd.slaDueAt,
        failureReason: jd.failureReason,
        completedAt: jd.completedAt,
      })
      .returning({ id: schema.msiJobSchema.id });

    await db.insert(schema.msiTaskSchema).values(
      jd.tasks.map(t => ({
        jobId: job!.id,
        taskType: t.taskType,
        status: t.status,
        sequence: t.sequence,
      })),
    );
    taskCount += jd.tasks.length;
  }

  console.log(`Seeded ${defs.length} jobs + ${taskCount} tasks for ${account.displayName ?? account.id}.`);
  console.log(`\nOpen /admin/msi/${account.id} (team org → Admin ops → Managed Social) to see the board.`);
  console.log('Clean up: npm run msi:teardown-demo-jobs');
}

async function main() {
  if (mode !== 'seed' && mode !== 'teardown') {
    console.error(`Unknown mode "${mode}". Use "seed" or "teardown".`);
    process.exit(1);
  }

  const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
  const db: Db = drizzle(pool, { schema });

  try {
    const account = await findDemoAccount(db);
    if (!account) {
      if (mode === 'teardown') {
        console.log('No demo account found — nothing to remove.');
        return;
      }
      console.error('No demo account. Run: npm run msi:seed-demo-account');
      process.exit(1);
    }

    if (mode === 'seed') {
      await seed(db, account);
    } else {
      const removed = await teardownJobs(db, account.id);
      console.log(`Teardown complete: removed ${removed} job(s) (tasks cascade).`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Seed/teardown failed:', err);
  process.exit(1);
});
