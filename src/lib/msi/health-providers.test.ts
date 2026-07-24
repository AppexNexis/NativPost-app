import { afterEach, describe, expect, it } from 'vitest';

import {
  getStatsProvider,
  registerStatsProvider,
  unregisterStatsProvider,
} from './health-providers';

describe('stats provider registry', () => {
  afterEach(() => {
    unregisterStatsProvider('testplat');
  });

  it('returns null for an unregistered platform (no fabricated data)', () => {
    expect(getStatsProvider('testplat')).toBeNull();
  });

  it('resolves a registered provider by platform', async () => {
    registerStatsProvider({
      platform: 'testplat',
      getStats: async () => ({ growth: 50, consistency: 80 }),
    });

    const provider = getStatsProvider('testplat');

    expect(provider).not.toBeNull();
    const stats = await provider!.getStats({
      managedAccountId: 'a',
      platform: 'testplat',
    });
    expect(stats).toEqual({ growth: 50, consistency: 80 });
  });

  it('unregisters a provider', () => {
    registerStatsProvider({
      platform: 'testplat',
      getStats: async () => null,
    });
    unregisterStatsProvider('testplat');

    expect(getStatsProvider('testplat')).toBeNull();
  });
});
