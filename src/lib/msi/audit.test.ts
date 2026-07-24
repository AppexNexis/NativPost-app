import { describe, expect, it } from 'vitest';

import { buildActivityEvent } from './audit';

describe('buildActivityEvent', () => {
  it('fills defaults for optional fields', () => {
    const at = new Date('2026-07-23T00:00:00Z');
    const event = buildActivityEvent({
      managedAccountId: 'acc-1',
      actorType: 'system',
      action: 'account_ordered',
      occurredAt: at,
    });
    expect(event).toEqual({
      managedAccountId: 'acc-1',
      jobId: null,
      actorType: 'system',
      actorId: null,
      action: 'account_ordered',
      detail: {},
      occurredAt: at,
    });
  });

  it('defaults occurredAt to now when omitted', () => {
    const before = Date.now();
    const event = buildActivityEvent({ actorType: 'operator', action: 'profile_created' });
    expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('rejects an invalid actor type', () => {
    expect(() =>
      // @ts-expect-error — exercising the runtime guard
      buildActivityEvent({ actorType: 'robot', action: 'x' }),
    ).toThrow(/actorType/);
  });

  it('rejects a blank action', () => {
    expect(() =>
      buildActivityEvent({ actorType: 'system', action: '   ' }),
    ).toThrow(/action is required/);
  });
});
