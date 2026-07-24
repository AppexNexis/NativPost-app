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
export function allocate(
  country: string,
  operators: OperatorSlot[],
  devices: DeviceSlot[],
): Allocation | null {
  const op = eligibleOperators(country, operators).sort(
    (a, b) =>
      a.activeLoad - b.activeLoad ||
      b.capacity - b.activeLoad - (a.capacity - a.activeLoad),
  )[0];

  const dev = eligibleDevices(country, devices).sort(
    (a, b) =>
      a.assignedCount - b.assignedCount ||
      b.capacity - b.assignedCount - (a.capacity - a.assignedCount),
  )[0];

  if (!op || !dev) {
    return null;
  }
  return { operatorId: op.id, deviceId: dev.id };
}
