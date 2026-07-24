// Capacity & Allocation Engine (docs §6). Pure feasibility/ETA/confidence
// computation used to gate checkout: before a customer buys, we answer "can we
// fulfil this, and by when?". No `db`/`Env` — the DB layer assembles a snapshot
// (via buildSnapshot) and calls assessCapacity.

export type CapacitySnapshot = {
  country: string;
  platform: string;
  operatorCapacity: number;
  operatorActiveLoad: number;
  deviceCapacity: number;
  deviceActiveLoad: number;
  /** Held (unexpired) reservations not yet consumed — see ./reservation. */
  reservedSlots: number;
  /** Accounts currently in provisioning/build states for this country+platform. */
  queueDepth: number;
  /** Rolling accounts-finished-per-day for this country+platform. */
  throughputPerDay: number;
};

export type CapacityAssessment = {
  country: string;
  platform: string;
  requested: number;
  availableNow: number;
  utilization: number; // 0..1
  immediate: boolean; // can start all of `requested` right now
  feasible: boolean; // can we accept the order at all
  waitlist: boolean; // accepted only onto a waitlist (no capacity + no throughput)
  etaDays: number | null; // null when we cannot estimate
  confidence: number; // 0..1
};

export type CapacityOptions = {
  /** Minimum days to build+warm an account even with free capacity. */
  buildDays?: number;
};

const DEFAULT_BUILD_DAYS = 2;

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Slots we can start on immediately, after existing load + held reservations. */
export function availableSlots(s: CapacitySnapshot): number {
  const operatorFree = s.operatorCapacity - s.operatorActiveLoad;
  const deviceFree = s.deviceCapacity - s.deviceActiveLoad;
  return Math.max(0, Math.min(operatorFree, deviceFree) - s.reservedSlots);
}

/** Assemble a snapshot from raw inventory rows (pure — the DB layer feeds it). */
export function buildSnapshot(input: {
  country: string;
  platform: string;
  operators: { capacity: number; activeLoad: number }[];
  devices: { capacity: number; assignedCount: number }[];
  reservedSlots: number;
  queueDepth: number;
  throughputPerDay: number;
}): CapacitySnapshot {
  const sum = (nums: number[]) => nums.reduce((a, b) => a + b, 0);
  return {
    country: input.country,
    platform: input.platform,
    operatorCapacity: sum(input.operators.map(o => o.capacity)),
    operatorActiveLoad: sum(input.operators.map(o => o.activeLoad)),
    deviceCapacity: sum(input.devices.map(d => d.capacity)),
    deviceActiveLoad: sum(input.devices.map(d => d.assignedCount)),
    reservedSlots: input.reservedSlots,
    queueDepth: input.queueDepth,
    throughputPerDay: input.throughputPerDay,
  };
}

export function assessCapacity(
  s: CapacitySnapshot,
  requested: number,
  opts: CapacityOptions = {},
): CapacityAssessment {
  const buildDays = opts.buildDays ?? DEFAULT_BUILD_DAYS;
  const availableNow = availableSlots(s);

  const totalCapacity = Math.max(
    1,
    Math.min(s.operatorCapacity, s.deviceCapacity),
  );
  const usedLoad =
    Math.max(s.operatorActiveLoad, s.deviceActiveLoad) + s.reservedSlots;
  const utilization = clamp(usedLoad / totalCapacity, 0, 1);

  const immediate = requested > 0 && availableNow >= requested;
  const hasThroughput = s.throughputPerDay > 0;
  const feasible = immediate || hasThroughput;
  const waitlist = !immediate && !hasThroughput;

  let etaDays: number | null;
  let confidence: number;

  if (immediate) {
    etaDays = buildDays;
    confidence = 0.95;
  } else if (hasThroughput) {
    const backlog = s.queueDepth + Math.max(0, requested - availableNow);
    const waitDays = Math.ceil(backlog / s.throughputPerDay);
    etaDays = waitDays + buildDays;
    // Confidence erodes with utilization pressure and queue wait length.
    confidence = clamp(
      0.9 - utilization * 0.25 - Math.min(0.25, waitDays * 0.02),
      0.5,
      0.9,
    );
  } else {
    etaDays = null;
    confidence = 0;
  }

  return {
    country: s.country,
    platform: s.platform,
    requested,
    availableNow,
    utilization,
    immediate,
    feasible,
    waitlist,
    etaDays,
    confidence,
  };
}
