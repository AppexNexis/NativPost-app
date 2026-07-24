import { describe, expect, it } from 'vitest';

import {
  AdapterNotConfiguredError,
  executionEffect,
  getAdapterForAccount,
  getExecutionAdapter,
  isExecutionStrategy,
  jobToOperation,
  manualExecutionAdapter,
  PLATFORM_DEFAULT_STRATEGY,
  resolveStrategy,
} from './execution';

describe('execution strategy resolution', () => {
  it('validates strategy values', () => {
    expect(isExecutionStrategy('manual')).toBe(true);
    expect(isExecutionStrategy('official_api')).toBe(true);
    expect(isExecutionStrategy('carrier_pigeon')).toBe(false);
    expect(isExecutionStrategy(null)).toBe(false);
  });

  it("uses the account's explicit strategy when valid", () => {
    expect(
      resolveStrategy({ executionStrategy: 'official_api', platform: 'tiktok' }),
    ).toBe('official_api');
  });

  it('falls back to the platform default, then to manual', () => {
    expect(resolveStrategy({ executionStrategy: null, platform: 'tiktok' })).toBe(
      'manual',
    );
    expect(
      resolveStrategy({ executionStrategy: 'bogus', platform: 'unknown' }),
    ).toBe('manual');
  });

  it('respects a configured platform default', () => {
    PLATFORM_DEFAULT_STRATEGY.testgram = 'delegated_access';
    try {
      expect(
        resolveStrategy({ executionStrategy: undefined, platform: 'testgram' }),
      ).toBe('delegated_access');
    } finally {
      delete PLATFORM_DEFAULT_STRATEGY.testgram;
    }
  });
});

describe('execution adapters', () => {
  it('resolves the manual adapter and fails closed for unconfigured strategies', () => {
    expect(getExecutionAdapter('manual')).toBe(manualExecutionAdapter);
    expect(() => getExecutionAdapter('official_api')).toThrow(
      AdapterNotConfiguredError,
    );
    expect(() => getExecutionAdapter('delegated_access')).toThrow(
      AdapterNotConfiguredError,
    );
  });

  it('getAdapterForAccount resolves via strategy + platform', () => {
    expect(getAdapterForAccount({ platform: 'tiktok' }).strategy).toBe('manual');
  });

  it('the manual adapter defers to an in-country operator', async () => {
    const result = await manualExecutionAdapter.execute('create_account', {
      managedAccountId: 'a',
      platform: 'tiktok',
      country: 'US',
      strategy: 'manual',
    });
    expect(result.outcome).toBe('pending_operator');
  });
});

describe('executionEffect', () => {
  it('maps outcomes to uniform pipeline effects', () => {
    expect(executionEffect({ outcome: 'completed' })).toEqual({
      taskStatus: 'done',
      jobFailed: false,
      operatorActionRequired: false,
    });
    expect(executionEffect({ outcome: 'pending_operator' })).toEqual({
      taskStatus: 'in_progress',
      jobFailed: false,
      operatorActionRequired: true,
    });
    expect(executionEffect({ outcome: 'failed' })).toEqual({
      taskStatus: 'pending',
      jobFailed: true,
      operatorActionRequired: false,
    });
  });
});

describe('jobToOperation', () => {
  it('maps job types to platform operations', () => {
    expect(jobToOperation('create_account')).toBe('create_account');
    expect(jobToOperation('replace_avatar')).toBe('apply_profile');
    expect(jobToOperation('publish_post')).toBe('publish_post');
  });

  it('returns null for jobs with no platform operation', () => {
    expect(jobToOperation('transfer_ownership')).toBeNull();
    expect(jobToOperation('appeal_restriction')).toBeNull();
    expect(jobToOperation('whatever')).toBeNull();
  });
});
