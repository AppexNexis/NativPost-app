#!/usr/bin/env node
/**
 * MSI metered-billing READINESS check. Read-only, Stripe-only — no DB, so it
 * runs even when the database isn't reachable locally.
 *
 * Verifies the whole chain is wired before you flip the switch:
 *   - the metered price exists, is usage_type=metered, and links to a meter
 *   - that meter is active and its event_name matches what the code sends
 *   - the env flag / event-name overrides are consistent
 *
 * Usage:
 *   dotenv -c production -- npx tsx scripts/msi-verify-billing-config.ts
 *   ... --price=price_123   # override STRIPE_MSI_POST_PRICE_ID
 */

import Stripe from 'stripe';

// Keep in sync with the code default in src/lib/msi/billing.ts.
const CODE_DEFAULT_EVENT_NAME = 'nativpost_managed_post';

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : undefined;
}

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const PRICE_ID = flag('price') || process.env.STRIPE_MSI_POST_PRICE_ID;
const EVENT_NAME_ENV = process.env.STRIPE_MSI_METER_EVENT_NAME;
const EFFECTIVE_EVENT_NAME = EVENT_NAME_ENV || CODE_DEFAULT_EVENT_NAME;
const FLAG_RAW = process.env.MSI_METERED_BILLING_ENABLED;
const FLAG_ON = FLAG_RAW === 'true' || FLAG_RAW === '1';

const ok = (m: string) => console.log(`  \x1B[32m✓\x1B[0m ${m}`);
const warn = (m: string) => console.log(`  \x1B[33m⚠\x1B[0m ${m}`);
const bad = (m: string) => console.log(`  \x1B[31m✗\x1B[0m ${m}`);

async function main() {
  console.log('\n=== NativPost MSI billing config check ===\n');
  let blocking = 0;

  if (!STRIPE_SECRET_KEY) {
    bad('STRIPE_SECRET_KEY is not set.');
    process.exit(1);
  }
  const stripe = new Stripe(STRIPE_SECRET_KEY);

  // 1. Price ------------------------------------------------------------------
  if (!PRICE_ID) {
    bad('STRIPE_MSI_POST_PRICE_ID is not set (and no --price given).');
    blocking += 1;
  } else {
    const price = await stripe.prices.retrieve(PRICE_ID).catch(() => null);
    if (!price) {
      bad(`Price ${PRICE_ID} not found (live vs test key mismatch?).`);
      blocking += 1;
    } else {
      console.log(`  price: ${price.id} (${price.livemode ? 'LIVE' : 'test'} mode)`);
      const rec = price.recurring;
      if (!rec || rec.usage_type !== 'metered' || !rec.meter) {
        bad(`Price is NOT metered — usage_type=${rec?.usage_type ?? '(none)'}, meter=${rec?.meter ?? '(none)'}. Recreate as usage-based + meter-linked.`);
        blocking += 1;
      } else {
        ok(`Price is metered — $${((price.unit_amount ?? 0) / 100).toFixed(2)}/unit, ${rec.interval}ly`);

        // 2. Meter ------------------------------------------------------------
        // The price already proves the meter link (Stripe won't attach a price
        // to a non-existent meter), so a failed fetch here is NOT blocking —
        // it just means we can't auto-verify the event-name/active status. We
        // surface the real reason (often a restricted key lacking the "Billing
        // Meters" read scope, or an older pinned API version).
        let meter: Stripe.Billing.Meter | null = null;
        let meterErr: string | null = null;
        try {
          meter = await stripe.billing.meters.retrieve(rec.meter as string);
        } catch (err) {
          meterErr = (err as Error).message;
        }
        if (!meter) {
          warn(`Couldn't fetch meter ${rec.meter} to auto-verify it — ${meterErr ?? 'unknown error'}`);
          warn(`Price IS linked to this meter (Stripe-validated). Confirm in the dashboard that its event name is "${EFFECTIVE_EVENT_NAME}" and status is active.`);
        } else {
          if (meter.status === 'active') {
            ok(`Meter "${meter.display_name}" is active (${meter.id})`);
          } else {
            bad(`Meter "${meter.display_name}" status is "${meter.status}" (must be active).`);
            blocking += 1;
          }
          // 3. Event-name match ----------------------------------------------
          if (meter.event_name === EFFECTIVE_EVENT_NAME) {
            ok(`Event name matches: "${meter.event_name}" == what the code sends`);
          } else {
            bad(`Event-name MISMATCH — meter expects "${meter.event_name}" but code sends "${EFFECTIVE_EVENT_NAME}". Set STRIPE_MSI_METER_EVENT_NAME="${meter.event_name}".`);
            blocking += 1;
          }
        }
      }
    }
  }

  // 4. Event-name override sanity ---------------------------------------------
  if (EVENT_NAME_ENV) {
    ok(`STRIPE_MSI_METER_EVENT_NAME override set: "${EVENT_NAME_ENV}"`);
  } else {
    console.log(`  · STRIPE_MSI_METER_EVENT_NAME unset → code uses default "${CODE_DEFAULT_EVENT_NAME}"`);
  }

  // 5. The flag ---------------------------------------------------------------
  if (FLAG_ON) {
    if (blocking === 0) {
      ok('MSI_METERED_BILLING_ENABLED is ON — reporter will meter to Stripe.');
    } else {
      warn('MSI_METERED_BILLING_ENABLED is ON, but blocking issues above mean reporting will fail. Fix them or turn it off.');
    }
  } else {
    console.log('  · MSI_METERED_BILLING_ENABLED is OFF — reporter records nothing to Stripe yet (safe).');
  }

  // Verdict -------------------------------------------------------------------
  console.log('');
  if (blocking > 0) {
    console.log(`\x1B[31mNOT READY\x1B[0m — ${blocking} blocking issue(s) above.\n`);
    process.exit(1);
  }
  if (!FLAG_ON) {
    console.log('\x1B[33mCONFIG OK, BILLING PAUSED\x1B[0m — everything is wired; set MSI_METERED_BILLING_ENABLED=true to go live.\n');
  } else {
    console.log('\x1B[32mLIVE\x1B[0m — config is complete and metering is enabled.\n');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
