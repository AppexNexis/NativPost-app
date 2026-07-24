#!/usr/bin/env node
/**
 * MSI capacity smoke test — READ-ONLY.
 *
 * Verifies that the Managed Social Infrastructure tables (migration 0043) exist
 * and are queryable, and that the Capacity Engine (docs §6) produces a sane
 * assessment against the real database.
 *
 * It mirrors the queries in src/lib/msi/capacity-service.ts but is
 * self-contained (its own pool, relative imports) so it runs under tsx without
 * path-alias setup — matching the other scripts in this folder. It performs NO
 * writes.
 *
 * On an empty inventory you should see: feasible=false, waitlist=true,
 * etaDays=null — i.e. "we can't fulfil this yet", which is the correct gate.
 *
 * Usage:
 *   dotenv -c production -- npx tsx scripts/msi-capacity-smoke.ts [country] [platform] [quantity]
 *   e.g. dotenv -c production -- npx tsx scripts/msi-capacity-smoke.ts US tiktok 10
 */

import { and, eq, gte, inArray, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { assessCapacity, buildSnapshot } from '../src/lib/msi/capacity';
import type { ReservationLike } from '../src/lib/msi/reservation';
import { countHeldSlots } from '../src/lib/msi/reservation';
import * as schema from '../src/models/Schema';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    'DATABASE_URL is required. Run with: dotenv -c production -- npx tsx scripts/msi-capacity-smoke.ts',
  );
  process.exit(1);
}

const country = process.argv[2] ?? 'US';
const platform = process.argv[3] ?? 'tiktok';
const requested = Number(process.argv[4] ?? 10);

const QUEUE_STATES = ['provisioning', 'brand_setup', 'building', 'qa_review'];
const BUILD_ROLES = ['operator', 'country_manager'];
const THROUGHPUT_WINDOW_DAYS = 7;

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
  const db = drizzle(pool, { schema });

  try {
    const now = new Date();

    // 1) Existence / sanity: the MSI tables are reachable.
    const [accounts, operators, devices] = await Promise.all([
      db.select({ id: schema.managedAccountSchema.id }).from(schema.managedAccountSchema),
      db.select().from(schema.msiOperatorSchema),
      db.select().from(schema.msiDeviceSchema),
    ]);

    console.log('MSI tables reachable:');
    console.log(`  managed_account rows: ${accounts.length}`);
    console.log(`  msi_operator rows:    ${operators.length}`);
    console.log(`  msi_device rows:      ${devices.length}`);
    console.log();

    // 2) Assess capacity — mirrors capacity-service.ts (read-only).
    const activeOperators = operators.filter(
      o => o.country === country && o.status === 'active' && BUILD_ROLES.includes(o.role),
    );
    const activeDevices = devices.filter(
      d => d.country === country && d.status === 'active',
    );

    const deviceIds = activeDevices.map(d => d.id);
    const activeAssignments = deviceIds.length
      ? await db
          .select()
          .from(schema.msiDeviceAssignmentSchema)
          .where(
            and(
              inArray(schema.msiDeviceAssignmentSchema.deviceId, deviceIds),
              isNull(schema.msiDeviceAssignmentSchema.releasedAt),
            ),
          )
      : [];
    const assignedByDevice = new Map<string, number>();
    for (const a of activeAssignments) {
      assignedByDevice.set(a.deviceId, (assignedByDevice.get(a.deviceId) ?? 0) + 1);
    }

    const heldReservations = await db
      .select()
      .from(schema.msiCapacityReservationSchema)
      .where(
        and(
          eq(schema.msiCapacityReservationSchema.country, country),
          eq(schema.msiCapacityReservationSchema.platform, platform),
          eq(schema.msiCapacityReservationSchema.status, 'held'),
        ),
      );

    const queued = await db
      .select({ id: schema.managedAccountSchema.id })
      .from(schema.managedAccountSchema)
      .where(
        and(
          eq(schema.managedAccountSchema.country, country),
          eq(schema.managedAccountSchema.platform, platform),
          inArray(schema.managedAccountSchema.lifecycleState, QUEUE_STATES),
        ),
      );

    const since = new Date(now.getTime() - THROUGHPUT_WINDOW_DAYS * 86_400_000);
    const recentLive = await db
      .select({ id: schema.managedAccountSchema.id })
      .from(schema.managedAccountSchema)
      .where(
        and(
          eq(schema.managedAccountSchema.country, country),
          eq(schema.managedAccountSchema.platform, platform),
          gte(schema.managedAccountSchema.liveAt, since),
        ),
      );

    const snapshot = buildSnapshot({
      country,
      platform,
      operators: activeOperators.map(o => ({ capacity: o.capacity, activeLoad: o.activeLoad })),
      devices: activeDevices.map(d => ({
        capacity: d.capacity,
        assignedCount: assignedByDevice.get(d.id) ?? 0,
      })),
      reservedSlots: countHeldSlots(
        heldReservations as ReservationLike[],
        country,
        platform,
        now,
      ),
      queueDepth: queued.length,
      throughputPerDay: recentLive.length / THROUGHPUT_WINDOW_DAYS,
    });

    const assessment = assessCapacity(snapshot, requested);

    console.log(`Capacity assessment — ${country} / ${platform} / requested ${requested}:`);
    console.log(JSON.stringify({ snapshot, assessment }, null, 2));
    console.log();

    let verdict: string;
    if (assessment.immediate) {
      verdict = `available now (ETA ~${assessment.etaDays}d, confidence ${assessment.confidence})`;
    } else if (assessment.waitlist) {
      verdict = 'WAITLIST — no capacity and no throughput yet (expected on empty inventory)';
    } else {
      verdict = `queued (ETA ~${assessment.etaDays}d, confidence ${assessment.confidence})`;
    }
    console.log(`Verdict: ${verdict}`);
    console.log('\nSmoke test OK (read-only, no writes performed).');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
