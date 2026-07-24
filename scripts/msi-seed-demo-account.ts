#!/usr/bin/env node
/**
 * MSI demo managed account seed / teardown — WRITES to the database.
 *
 * Opt-in helper to populate the Infrastructure grid + timeline with one
 * realistic managed account mid-pipeline (state: customer_review), plus a
 * built-out activity timeline. It respects the compliance spine: the account is
 * tied to a real brand and an active authorization grant.
 *
 * To appear in YOUR dashboard the account must live in your org. By default it
 * reuses the first existing brand_profile (and its org); pass --org / --brand to
 * target explicitly. If no brand exists it creates a marked demo brand.
 *
 * Everything it creates carries the markers below and is fully removed by
 * `teardown`. It seeds NO credentials and performs NO platform operations.
 *
 * Usage:
 *   dotenv -c production -- npx tsx scripts/msi-seed-demo-account.ts seed
 *   dotenv -c production -- npx tsx scripts/msi-seed-demo-account.ts seed --org=org_123
 *   dotenv -c production -- npx tsx scripts/msi-seed-demo-account.ts teardown
 *   dotenv -c production -- npx tsx scripts/msi-seed-demo-account.ts sweep-drafts
 *
 * `sweep-drafts` removes the pending orders + 'msi-grant-v1' grants left by the
 * configure/order flow (POST /api/msi/orders) — it never touches a grant a real
 * managed account uses.
 */

import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '../src/models/Schema';

// Markers so teardown only ever removes what seed created.
const GRANT_MARKER = 'smoke-demo-user'; // authorization_grant.signed_by_user_id
const DEMO_BRAND_NAME = 'SMOKE-DEMO Brand'; // only demo brands we create
const DRAFT_GRANT_VERSION = 'msi-grant-v1'; // grants minted by the configure/order flow

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    'DATABASE_URL is required. Run with: dotenv -c production -- npx tsx scripts/msi-seed-demo-account.ts seed',
  );
  process.exit(1);
}

type Db = ReturnType<typeof drizzle<typeof schema>>;

const args = process.argv.slice(2);
const mode = args.find(a => !a.startsWith('--')) ?? 'seed';
function flag(name: string): string | undefined {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : undefined;
}

async function teardownRows(db: Db) {
  const demoGrants = await db
    .select({ id: schema.authorizationGrantSchema.id })
    .from(schema.authorizationGrantSchema)
    .where(eq(schema.authorizationGrantSchema.signedByUserId, GRANT_MARKER));
  const grantIds = demoGrants.map(g => g.id);

  let accounts = 0;
  if (grantIds.length > 0) {
    // Deleting the account cascades its activity-log timeline.
    const del = await db
      .delete(schema.managedAccountSchema)
      .where(inArray(schema.managedAccountSchema.authorizationGrantId, grantIds))
      .returning({ id: schema.managedAccountSchema.id });
    accounts = del.length;
    await db
      .delete(schema.authorizationGrantSchema)
      .where(inArray(schema.authorizationGrantSchema.id, grantIds));
  }

  // Only removes demo brands we created — never a real brand.
  const brands = await db
    .delete(schema.brandProfileSchema)
    .where(eq(schema.brandProfileSchema.brandName, DEMO_BRAND_NAME))
    .returning({ id: schema.brandProfileSchema.id });

  return { accounts, grants: grantIds.length, brands: brands.length };
}

/**
 * Sweep the DRAFT artifacts left by the configure/order flow (POST
 * /api/msi/orders): pending orders + their 'msi-grant-v1' grants. Defensive:
 * never deletes a grant that a real managed account references.
 */
async function sweepDrafts(db: Db) {
  // The configure flow is the only producer of 'pending' orders today.
  const orders = await db
    .delete(schema.msiProvisioningOrderSchema)
    .where(eq(schema.msiProvisioningOrderSchema.status, 'pending'))
    .returning({ id: schema.msiProvisioningOrderSchema.id });

  // Grant ids actually in use by a managed account — never delete these.
  const referenced = await db
    .select({ id: schema.managedAccountSchema.authorizationGrantId })
    .from(schema.managedAccountSchema);
  const referencedIds = referenced.map(r => r.id);

  const grantWhere = referencedIds.length > 0
    ? and(
        eq(schema.authorizationGrantSchema.grantVersion, DRAFT_GRANT_VERSION),
        notInArray(schema.authorizationGrantSchema.id, referencedIds),
      )
    : eq(schema.authorizationGrantSchema.grantVersion, DRAFT_GRANT_VERSION);

  const grants = await db
    .delete(schema.authorizationGrantSchema)
    .where(grantWhere)
    .returning({ id: schema.authorizationGrantSchema.id });

  return { orders: orders.length, grants: grants.length };
}

