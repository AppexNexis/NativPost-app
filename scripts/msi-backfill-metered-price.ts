#!/usr/bin/env node
/**
 * Backfill the $1.50/post METERED price onto existing MSI subscriptions.
 *
 * New MSI orders get the metered item automatically (the order-checkout route
 * adds it as a 2nd line item when STRIPE_MSI_POST_PRICE_ID is set). This script
 * covers subscriptions created BEFORE that shipped: it finds every fulfilled
 * MSI order's Stripe subscription and adds the metered item if missing.
 *
 * It doubles as a CONFIG CHECK: it refuses to run unless the configured price is
 * genuinely metered (usage_type=metered + linked to a meter). A licensed price
 * would bill a flat fee and silently ignore usage — so we hard-fail on it.
 *
 * DRY-RUN BY DEFAULT. It only mutates Stripe when you pass --apply.
 *
 * Usage:
 *   dotenv -c production -- npx tsx scripts/msi-backfill-metered-price.ts            # dry-run
 *   dotenv -c production -- npx tsx scripts/msi-backfill-metered-price.ts --apply    # do it
 *   ... --price=price_123   # override STRIPE_MSI_POST_PRICE_ID
 */

import { and, inArray, isNotNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import Stripe from 'stripe';

import * as schema from '../src/models/Schema';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
// Source MSI subscriptions from Stripe (metadata.type=msi_order) instead of the
// DB. Use when the DB isn't reachable locally — needs only the Stripe key.
const FROM_STRIPE = args.includes('--from-stripe');
function flag(name: string): string | undefined {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : undefined;
}

const DATABASE_URL = process.env.DATABASE_URL;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const PRICE_ID = flag('price') || process.env.STRIPE_MSI_POST_PRICE_ID;

// MSI subscriptions in these order states are live and should carry the meter.
const LIVE_ORDER_STATES = ['paid', 'fulfilling', 'fulfilled'];
// Subscriptions in these Stripe states are billable; skip the rest (canceled).
const BILLABLE_SUB_STATES = new Set(['active', 'trialing', 'past_due', 'unpaid']);

function die(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

// Source MSI subscription ids → orgId from fulfilled orders in the DB.
async function sourceFromDb(): Promise<Map<string, string>> {
  if (!DATABASE_URL) {
    die('DATABASE_URL is required for DB sourcing. Pass --from-stripe to source from Stripe instead.');
  }
  const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
  const db = drizzle(pool, { schema });
  try {
    const orders = await db
      .select({
        orgId: schema.msiProvisioningOrderSchema.orgId,
        subscriptionId: schema.msiProvisioningOrderSchema.stripeSubscriptionId,
      })
      .from(schema.msiProvisioningOrderSchema)
      .where(
        and(
          inArray(schema.msiProvisioningOrderSchema.status, LIVE_ORDER_STATES),
          isNotNull(schema.msiProvisioningOrderSchema.stripeSubscriptionId),
        ),
      );
    const map = new Map<string, string>();
    for (const o of orders) {
      if (o.subscriptionId) {
        map.set(o.subscriptionId, o.orgId);
      }
    }
    return map;
  } finally {
    await pool.end();
  }
}

// Source MSI subscriptions directly from Stripe (no DB): every MSI subscription
// carries metadata.type = 'msi_order' (set by the order-checkout route).
async function sourceFromStripe(stripe: Stripe): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for await (const sub of stripe.subscriptions.list({ status: 'all', limit: 100 })) {
    if (sub.metadata?.type === 'msi_order') {
      map.set(sub.id, sub.metadata.orgId ?? 'unknown');
    }
  }
  return map;
}

async function main() {
  if (!FROM_STRIPE && !DATABASE_URL) {
    die('DATABASE_URL is required (or pass --from-stripe to source subscriptions from Stripe).');
  }
  if (!STRIPE_SECRET_KEY) {
    die('STRIPE_SECRET_KEY is required.');
  }
  if (!PRICE_ID) {
    die('No price id. Set STRIPE_MSI_POST_PRICE_ID or pass --price=price_...');
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);

  // --- Config gate: the price MUST be metered + meter-linked ---------------
  const price = await stripe.prices.retrieve(PRICE_ID).catch(() => null);
  if (!price) {
    die(`Price ${PRICE_ID} not found in this Stripe account (live vs test key?).`);
  }
  const rec = price.recurring;
  if (!rec || rec.usage_type !== 'metered' || !rec.meter) {
    die(
      `Price ${PRICE_ID} is NOT a metered price.\n`
      + `  usage_type: ${rec?.usage_type ?? '(none)'} (need "metered")\n`
      + `  meter:      ${rec?.meter ?? '(none)'} (need a meter id)\n`
      + `Recreate it as Usage-based + linked to the Managed Posts meter, then use `
      + `that price id. A licensed price would bill a flat fee and ignore usage.`,
    );
  }
  console.log('✓ Price is metered:');
  console.log(`    id:     ${price.id}`);
  console.log(`    amount: $${((price.unit_amount ?? 0) / 100).toFixed(2)} / unit`);
  console.log(`    meter:  ${rec.meter}`);
  console.log(`    mode:   ${APPLY ? 'APPLY (will mutate Stripe)' : 'DRY-RUN (no changes)'}`);
  console.log('');

  // --- Collect the MSI subscriptions to check ----------------------------
  console.log(`Sourcing subscriptions from ${FROM_STRIPE ? 'Stripe (metadata)' : 'the database'}...`);
  const subToOrg = FROM_STRIPE
    ? await sourceFromStripe(stripe)
    : await sourceFromDb();

  if (subToOrg.size === 0) {
    console.log('No live MSI subscriptions found. Nothing to backfill.');
    return;
  }
  console.log(`Found ${subToOrg.size} MSI subscription(s) to check.\n`);

  let added = 0;
  let already = 0;
  let skippedCanceled = 0;
  let errors = 0;

  for (const [subId, orgId] of subToOrg) {
    const label = `${subId} (org ${orgId})`;
    let sub: Stripe.Subscription;
    try {
      sub = await stripe.subscriptions.retrieve(subId);
    } catch {
      console.log(`  ✖ ${label}: not found in Stripe — skipped`);
      errors += 1;
      continue;
    }

    if (!BILLABLE_SUB_STATES.has(sub.status)) {
      console.log(`  · ${label}: status "${sub.status}" — skipped (not billable)`);
      skippedCanceled += 1;
      continue;
    }

    const hasMeteredItem = sub.items.data.some(it => it.price.id === PRICE_ID);
    if (hasMeteredItem) {
      console.log(`  = ${label}: already has the metered item`);
      already += 1;
      continue;
    }

    if (!APPLY) {
      console.log(`  + ${label}: WOULD add metered item`);
      added += 1;
      continue;
    }

    try {
      // Metered item — no quantity (usage drives it); no proration.
      await stripe.subscriptionItems.create({
        subscription: subId,
        price: PRICE_ID,
        proration_behavior: 'none',
      });
      console.log(`  + ${label}: added metered item ✓`);
      added += 1;
    } catch (err) {
      console.log(`  ✖ ${label}: failed to add item — ${(err as Error).message}`);
      errors += 1;
    }
  }

  console.log('\n=== Summary ===');
  console.log(`  ${APPLY ? 'Added' : 'Would add'}: ${added}`);
  console.log(`  Already had it:  ${already}`);
  console.log(`  Skipped (canceled/non-billable): ${skippedCanceled}`);
  console.log(`  Errors:          ${errors}`);
  if (!APPLY && added > 0) {
    console.log('\nRe-run with --apply to make these changes.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
