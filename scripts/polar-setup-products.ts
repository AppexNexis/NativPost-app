#!/usr/bin/env node
/**
 * Create every Polar product NativPost sells, in one pass.
 *
 * Polar has no separate price object — a product IS its pricing — so each plan
 * needs TWO products (monthly + yearly), plus two ad-hoc-priced products for
 * AI credit top-ups and MSI managed accounts. That's 10 products to click
 * through by hand, per environment. This does it from the plan catalog, so the
 * amounts can never drift from src/lib/plans.ts.
 *
 * IDEMPOTENT. Existing products are matched on (name, billing shape) and
 * skipped, so re-running after a partial failure only creates what's missing.
 * Nothing is ever updated or deleted.
 *
 * Usage:
 *   # Sandbox (the default, and what you almost always want)
 *   POLAR_ACCESS_TOKEN=polar_oat_… npx tsx scripts/polar-setup-products.ts
 *
 *   # Preview without writing anything
 *   … npx tsx scripts/polar-setup-products.ts --dry-run
 *
 *   # Production — refuses to run without this flag, because these products
 *   # are what real customers get charged against.
 *   … npx tsx scripts/polar-setup-products.ts --server=production --i-mean-it
 *
 * Prints the exact src/lib/plans.ts and .env lines to paste when it finishes.
 */

import { Polar } from '@polar-sh/sdk';

import { MSI_PER_ACCOUNT_USD } from '@/lib/msi/pricing';
import { VISIBLE_PLANS } from '@/lib/plans';

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : undefined;
}
const has = (name: string) => args.includes(`--${name}`);

const DRY_RUN = has('dry-run');
const server = (flag('server') ?? 'sandbox') as 'sandbox' | 'production';

if (server !== 'sandbox' && server !== 'production') {
  console.error(`Unknown --server=${server}. Use 'sandbox' or 'production'.`);
  process.exit(1);
}
// Products in production are what real cards get charged against, and Polar
// products cannot be deleted once they have orders. Make that a deliberate act.
if (server === 'production' && !has('i-mean-it') && !DRY_RUN) {
  console.error(
    'Refusing to write to PRODUCTION without --i-mean-it.\n'
    + 'Re-run with --server=production --i-mean-it once you are sure, or drop\n'
    + '--server to target the sandbox.',
  );
  process.exit(1);
}

const accessToken = process.env.POLAR_ACCESS_TOKEN;
if (!accessToken) {
  console.error(
    `POLAR_ACCESS_TOKEN is not set.\n${
      server === 'sandbox'
        ? 'Create a SANDBOX token at sandbox.polar.sh → Settings → Developers.\n'
        + 'A production token will NOT work against the sandbox.'
        : 'Create a token at polar.sh → Settings → Developers.'}`,
  );
  process.exit(1);
}

const polar = new Polar({ accessToken, server });

/** One product to ensure exists. */
type Spec = {
  /** Label used in the output only. */
  key: string;
  name: string;
  description: string;
  /** Price in whole dollars. Ad-hoc-priced products treat this as a placeholder. */
  priceUsd: number;
  interval: 'month' | 'year' | null; // null = one-time
  /** Where the resulting id has to be pasted. */
  target: string;
};

const specs: Spec[] = [];

for (const plan of VISIBLE_PLANS) {
  specs.push({
    key: `${plan.id}:month`,
    name: `NativPost ${plan.name}`,
    description: plan.tagline,
    priceUsd: plan.priceUsd,
    interval: 'month',
    target: `plans.ts → ${plan.id}.polarProductId`,
  });
  specs.push({
    key: `${plan.id}:year`,
    name: `NativPost ${plan.name}`,
    description: `${plan.tagline} Billed annually.`,
    priceUsd: plan.annualPriceUsd,
    interval: 'year',
    target: `plans.ts → ${plan.id}.polarAnnualProductId`,
  });
}

// Ad-hoc-priced products. The app overrides the amount on every checkout, so
// these catalog prices are placeholders and are never what a customer pays —
// see createCreditsCheckout / createManagedAccountCheckout.
specs.push({
  key: 'credits',
  name: 'NativPost AI Credits',
  description:
    'One-time top-up of AI Studio credits. The amount is set at checkout.',
  priceUsd: 10,
  interval: null,
  target: 'env → POLAR_CREDITS_PRODUCT_ID',
});
specs.push({
  key: 'msi_account',
  name: 'Managed social account',
  description:
    'A fully managed social account, operated by NativPost. Billed per account per month.',
  priceUsd: MSI_PER_ACCOUNT_USD,
  interval: null, // overridden below — this one is recurring
  target: 'env → POLAR_MSI_ACCOUNT_PRODUCT_ID',
});
// The managed-account product is recurring monthly; the quantity is folded into
// the ad-hoc price at checkout because Polar has no per-line quantity.
specs[specs.length - 1]!.interval = 'month';

