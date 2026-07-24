// DB wiring for the Capacity Engine (docs §6). Read-only: assembles a live
// inventory snapshot for a country+platform and runs the (tested, pure)
// assessCapacity. This is the checkout gate. No account is provisioned here.

import { and, eq, gte, inArray, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  managedAccountSchema,
  msiCapacityReservationSchema,
  msiDeviceAssignmentSchema,
  msiDeviceSchema,
  msiOperatorSchema,
} from '@/models/Schema';

import type { CapacityAssessment, CapacityOptions } from './capacity';
import { assessCapacity, buildSnapshot } from './capacity';
import type { ReservationLike } from './reservation';
import { countHeldSlots } from './reservation';

/** Lifecycle states that occupy build capacity right now. */
const QUEUE_STATES = ['provisioning', 'brand_setup', 'building', 'qa_review'];
/** Roles that can build/operate accounts (mirrors ./allocation). */
const BUILD_ROLES = ['operator', 'country_manager'];
const THROUGHPUT_WINDOW_DAYS = 7;

export async function assessCountryCapacity(
  country: string,
  platform: string,
  requested: number,
  opts?: CapacityOptions,
): Promise<CapacityAssessment> {
  const now = new Date();

  const operators = await db
    .select()
    .from(msiOperatorSchema)
    .where(
      and(
        eq(msiOperatorSchema.country, country),
        eq(msiOperatorSchema.status, 'active'),
        inArray(msiOperatorSchema.role, BUILD_ROLES),
      ),
    );

  const devices = await db
    .select()
    .from(msiDeviceSchema)
    .where(
      and(
        eq(msiDeviceSchema.country, country),
        eq(msiDeviceSchema.status, 'active'),
      ),
    );

  // Active assignments per device → each device's current load.
  const deviceIds = devices.map(d => d.id);
  const activeAssignments = deviceIds.length
    ? await db
        .select()
        .from(msiDeviceAssignmentSchema)
        .where(
          and(
            inArray(msiDeviceAssignmentSchema.deviceId, deviceIds),
            isNull(msiDeviceAssignmentSchema.releasedAt),
          ),
        )
    : [];
  const assignedByDevice = new Map<string, number>();
  for (const a of activeAssignments) {
    assignedByDevice.set(a.deviceId, (assignedByDevice.get(a.deviceId) ?? 0) + 1);
  }

  const heldReservations = await db
    .select()
    .from(msiCapacityReservationSchema)
    .where(
      and(
        eq(msiCapacityReservationSchema.country, country),
        eq(msiCapacityReservationSchema.platform, platform),
        eq(msiCapacityReservationSchema.status, 'held'),
      ),
    );

  const queued = await db
    .select({ id: managedAccountSchema.id })
    .from(managedAccountSchema)
    .where(
      and(
        eq(managedAccountSchema.country, country),
        eq(managedAccountSchema.platform, platform),
        inArray(managedAccountSchema.lifecycleState, QUEUE_STATES),
      ),
    );

  const since = new Date(now.getTime() - THROUGHPUT_WINDOW_DAYS * 86_400_000);
  const recentLive = await db
    .select({ id: managedAccountSchema.id })
    .from(managedAccountSchema)
    .where(
      and(
        eq(managedAccountSchema.country, country),
        eq(managedAccountSchema.platform, platform),
        gte(managedAccountSchema.liveAt, since),
      ),
    );

  const snapshot = buildSnapshot({
    country,
    platform,
    operators: operators.map(o => ({
      capacity: o.capacity,
      activeLoad: o.activeLoad,
    })),
    devices: devices.map(d => ({
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

  return assessCapacity(snapshot, requested, opts);
}
