import { describe, expect, it } from 'vitest';

import {
  buildContentPostJob,
  canRequestPost,
  MANAGED_POSTING_QUOTA,
  quotaForTier,
  remainingPosts,
} from './managed-posting';

describe('Managed Posting quota', () => {
  it('maps tiers to monthly quotas', () => {
    expect(quotaForTier('starter')).toBe(12);
    expect(quotaForTier('professional')).toBe(30);
    expect(quotaForTier('scale')).toBe(60);
  });

  it('returns null for unknown / missing tiers', () => {
    expect(quotaForTier('nope')).toBeNull();
    expect(quotaForTier(null)).toBeNull();
    expect(quotaForTier(undefined)).toBeNull();
  });

  it('matches the catalog tier ids', () => {
    expect(Object.keys(MANAGED_POSTING_QUOTA).sort()).toEqual(['professional', 'scale', 'starter']);
  });

  it('computes remaining without going negative', () => {
    expect(remainingPosts(12, 5)).toBe(7);
    expect(remainingPosts(12, 12)).toBe(0);
    expect(remainingPosts(12, 20)).toBe(0);
  });

  it('gates requests on quota', () => {
    expect(canRequestPost(12, 0)).toBe(true);
    expect(canRequestPost(12, 11)).toBe(true);
    expect(canRequestPost(12, 12)).toBe(false);
    expect(canRequestPost(12, 13)).toBe(false);
  });
});

describe('buildContentPostJob', () => {
  it('builds a queued content_post job with draft → review → publish tasks', () => {
    const { job, tasks } = buildContentPostJob({
      orgId: 'org-1',
      managedAccountId: 'acc-1',
      contentItemId: 'content-1',
    });
    expect(job).toEqual({
      orgId: 'org-1',
      managedAccountId: 'acc-1',
      jobType: 'content_post',
      state: 'queued',
      priority: 0,
      contentItemId: 'content-1',
    });
    expect(tasks.map(t => t.taskType)).toEqual(['draft_content', 'peer_review', 'publish']);
    expect(tasks.map(t => t.sequence)).toEqual([0, 1, 2]);
  });

  it('honors a supplied priority', () => {
    const { job } = buildContentPostJob({
      orgId: 'o',
      managedAccountId: 'a',
      contentItemId: 'c',
      priority: 5,
    });
    expect(job.priority).toBe(5);
  });
});
