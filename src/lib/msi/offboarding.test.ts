import { describe, expect, it } from 'vitest';

import { canOffboard } from './offboarding';

describe('canOffboard', () => {
  it('allows off-boarding only from operational states', () => {
    expect(canOffboard('live')).toBe(true);
    expect(canOffboard('active')).toBe(true);
    expect(canOffboard('paused')).toBe(true);
    expect(canOffboard('building')).toBe(false);
    expect(canOffboard('customer_review')).toBe(false);
    expect(canOffboard('archived')).toBe(false);
  });
});
