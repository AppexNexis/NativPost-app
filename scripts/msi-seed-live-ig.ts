#!/usr/bin/env node
/**
 * MSI LIVE Instagram test account seed / teardown — WRITES to the database.
 *
 * Bypasses the configure → payment → provisioning flow: it drops a fully
 * provisioned, LIVE, `official_api` Instagram managed account straight into your
 * org so you can jump to capturing credentials + testing a real publish.
 *
 * It creates (all marker-scoped, fully removed by `teardown`):
 *   - an active authorization_grant (instagram / US)
 *   - a managed_account: instagram · US · execution_strategy=official_api ·
 *     lifecycle_state=live
 *   - a linked social_account (accountType=managed, no OAuth tokens) so it is a
 *     publish target
 *   - (default) a content_item (single image) + a `publish_post` msi_job in
 *     state `assigned`, so ONE worker tick will execute the publish
 *
 * It seeds NO credentials and performs NO platform calls — you capture the IG
 * token via the Ops vault, then trigger the worker.
 *
 * Usage:
 *   dotenv -c production -- npx tsx scripts/msi-seed-live-ig.ts seed
 *   dotenv -c production -- npx tsx scripts/msi-seed-live-ig.ts seed --org=org_123
 *   dotenv -c production -- npx tsx scripts/msi-seed-live-ig.ts seed --image=https://cdn/you/photo.jpg
 *   dotenv -c production -- npx tsx scripts/msi-seed-live-ig.ts seed --no-job   (account only)
 *   dotenv -c production -- npx tsx scripts/msi-seed-live-ig.ts teardown
 */

import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '../src/models/Schema';

// Markers so teardown only ever removes what this script created.
const GRANT_MARKER = 'live-ig-test-user'; // authorization_grant.signed_by_user_id
const CONTENT_MARKER = 'LIVE-IG-TEST'; // content_item.topic
const BRAND_MARKER = 'LIVE-IG-TEST Brand'; // only a demo brand we create for an org with none
const HANDLE = '@nativpost_ig_test';
// A publicly reachable JPEG is REQUIRED for IG. Replace via --image= with your
// own hosted image if this placeholder is blocked.
const DEFAULT_IMAGE = 'https://picsum.photos/1080';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required. Run with: dotenv -c production -- npx tsx scripts/msi-seed-live-ig.ts seed');
  process.exit(1);
}

type Db = ReturnType<typeof drizzle<typeof schema>>;

const args = process.argv.slice(2);
const mode = args.find(a => !a.startsWith('--')) ?? 'seed';
function flag(name: string): string | undefined {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : undefined;
}
const withJob = !args.includes('--no-job');

async function teardownRows(db: Db) {
  const grants = await db
    .select({ id: schema.authorizationGrantSchema.id })
    .from(schema.authorizationGrantSchema)
    .where(eq(schema.authorizationGrantSchema.signedByUserId, GRANT_MARKER));
  const grantIds = grants.map(g => g.id);

  let accounts = 0;
  let socials = 0;
  if (grantIds.length > 0) {
    const accts = await db
      .select({ id: schema.managedAccountSchema.id, socialAccountId: schema.managedAccountSchema.socialAccountId })
      .from(schema.managedAccountSchema)
      .where(inArray(schema.managedAccountSchema.authorizationGrantId, grantIds));
    const socialIds = accts.map(a => a.socialAccountId).filter((x): x is string => Boolean(x));

    // Deleting the account cascades its msi_job/msi_task + activity timeline.
    const delAccts = await db
      .delete(schema.managedAccountSchema)
      .where(inArray(schema.managedAccountSchema.authorizationGrantId, grantIds))
      .returning({ id: schema.managedAccountSchema.id });
    accounts = delAccts.length;

    if (socialIds.length > 0) {
      const delSoc = await db
        .delete(schema.socialAccountSchema)
        .where(inArray(schema.socialAccountSchema.id, socialIds))
        .returning({ id: schema.socialAccountSchema.id });
      socials = delSoc.length;
    }

    await db.delete(schema.authorizationGrantSchema).where(inArray(schema.authorizationGrantSchema.id, grantIds));
  }

  // Marker-scoped content items (never touches real content).
  const content = await db
    .delete(schema.contentItemSchema)
    .where(eq(schema.contentItemSchema.topic, CONTENT_MARKER))
    .returning({ id: schema.contentItemSchema.id });

  // Only demo brands WE created (exact marker name) — never a real brand.
  await db
    .delete(schema.brandProfileSchema)
    .where(eq(schema.brandProfileSchema.brandName, BRAND_MARKER));

  return { accounts, grants: grantIds.length, socials, content: content.length };
}

