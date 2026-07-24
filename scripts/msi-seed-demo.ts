#!/usr/bin/env node
/**
 * MSI demo inventory seed / teardown — WRITES to the database.
 *
 * Opt-in helper to watch the Capacity Engine gate flip from "waitlist" to
 * "available now". `seed` inserts ONE US operator + ONE US device (capacity 5);
 * `teardown` removes exactly those rows again. Both target only rows carrying
 * the SMOKE-DEMO markers below, so they never touch real inventory.
 *
 * This is the ONLY MSI script that writes. Everything it creates is removable
 * with `teardown`. It seeds no accounts and performs no platform operations.
 *
 * Usage:
 *   dotenv -c production -- npx tsx scripts/msi-seed-demo.ts seed
 *   npm run msi:capacity-smoke US tiktok 5      # → immediate: true, etaDays: 2
 *   dotenv -c production -- npx tsx scripts/msi-seed-demo.ts teardown
 */

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '../src/models/Schema';

// Distinctive markers so teardown only ever removes what seed created.
const OPERATOR_MARKER = 'smoke-demo-us-operator';
const DEVICE_MARKER = 'SMOKE-DEMO-US-TIKTOK';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    'DATABASE_URL is required. Run with: dotenv -c production -- npx tsx scripts/msi-seed-demo.ts seed',
  );
  process.exit(1);
}

type Db = ReturnType<typeof drizzle<typeof schema>>;

async function teardownRows(db: Db) {
  // Delete the device first (it may reference the operator).
  const devices = await db
    .delete(schema.msiDeviceSchema)
    .where(eq(schema.msiDeviceSchema.label, DEVICE_MARKER))
    .returning({ id: schema.msiDeviceSchema.id });
  const operators = await db
    .delete(schema.msiOperatorSchema)
    .where(eq(schema.msiOperatorSchema.clerkUserId, OPERATOR_MARKER))
    .returning({ id: schema.msiOperatorSchema.id });
  return { devices: devices.length, operators: operators.length };
}

async function seed(db: Db) {
  // Clean slate first so re-seeding stays idempotent (one operator, one device).
  await teardownRows(db);

  const [operator] = await db
    .insert(schema.msiOperatorSchema)
    .values({
      clerkUserId: OPERATOR_MARKER,
      displayName: 'SMOKE-DEMO Operator',
      country: 'US',
      role: 'operator',
      capacity: 10,
      activeLoad: 0,
      status: 'active',
    })
    .returning();

  const [device] = await db
    .insert(schema.msiDeviceSchema)
    .values({
      label: DEVICE_MARKER,
      country: 'US',
      carrier: 'DEMO',
      capacity: 5,
      status: 'active',
      managedByOperatorId: operator?.id,
    })
    .returning();

  console.log('Seeded demo inventory (US):');
  console.log(`  operator ${operator?.id} (capacity 10)`);
  console.log(`  device   ${device?.id} (capacity 5)`);
  console.log('\nNow run:  npm run msi:capacity-smoke US tiktok 5');
  console.log('Expect:   immediate: true, etaDays: 2, confidence: 0.95');
  console.log('Clean up: npm run msi:teardown-demo');
}

async function main() {
  const mode = process.argv[2] ?? 'seed';
  if (mode !== 'seed' && mode !== 'teardown') {
    console.error(`Unknown mode "${mode}". Use "seed" or "teardown".`);
    process.exit(1);
  }

  const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
  const db = drizzle(pool, { schema });

  try {
    if (mode === 'seed') {
      await seed(db);
    } else {
      const removed = await teardownRows(db);
      console.log(
        `Teardown complete: removed ${removed.operators} operator(s), ${removed.devices} device(s).`,
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
