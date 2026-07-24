// Allocator (docs §6.2): pick the least-loaded qualified operator + device
// within a country, respecting per-slot caps. Pure — returns null when nothing
// is available (caller queues the job instead).

export type OperatorSlot = {
  id: string;
  country: string;
  role: string;
  status: string;
  capacity: number;
  activeLoad: number;
};

export type DeviceSlot = {
  id: string;
  country: string;
  status: string;
  capacity: number;
  assignedCount: number;
};

export type Allocation = {
  operatorId: string;
  deviceId: string;
};

/** Roles allowed to build/operate accounts. */
const BUILD_ROLES = new Set(['operator', 'country_manager']);

export function eligibleOperators(
  country: string,
  operators: OperatorSlot[],
): OperatorSlot[] {
  return operators.filter(
    o =>
      o.country === country &&
      o.status === 'active' &&
      BUILD_ROLES.has(o.role) &&
      o.activeLoad < o.capacity,
  );
}

export function eligibleDevices(
  country: string,
  devices: DeviceSlot[],
): DeviceSlot[] {
  return devices.filter(
    d =>
      d.country === country &&
      d.status === 'active' &&
      d.assignedCount < d.capacity,
  );
}

/** Least-loaded first, tie-broken by most remaining headroom. */
/** Least-loaded eligible operator in the country, or null. */
export function allocateOperator(
  country: string,
  operators: OperatorSlot[],
): OperatorSlot | null {
  return (
    eligibleOperators(country, operators).sort(
      (a, b) =>
        a.activeLoad - b.activeLoad ||
        b.capacity - b.activeLoad - (a.capacity - a.activeLoad),
    )[0] ?? null
  );
}

/** Least-loaded eligible device in the country, or null. */
export function allocateDevice(
  country: string,
  devices: DeviceSlot[],
): DeviceSlot | null {
  return (
    eligibleDevices(country, devices).sort(
      (a, b) =>
        a.assignedCount - b.assignedCount ||
        b.capacity - b.assignedCount - (a.capacity - a.assignedCount),
    )[0] ?? null
  );
}

export function allocate(
  country: string,
  operators: OperatorSlot[],
  devices: DeviceSlot[],
): Allocation | null {
  const op = allocateOperator(country, operators);
  const dev = allocateDevice(country, devices);
  if (!op || !dev) {
    return null;
  }
  return { operatorId: op.id, deviceId: dev.id };
}

export type QueuedJob = { id: string; country: string; managedAccountId: string };

export type AllocationPlan = {
  jobId: string;
  operatorId: string;
  deviceId: string;
  /** True when this places the account on a device for the first time — the
   *  caller creates the device_assignment only then (account↔device is 1:1). */
  isNewDeviceAssignment: boolean;
};

/**
 * Allocate a batch of queued jobs. Operators are per-job; a device is allocated
 * per ACCOUNT (1:1) — an account's later jobs reuse its device instead of
 * consuming new device capacity. `existingDeviceByAccount` seeds accounts that
 * already have a device. Capacity is consumed across the batch. Pure.
 */
export function planAllocations(
  jobs: QueuedJob[],
  operators: OperatorSlot[],
  devices: DeviceSlot[],
  existingDeviceByAccount: Map<string, string> = new Map(),
): AllocationPlan[] {
  const ops = operators.map(o => ({ ...o }));
  const devs = devices.map(d => ({ ...d }));
  const deviceForAccount = new Map<string, string>(existingDeviceByAccount);
  const plans: AllocationPlan[] = [];

  for (const job of jobs) {
    const operator = allocateOperator(job.country, ops);
    if (!operator) {
      continue;
    }

    let deviceId = deviceForAccount.get(job.managedAccountId);
    let newDevice: DeviceSlot | null = null;
    if (!deviceId) {
      newDevice = allocateDevice(job.country, devs);
      if (!newDevice) {
        continue; // a device-less account with no free device stays queued
      }
      deviceId = newDevice.id;
    }

    operator.activeLoad += 1;
    if (newDevice) {
      newDevice.assignedCount += 1;
    }
    deviceForAccount.set(job.managedAccountId, deviceId);
    plans.push({
      jobId: job.id,
      operatorId: operator.id,
      deviceId,
      isNewDeviceAssignment: newDevice !== null,
    });
  }
  return plans;
}