async function resolveBrand(db: Db, argOrg?: string, argBrand?: string) {
  if (argBrand) {
    const [b] = await db.select().from(schema.brandProfileSchema).where(eq(schema.brandProfileSchema.id, argBrand)).limit(1);
    if (!b) {
      throw new Error(`brand_profile ${argBrand} not found`);
    }
    return { orgId: b.orgId, brandId: b.id, brandName: b.brandName };
  }
  const rows = argOrg
    ? await db.select().from(schema.brandProfileSchema).where(eq(schema.brandProfileSchema.orgId, argOrg)).limit(1)
    : await db.select().from(schema.brandProfileSchema).limit(1);
  if (rows[0]) {
    return { orgId: rows[0].orgId, brandId: rows[0].id, brandName: rows[0].brandName };
  }
  // No brand in the target org → create a marked one (teardown removes it).
  if (argOrg) {
    const [b] = await db
      .insert(schema.brandProfileSchema)
      .values({ orgId: argOrg, brandName: BRAND_MARKER, industry: 'Home & wellness' })
      .returning();
    return { orgId: argOrg, brandId: b!.id, brandName: b!.brandName };
  }
  throw new Error('No brand_profile found. Pass --org=<clerk_org_id> (it will create a demo brand) or --brand=<id>.');
}

async function seed(db: Db) {
  await teardownRows(db); // idempotent re-seed
  const brand = await resolveBrand(db, flag('org'), flag('brand'));
  const image = flag('image') ?? DEFAULT_IMAGE;

  const [grant] = await db
    .insert(schema.authorizationGrantSchema)
    .values({
      orgId: brand.orgId,
      brandProfileId: brand.brandId,
      grantVersion: 'live-ig-test-v1',
      signedByUserId: GRANT_MARKER,
      scope: { platforms: ['instagram'], countries: ['US'] },
      status: 'active',
    })
    .returning();

  const [account] = await db
    .insert(schema.managedAccountSchema)
    .values({
      orgId: brand.orgId,
      brandProfileId: brand.brandId,
      authorizationGrantId: grant!.id,
      platform: 'instagram',
      country: 'US',
      niche: 'Home wellness',
      displayName: HANDLE,
      handlePreferences: [HANDLE],
      executionStrategy: 'official_api', // ← drives the Meta client, not manual
      lifecycleState: 'live',
      liveAt: new Date(),
    })
    .returning();

  // Publish target: a managed social_account (no OAuth tokens) linked back.
  const [social] = await db
    .insert(schema.socialAccountSchema)
    .values({
      orgId: brand.orgId,
      platform: 'instagram',
      platformUsername: HANDLE,
      accountType: 'managed',
      isActive: true,
      metadata: { managedAccountId: account!.id, executionStrategy: 'official_api' },
    })
    .returning();
  await db
    .update(schema.managedAccountSchema)
    .set({ socialAccountId: social!.id })
    .where(eq(schema.managedAccountSchema.id, account!.id));

  let jobId: string | null = null;
  let contentId: string | null = null;
  if (withJob) {
    const [content] = await db
      .insert(schema.contentItemSchema)
      .values({
        orgId: brand.orgId,
        brandProfileId: brand.brandId,
        caption: 'MSI live Instagram test 🌿 #test',
        contentType: 'image',
        graphicUrls: [image],
        targetPlatforms: ['instagram'],
        status: 'approved',
        topic: CONTENT_MARKER,
      })
      .returning();
    contentId = content!.id;

    const [job] = await db
      .insert(schema.msiJobSchema)
      .values({
        orgId: brand.orgId,
        managedAccountId: account!.id,
        jobType: 'publish_post',
        contentItemId: content!.id,
        state: 'assigned', // ready for the worker to execute this tick
        priority: 0,
      })
      .returning();
    jobId = job!.id;

    await db.insert(schema.msiTaskSchema).values([
      { jobId: job!.id, taskType: 'prepare_media', sequence: 0 },
      { jobId: job!.id, taskType: 'publish', sequence: 1 },
    ]);
  }

  console.log('Seeded LIVE Instagram test account:');
  console.log(`  org:       ${brand.orgId}`);
  console.log(`  brand:     ${brand.brandName}`);
  console.log(`  account:   ${account!.id}  (${HANDLE} · US Instagram · official_api · live)`);
  console.log(`  social:    ${social!.id}  (managed publish target)`);
  if (withJob) {
    console.log(`  content:   ${contentId}  (image: ${image})`);
    console.log(`  job:       ${jobId}  (publish_post · assigned)`);
  }
  console.log('\nNext steps:');
  console.log('  1. Ops → Managed Social → Operations → open this account → Credential vault → Capture.');
  console.log('     Paste JSON:  { "accessToken": "<IG token>", "igUserId": "<IG business user id>" }');
  console.log('  2. Click "Run diagnostics" to verify token + instagram_content_publish permission.');
  if (withJob) {
    console.log('  3. Trigger the worker TWICE (init container, then confirm+publish):');
    console.log('       curl -X POST "$APP_URL/api/cron/msi-worker" -H "Authorization: Bearer $CRON_SECRET"');
    console.log('     (or run the "MSI Provisioning Worker Tick" GitHub Action — it ticks every 5 min).');
    console.log('  4. Check the IG account for the post; the job moves to peer_review, then QA-approve on the board.');
  } else {
    console.log('  3. Schedule content to this account, or re-seed without --no-job to get a ready publish job.');
  }
  console.log('\nRequires (server env): MSI_VAULT_MASTER_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MSI_VAULT_BUCKET (vault);');
  console.log('  META_APP_ID/META_APP_SECRET (token refresh); CRON_SECRET (worker).');
  console.log('Clean up: npm run msi:teardown-live-ig');
}

