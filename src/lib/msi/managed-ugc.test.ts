import { describe, expect, it } from 'vitest';

import { buildUgcJob, UGC_PRICE_CENTS } from './managed-ugc';

describe('Managed UGC', () => {
  it('prices a video at $25', () => {
    expect(UGC_PRICE_CENTS).toBe(2500);
  });

  it('builds a queued ugc_video job with produce → review tasks', () => {
    const { job, tasks } = buildUgcJob({
      orgId: 'org-1',
      managedAccountId: 'acc-1',
      contentItemId: 'content-1',
    });
    expect(job).toEqual({
      orgId: 'org-1',
      managedAccountId: 'acc-1',
      jobType: 'ugc_video',
      state: 'queued',
      priority: 0,
      contentItemId: 'content-1',
    });
    expect(tasks.map(t => t.taskType)).toEqual(['produce_video', 'peer_review']);
  });

  it('honors a supplied priority', () => {
    const { job } = buildUgcJob({ orgId: 'o', managedAccountId: 'a', contentItemId: 'c', priority: 2 });
    expect(job.priority).toBe(2);
  });
});
