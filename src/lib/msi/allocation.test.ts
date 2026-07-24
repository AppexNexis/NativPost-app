import { describe, expect, it } from 'vitest';

import {
  allocate,
  type DeviceSlot,
  eligibleOperators,
  type OperatorSlot,
} from './allocation';

const operators: OperatorSlot[] = [
  { id: 'op-full', country: 'US', role: 'operator', status: 'active', capacity: 10, activeLoad: 10 },
  { id: 'op-busy', country: 'US', role: 'operator', status: 'active', capacity: 10, activeLoad: 7 },
  { id: 'op-free', country: 'US', role: 'operator', status: 'active', capacity: 10, activeLoad: 2 },
  { id: 'op-uk', country: 'UK', role: 'operator', status: 'active', capacity: 10, activeLoad: 0 },
  { id: 'op-suspended', country: 'US', role: 'operator', status: 'suspended', capacity: 10, activeLoad: 0 },
  { id: 'op-finance', country: 'US', role: 'finance', status: 'active', capacity: 10, activeLoad: 0 },
];

const devices: DeviceSlot[] = [
  { id: 'dev-full', country: 'US', status: 'active', capacity: 5, assignedCount: 5 },
  { id: 'dev-free', country: 'US', status: 'active', capacity: 5, assignedCount: 1 },
  { id: 'dev-maint', country: 'US', status: 'maintenance', capacity: 5, assignedCount: 0 },
];

describe('allocation', () => {
  it('excludes full, wrong-country, wrong-role, and inactive operators', () => {
    const eligible = eligibleOperators('US', operators).map(o => o.id);
    expect(eligible).toContain('op-busy');
    expect(eligible).toContain('op-free');
    expect(eligible).not.toContain('op-full');
    expect(eligible).not.toContain('op-uk');
    expect(eligible).not.toContain('op-suspended');
    expect(eligible).not.toContain('op-finance');
  });

  it('picks the least-loaded operator and device', () => {
    const result = allocate('US', operators, devices);
    expect(result).toEqual({ operatorId: 'op-free', deviceId: 'dev-free' });
  });

  it('returns null when no operator has headroom', () => {
    const maxed = operators.map(o => ({ ...o, activeLoad: o.capacity }));
    expect(allocate('US', maxed, devices)).toBeNull();
  });

  it('returns null when no device is available', () => {
    const noDevices = devices.map(d => ({ ...d, assignedCount: d.capacity }));
    expect(allocate('US', operators, noDevices)).toBeNull();
  });

  it('returns null for a country with no inventory', () => {
    expect(allocate('JP', operators, devices)).toBeNull();
  });
});