/**
 * Reset the account's failed/stuck publish job back to `assigned` (clearing the
 * async handle, failure, timestamps + tasks) so the worker re-runs it against
 * the current code — WITHOUT wiping the captured credentials. Test-loop helper.
 */
async function resetJobs(db: Db) {
  const override = flag('account');
  let accountIds: string[];
  if (override) {
    accountIds = [override];
  } else {
    const grants = await db
      .select({ id: schema.authorizationGrantSchema.id })
      .from(schema.authorizationGrantSchema)
      .where(eq(schema.authorizationGrantSchema.signedByUserId, GRANT_MARKER));
    if (grants.length === 0) {
      console.log('No seeded live-IG account found. Run: npm run msi:seed-live-ig');
      return;
    }
    const accts = await db
      .select({ id: schema.managedAccountSchema.id })
      .from(schema.managedAccountSchema)
      .where(inArray(schema.managedAccountSchema.authorizationGrantId, grants.map(g => g.id)));
    accountIds = accts.map(a => a.id);
  }

  // Any non-terminal publish job (failed / stuck assigned with a stale
  // startedAt / mid-flight) → back to a clean `assigned` the worker will start.
  const jobs = await db
    .select({ id: schema.msiJobSchema.id })
    .from(schema.msiJobSchema)
    .where(
      and(
        inArray(schema.msiJobSchema.managedAccountId, accountIds),
        eq(schema.msiJobSchema.jobType, 'publish_post'),
        inArray(schema.msiJobSchema.state, ['failed', 'in_progress', 'assigned', 'queued']),
      ),
    );
  if (jobs.length === 0) {
    console.log('No resettable publish jobs (already completed, or none seeded).');
    return;
  }
  const jobIds = jobs.map(j => j.id);

  await db
    .update(schema.msiJobSchema)
    .set({ state: 'assigned', executionHandle: null, failureReason: null, startedAt: null, completedAt: null, attempts: 0 })
    .where(inArray(schema.msiJobSchema.id, jobIds));
  await db
    .update(schema.msiTaskSchema)
    .set({ status: 'pending', completedAt: null, completedByRole: null, completedByUserId: null })
    .where(inArray(schema.msiTaskSchema.jobId, jobIds));

  console.log(`Reset ${jobs.length} publish job(s) to 'assigned' (credentials untouched).`);
  console.log('Now trigger the worker to re-run:');
  console.log('  curl -X POST "https://app.nativpost.com/api/cron/msi-worker" -H "Authorization: Bearer $CRON_SECRET"');
}

async function main() {
  if (mode !== 'seed' && mode !== 'teardown' && mode !== 'reset') {
    console.error(`Unknown mode "${mode}". Use "seed", "teardown", or "reset".`);
    process.exit(1);
  }
  const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
  const db = drizzle(pool, { schema });
  try {
    if (mode === 'seed') {
      await seed(db);
    } else if (mode === 'reset') {
      await resetJobs(db);
    } else {
      const removed = await teardownRows(db);
      console.log(
        `Teardown complete: removed ${removed.accounts} account(s), ${removed.socials} social link(s), ${removed.grants} grant(s), ${removed.content} content item(s).`,
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Seed/teardown failed:', err);
  process.exit(1);
});