/** Existing products, so a re-run doesn't duplicate. */
async function loadExisting(): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const result = await polar.products.list({ limit: 100, isArchived: false });

  for await (const page of result) {
    for (const product of page.result.items) {
      // Name alone is ambiguous — the monthly and yearly tiers share a name, as
      // they do in the existing production catalog — so key on the billing
      // shape too. That is exactly what distinguishes them.
      const interval = product.isRecurring ? product.recurringInterval : null;
      found.set(`${product.name}::${interval ?? 'one_time'}`, product.id);
    }
  }
  return found;
}

async function main() {
  console.log(
    `\nPolar product setup → ${server.toUpperCase()}${DRY_RUN ? '  (dry run)' : ''}\n`,
  );

  const existing = await loadExisting();
  console.log(`Found ${existing.size} existing product(s).\n`);

  const resolved = new Map<string, string>();

  for (const spec of specs) {
    const lookup = `${spec.name}::${spec.interval ?? 'one_time'}`;
    const already = existing.get(lookup);

    if (already) {
      resolved.set(spec.key, already);
      console.log(`  = ${spec.name} (${spec.interval ?? 'one-time'}) — exists`);
      continue;
    }

    if (DRY_RUN) {
      resolved.set(spec.key, '<would create>');
      console.log(
        `  + ${spec.name} (${spec.interval ?? 'one-time'}) $${spec.priceUsd} — WOULD CREATE`,
      );
      continue;
    }

    const price = {
      amountType: 'fixed' as const,
      priceAmount: Math.round(spec.priceUsd * 100),
      priceCurrency: 'usd' as const,
    };

    const product = spec.interval
      ? await polar.products.create({
        name: spec.name,
        description: spec.description,
        recurringInterval: spec.interval,
        prices: [price],
      })
      : await polar.products.create({
        name: spec.name,
        description: spec.description,
        prices: [price],
      });

    resolved.set(spec.key, product.id);
    console.log(
      `  + ${spec.name} (${spec.interval ?? 'one-time'}) $${spec.priceUsd} — created`,
    );
  }

  // ---------------------------------------------------------------
  // Output to paste
  // ---------------------------------------------------------------
  const column = server === 'production' ? 'prod' : 'dev';

  console.log(`\n${'─'.repeat(72)}`);
  console.log(`src/lib/plans.ts — replace the \`${column}\` values:\n`);

  for (const plan of VISIBLE_PLANS) {
    const monthly = resolved.get(`${plan.id}:month`);
    const yearly = resolved.get(`${plan.id}:year`);
    const other = column === 'prod' ? 'dev' : 'prod';
    console.log(`  // ${plan.id}`);
    console.log(
      `  polarProductId:       { ${column}: '${monthly}', ${other}: '…keep…' },`,
    );
    console.log(
      `  polarAnnualProductId: { ${column}: '${yearly}', ${other}: '…keep…' },`,
    );
  }

  console.log(`\n${'─'.repeat(72)}`);
  console.log('.env — set these:\n');
  console.log(`POLAR_CREDITS_PRODUCT_ID=${resolved.get('credits')}`);
  console.log(`POLAR_MSI_ACCOUNT_PRODUCT_ID=${resolved.get('msi_account')}`);
  console.log(
    `POLAR_SERVER=${server}`
    + `      # MUST match the environment your token came from`,
  );
  console.log(
    `BILLING_PLAN_ENV=${column === 'prod' ? 'prod' : 'dev'}`
    + `   # selects the \`${column}\` column above`,
  );
  console.log(`${'─'.repeat(72)}\n`);

  if (DRY_RUN) {
    console.log('Dry run — nothing was created.\n');
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\nFailed: ${message}\n`);
  if (message.includes('401') || message.includes('invalid_token')) {
    console.error(
      `That 401 almost always means the token and --server disagree.\n`
      + `You targeted ${server}, so the token must be a ${server} token:\n`
      + `  sandbox    → sandbox.polar.sh → Settings → Developers\n`
      + `  production → polar.sh → Settings → Developers\n`,
    );
  }
  process.exit(1);
});
