import { describe, expect, it } from 'vitest';

import {
  buildManagedSocialAccount,
  buildPublishJob,
  isManagedSocialAccount,
  MANAGED_ACCOUNT_TYPE,
  managedAccountIdOf,
} from './publishing';

const account = {
  id: 'acc-1',
  orgId: 'org-1',
  platform: 'tiktok',
  displayName: '@demo',
  handlePreferences: ['@fallback'],
  executionStrategy: 'manual',
};

describe('buildManagedSocialAccount', () => {
  it('builds a managed, token-less connection linked back to the account', () => {
    const row = buildManagedSocialAccount(account);
    expect(row).toEqual({
      orgId: 'org-1',
      platform: 'tiktok',
      platformUsername: '@demo',
      accountType: MANAGED_ACCOUNT_TYPE,
      isActive: true,
      metadata: { managedAccountId: 'acc-1', executionStrategy: 'manual' },
    });
    // No token fields leak into the connection.
    expect('accessToken' in row).toBe(false);
    expect('oauthToken' in row).toBe(false);
  });

  it('falls back to the first handle preference when there is no display name', () => {
    const row = buildManagedSocialAccount({ ...account, displayName: null });
    expect(row.platformUsername).toBe('@fallback');
  });
});

describe('isManagedSocialAccount / managedAccountIdOf', () => {
  it('detects managed connections', () => {
    expect(isManagedSocialAccount({ accountType: 'managed' })).toBe(true);
    expect(isManagedSocialAccount({ accountType: 'business' })).toBe(false);
    expect(isManagedSocialAccount({ accountType: null })).toBe(false);
  });

  it('reads the managed account id from metadata', () => {
    expect(
      managedAccountIdOf({ accountType: 'managed', metadata: { managedAccountId: 'acc-9' } }),
    ).toBe('acc-9');
    expect(managedAccountIdOf({ accountType: 'managed', metadata: {} })).toBeNull();
    expect(managedAccountIdOf({ accountType: 'business', metadata: { managedAccountId: 'x' } })).toBeNull();
  });
});

describe('buildPublishJob', () => {
  it('builds a queued publish_post job linked to the content + account', () => {
    const { job, tasks } = buildPublishJob({
      orgId: 'org-1',
      managedAccountId: 'acc-1',
      contentItemId: 'content-1',
    });
    expect(job).toEqual({
      orgId: 'org-1',
      managedAccountId: 'acc-1',
      jobType: 'publish_post',
      state: 'queued',
      priority: 0,
      contentItemId: 'content-1',
    });
    expect(tasks.map(t => t.taskType)).toEqual(['prepare_media', 'publish']);
    expect(tasks.map(t => t.sequence)).toEqual([0, 1]);
  });

  it('honours an explicit priority', () => {
    expect(
      buildPublishJob({ orgId: 'o', managedAccountId: 'a', contentItemId: 'c', priority: 5 }).job.priority,
    ).toBe(5);
  });
});
