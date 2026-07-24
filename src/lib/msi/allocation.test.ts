import { describe, expect, it } from 'vitest';

import {
  allocate,
  type DeviceSlot,
  eligibleOperators,
  type OperatorSlot,
  planAllocations,
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

describe('planAllocations', () => {
  const oneOperator = (capacity: number): OperatorSlot[] => [
    { id: 'op', country: 'US', role: 'operator', status: 'active', capacity, activeLoad: 0 },
  ];
  const oneDevice = (capacity: number): DeviceSlot[] => [
    { id: 'dev', country: 'US', status: 'active', capacity, assignedCount: 0 },
  ];
  const qjob = (id: string, managedAccountId: string) => ({ id, country: 'US', managedAccountId });

  it('assigns multiple accounts while capacity remains', () => {
    const plans = planAllocations(
      [qjob('j1', 'accA'), qjob('j2', 'accB')],
      oneOperator(2),
      oneDevice(2),
    );
    expect(plans.map(p => p.jobId)).toEqual(['j1', 'j2']);
    expect(plans.every(p => p.isNewDeviceAssignment)).toBe(true);
  });

  it('reuses one device for the same account and consumes device capacity once', () => {
    const plans = planAllocations(
      [qjob('j1', 'accA'), qjob('j2', 'accA')], // same account
      oneOperator(2),
      oneDevice(1), // only one device slot
    );
    expect(plans.map(p => p.jobId)).toEqual(['j1', 'j2']); // both assigned
    expect(plans.map(p => p.deviceId)).toEqual(['dev', 'dev']); // same device
    expect(plans.map(p => p.isNewDeviceAssignment)).toEqual([true, false]);
  });

  it('reuses a device the account already has (no new assignment)', () => {
    const plans = planAllocations(
      [qjob('j1', 'accA')],
      oneOperator(2),
      [], // no free devices
      new Map([['accA', 'dev-existing']]),
    );
    expect(plans[0]).toMatchObject({
      deviceId: 'dev-existing',
      isNewDeviceAssignment: false,
    });
  });

  it('stops assigning once operator capacity is consumed', () => {
    const plans = planAllocations(
      [qjob('j1', 'accA'), qjob('j2', 'accB')],
      oneOperator(1),
      oneDevice(5),
    );
    expect(plans.map(p => p.jobId)).toEqual(['j1']);
  });

  it('stops when a device-less account has no free device', () => {
    const plans = planAllocations(
      [qjob('j1', 'accA'), qjob('j2', 'accB')], // distinct accounts
      oneOperator(5),
      oneDevice(1),
    );
    expect(plans.map(p => p.jobId)).toEqual(['j1']); // accB can't get a device
  });

  it('skips jobs in countries with no inventory', () => {
    expect(
      planAllocations(
        [{ id: 'j', country: 'JP', managedAccountId: 'accA' }],
        oneOperator(5),
        oneDevice(5),
      ),
    ).toEqual([]);
  });
});
