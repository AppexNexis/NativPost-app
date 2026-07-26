#!/usr/bin/env node
/**
 * MSI ADD-ON billing readiness check. Read-only, Stripe-only — no DB, so it runs
 * even when the database isn't reachable locally.
 *
 * For every fixed-tier add-on in the catalog it checks that
 *   STRIPE_ADDON_PRICE_<ADDON>_<TIER>
 * is set, points at a real recurring Stripe price, and matches the tier's
 * catalog amount. Then reports whether MSI_ADDON_BILLING_ENABLED can be flipped.
 *
 * Usage:
 *   dotenv -c production -- npx tsx scripts/msi-verify-addon-billing.ts
 */

import Stripe from 'stripe';

import { ADDON_CATALOG } from '../src/lib/msi/addons';
import { addonPriceEnvKey, isAddonBillingEnabled } from '../src/lib/msi/addon-billing';

const ok = (m: string) => console.log(`  \x1B[32m✓\x1B[0m ${m}`);
const warn = (m: string) => console.log(`  \x1B[33m⚠\x1B[0m ${m}`);
const bad = (m: string) => console.log(`  \x1B[31m✗\x1B[0m ${m}`);

async function main() {
  console.log('\n=== MSI add-on billing readiness ===\n');

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) {
    bad('STRIPE_SECRET_KEY is not set.');
    process.exit(1);
  }
  const stripe = new Stripe(STRIPE_SECRET_KEY);

  let missing = 0;
  let mismatched = 0;
  let configured = 0;

  const tieredAddons = ADDON_CATALOG.filter(a => a.pricing.kind === 'fixed_tiers');

  for (const addon of tieredAddons) {
    if (addon.pricing.kind !== 'fixed_tiers') {
      continue;
    }
    console.log(`  ${addon.name}`);
    for (const tier of addon.pricing.tiers) {
      const key = addonPriceEnvKey(addon.id, tier.id);
      const priceId = process.env[key];
      if (!priceId) {
        warn(`${tier.name} ($${tier.monthlyUsd}) — ${key} not set`);
        missing += 1;
        continue;
      }
      const price = await stripe.prices.retrieve(priceId).catch(() => null);
      if (!price) {
        bad(`${tier.name} — ${key}=${priceId} not found in Stripe`);
        mismatched += 1;
        continue;
      }
      const amount = (price.unit_amount ?? 0) / 100;
      const isRecurring = price.type === 'recurring';
      if (!isRecurring) {
        bad(`${tier.name} — ${priceId} is not a recurring price`);
        mismatched += 1;
        continue;
      }
      if (amount !== tier.monthlyUsd) {
        warn(`${tier.name} — Stripe price is $${amount}/mo but catalog says $${tier.monthlyUsd}/mo`);
        mismatched += 1;
        continue;
      }
      ok(`${tier.name} — ${priceId} · $${amount}/mo`);
      configured += 1;
    }
  }

  console.log('');
  console.log(`  Configured: ${configured}   Missing: ${missing}   Issues: ${mismatched}`);
  console.log(
    `  Flag MSI_ADDON_BILLING_ENABLED: ${isAddonBillingEnabled() ? '\x1B[32mON\x1B[0m' : 'off'}`,
  );

  console.log('');
  if (mismatched > 0) {
    console.log('\x1B[31mNOT READY\x1B[0m — fix the price issues above.\n');
    process.exit(1);
  }
  if (missing > 0) {
    console.log(
      '\x1B[33mPARTIAL\x1B[0m — some tiers have no price yet. Add-ons with a missing price '
      + 'activate WITHOUT billing (safe), so you can roll out tier by tier.\n',
    );
    return;
  }
  if (!isAddonBillingEnabled()) {
    console.log('\x1B[33mALL PRICED, BILLING PAUSED\x1B[0m — set MSI_ADDON_BILLING_ENABLED=true to charge.\n');
    return;
  }
  console.log('\x1B[32mLIVE\x1B[0m — every add-on tier is priced and billing is on.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
