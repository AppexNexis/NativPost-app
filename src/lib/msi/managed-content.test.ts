import { describe, expect, it } from 'vitest';

import {
  buildContentPieceJob,
  contentQuotaForTier,
  MANAGED_CONTENT_QUOTA,
} from './managed-content';

describe('Managed Content quota', () => {
  it('maps tiers to monthly content quotas', () => {
    expect(contentQuotaForTier('lite')).toBe(15);
    expect(contentQuotaForTier('growth')).toBe(40);
    expect(contentQuotaForTier('studio')).toBe(80);
  });

  it('returns null for unknown / missing tiers', () => {
    expect(contentQuotaForTier('nope')).toBeNull();
    expect(contentQuotaForTier(null)).toBeNull();
    expect(contentQuotaForTier(undefined)).toBeNull();
  });

  it('matches the catalog tier ids', () => {
    expect(Object.keys(MANAGED_CONTENT_QUOTA).sort()).toEqual(['growth', 'lite', 'studio']);
  });
});

describe('buildContentPieceJob', () => {
  it('builds a queued content_piece job with draft → review (no publish)', () => {
    const { job, tasks } = buildContentPieceJob({
      orgId: 'org-1',
      managedAccountId: 'acc-1',
      contentItemId: 'content-1',
    });
    expect(job).toEqual({
      orgId: 'org-1',
      managedAccountId: 'acc-1',
      jobType: 'content_piece',
      state: 'queued',
      priority: 0,
      contentItemId: 'content-1',
    });
    // Distinct from content_post: no publish task — delivered to the library.
    expect(tasks.map(t => t.taskType)).toEqual(['draft_content', 'peer_review']);
  });

  it('honors a supplied priority', () => {
    const { job } = buildContentPieceJob({
      orgId: 'o',
      managedAccountId: 'a',
      contentItemId: 'c',
      priority: 3,
    });
    expect(job.priority).toBe(3);
  });
});
