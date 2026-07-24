import { describe, expect, it } from 'vitest';

import { countByState, groupJobsByState, jobSlaBreached } from './job-queue';

const now = new Date('2026-07-24T12:00:00Z');
const past = new Date(now.getTime() - 60_000);
const future = new Date(now.getTime() + 60_000);

describe('jobSlaBreached', () => {
  it('flags non-terminal jobs past their SLA', () => {
    expect(jobSlaBreached({ state: 'in_progress', slaDueAt: past }, now)).toBe(true);
  });
  it('ignores on-time, null-SLA, and terminal jobs', () => {
    expect(jobSlaBreached({ state: 'in_progress', slaDueAt: future }, now)).toBe(false);
    expect(jobSlaBreached({ state: 'in_progress', slaDueAt: null }, now)).toBe(false);
    expect(jobSlaBreached({ state: 'completed', slaDueAt: past }, now)).toBe(false);
    expect(jobSlaBreached({ state: 'cancelled', slaDueAt: past }, now)).toBe(false);
  });
});

describe('countByState', () => {
  it('tallies jobs per state', () => {
    expect(countByState([{ state: 'a' }, { state: 'a' }, { state: 'b' }])).toEqual({
      a: 2,
      b: 1,
    });
  });
});

describe('groupJobsByState', () => {
  it('groups and orders by work priority (attention first, terminal last)', () => {
    const groups = groupJobsByState([
      { state: 'completed', id: 1 },
      { state: 'failed', id: 2 },
      { state: 'peer_review', id: 3 },
      { state: 'failed', id: 4 },
    ]);
    expect(groups.map(g => g.state)).toEqual(['failed', 'peer_review', 'completed']);
    expect(groups[0]!.jobs).toHaveLength(2);
  });

  it('puts unknown states before terminal-but-after-known? (falls to the end)', () => {
    const groups = groupJobsByState([{ state: 'mystery' }, { state: 'failed' }]);
    expect(groups[0]!.state).toBe('failed');
    expect(groups[1]!.state).toBe('mystery');
  });
});