async function resolveBrand(db: Db, argOrg?: string, argBrand?: string) {
  if (argBrand) {
    const [b] = await db
      .select()
      .from(schema.brandProfileSchema)
      .where(eq(schema.brandProfileSchema.id, argBrand))
      .limit(1);
    if (!b) {
      throw new Error(`brand_profile ${argBrand} not found`);
    }
    return { orgId: b.orgId, brandId: b.id, brandName: b.brandName, created: false };
  }

  const existing = argOrg
    ? await db
        .select()
        .from(schema.brandProfileSchema)
        .where(eq(schema.brandProfileSchema.orgId, argOrg))
        .limit(1)
    : await db.select().from(schema.brandProfileSchema).limit(1);

  if (existing[0]) {
    const b = existing[0];
    return { orgId: b.orgId, brandId: b.id, brandName: b.brandName, created: false };
  }

  // No brand exists → create a marked demo brand. Needs an org.
  let orgId = argOrg;
  if (!orgId) {
    const orgs = await db
      .select({ id: schema.organizationSchema.id })
      .from(schema.organizationSchema)
      .limit(2);
    if (orgs.length === 1 && orgs[0]) {
      orgId = orgs[0].id;
    } else {
      throw new Error(
        'No brand_profile found and the org is ambiguous. Pass --org=<clerk_org_id>.',
      );
    }
  }
  const [b] = await db
    .insert(schema.brandProfileSchema)
    .values({ orgId, brandName: DEMO_BRAND_NAME, industry: 'Home & wellness' })
    .returning();
  return { orgId, brandId: b!.id, brandName: b!.brandName, created: true };
}

function demoTimeline(accountId: string, now: Date) {
  const DAY = 86_400_000;
  const at = (days: number, mins = 0) =>
    new Date(now.getTime() - days * DAY + mins * 60_000);
  const steps: { action: string; actorType: string; occurredAt: Date }[] = [
    { action: 'account_ordered', actorType: 'system', occurredAt: at(5) },
    { action: 'authorization_signed', actorType: 'customer', occurredAt: at(5, 2) },
    { action: 'payment_received', actorType: 'system', occurredAt: at(5, 4) },
    { action: 'operator_assigned', actorType: 'system', occurredAt: at(4) },
    { action: 'profile_created', actorType: 'operator', occurredAt: at(3) },
    { action: 'bio_added', actorType: 'operator', occurredAt: at(3, 60) },
    { action: 'first_posts_prepared', actorType: 'operator', occurredAt: at(2) },
    { action: 'qa_passed', actorType: 'operator', occurredAt: at(1) },
    { action: 'review_started', actorType: 'system', occurredAt: at(1, 60) },
  ];
  return steps.map(s => ({
    managedAccountId: accountId,
    actorType: s.actorType,
    action: s.action,
    detail: {},
    occurredAt: s.occurredAt,
  }));
}

async function seed(db: Db) {
  await teardownRows(db); // clean slate → idempotent re-seed

  const brand = await resolveBrand(db, flag('org'), flag('brand'));

  const [grant] = await db
    .insert(schema.authorizationGrantSchema)
    .values({
      orgId: brand.orgId,
      brandProfileId: brand.brandId,
      grantVersion: 'smoke-demo-v1',
      signedByUserId: GRANT_MARKER,
      scope: { platforms: ['tiktok'], countries: ['US'] },
      status: 'active',
    })
    .returning();

  const [account] = await db
    .insert(schema.managedAccountSchema)
    .values({
      orgId: brand.orgId,
      brandProfileId: brand.brandId,
      authorizationGrantId: grant!.id,
      platform: 'tiktok',
      country: 'US',
      niche: 'Home wellness',
      displayName: '@demo_home_wellness',
      handlePreferences: ['@demo_home_wellness', '@demo_homewellness_us'],
      lifecycleState: 'customer_review',
    })
    .returning();

  await db
    .insert(schema.msiActivityLogSchema)
    .values(demoTimeline(account!.id, new Date()));

  console.log('Seeded demo managed account:');
  console.log(`  org:     ${brand.orgId}`);
  console.log(`  brand:   ${brand.brandName}${brand.created ? ' (created)' : ' (reused)'}`);
  console.log(`  account: ${account!.id} — @demo_home_wellness · US TikTok · state customer_review`);
  console.log('  timeline: 9 events (order → ready for review)');
  console.log('\nOpen /dashboard/infrastructure in that org to see the card + timeline.');
  console.log('If it does not appear, the account is in a different org — re-run with --org=<your_clerk_org_id>.');
  console.log('Clean up: npm run msi:teardown-demo-account');
}

async function main() {
  if (mode !== 'seed' && mode !== 'teardown' && mode !== 'sweep-drafts') {
    console.error(
      `Unknown mode "${mode}". Use "seed", "teardown", or "sweep-drafts".`,
    );
    process.exit(1);
  }

  const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
  const db = drizzle(pool, { schema });

  try {
    if (mode === 'seed') {
      await seed(db);
    } else if (mode === 'sweep-drafts') {
      const swept = await sweepDrafts(db);
      console.log(
        `Draft sweep complete: removed ${swept.orders} pending order(s), ${swept.grants} configure-flow grant(s).`,
      );
    } else {
      const removed = await teardownRows(db);
      console.log(
        `Teardown complete: removed ${removed.accounts} account(s), ${removed.grants} grant(s), ${removed.brands} demo brand(s).`,
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
