import { describe, expect, it } from 'vitest';

import {
  assessCapacity,
  availableSlots,
  buildSnapshot,
  type CapacitySnapshot,
} from './capacity';

const base: CapacitySnapshot = {
  country: 'US',
  platform: 'tiktok',
  operatorCapacity: 50,
  operatorActiveLoad: 10,
  deviceCapacity: 40,
  deviceActiveLoad: 8,
  reservedSlots: 0,
  queueDepth: 0,
  throughputPerDay: 5,
};

describe('capacity engine', () => {
  it('availableSlots is bounded by the tighter of operator/device free capacity, minus reservations', () => {
    // operatorFree = 40, deviceFree = 32 → min 32, minus 2 reserved = 30
    expect(availableSlots({ ...base, reservedSlots: 2 })).toBe(30);
  });

  it('never returns negative availability', () => {
    expect(
      availableSlots({ ...base, operatorActiveLoad: 100, reservedSlots: 100 }),
    ).toBe(0);
  });

  it('gives an immediate, high-confidence ETA when capacity is free', () => {
    const a = assessCapacity(base, 10);
    expect(a.immediate).toBe(true);
    expect(a.feasible).toBe(true);
    expect(a.waitlist).toBe(false);
    expect(a.etaDays).toBe(2); // default buildDays
    expect(a.confidence).toBe(0.95);
  });

  it('queues the overflow and extends ETA when demand exceeds free capacity', () => {
    // free = min(40,32) = 32; request 40 → 8 overflow, queueDepth 10 → backlog 18
    const a = assessCapacity({ ...base, queueDepth: 10 }, 40);
    expect(a.immediate).toBe(false);
    expect(a.feasible).toBe(true);
    // ceil(18 / 5) = 4 wait + 2 build = 6
    expect(a.etaDays).toBe(6);
    expect(a.confidence).toBeGreaterThan(0.5);
    expect(a.confidence).toBeLessThan(0.9);
  });

  it('falls back to a waitlist when there is no capacity and no throughput', () => {
    const a = assessCapacity(
      { ...base, operatorActiveLoad: 50, deviceActiveLoad: 40, throughputPerDay: 0 },
      5,
    );
    expect(a.immediate).toBe(false);
    expect(a.feasible).toBe(false);
    expect(a.waitlist).toBe(true);
    expect(a.etaDays).toBeNull();
    expect(a.confidence).toBe(0);
  });

  it('reports utilization between 0 and 1', () => {
    const a = assessCapacity({ ...base, operatorActiveLoad: 25, reservedSlots: 0 }, 1);
    expect(a.utilization).toBeGreaterThan(0);
    expect(a.utilization).toBeLessThanOrEqual(1);
  });

  it('buildSnapshot aggregates raw inventory rows', () => {
    const snap = buildSnapshot({
      country: 'UK',
      platform: 'instagram',
      operators: [
        { capacity: 10, activeLoad: 3 },
        { capacity: 10, activeLoad: 5 },
      ],
      devices: [{ capacity: 5, assignedCount: 2 }],
      reservedSlots: 1,
      queueDepth: 4,
      throughputPerDay: 2,
    });
    expect(snap.operatorCapacity).toBe(20);
    expect(snap.operatorActiveLoad).toBe(8);
    expect(snap.deviceCapacity).toBe(5);
    expect(snap.deviceActiveLoad).toBe(2);
  });
});
