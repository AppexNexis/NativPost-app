import { describe, expect, it } from 'vitest';

import {
  allTasksDoneAfter,
  buildProvisioningJob,
  PROVISIONING_TASK_TYPES,
} from './provisioning-jobs';

describe('buildProvisioningJob', () => {
  it('builds a queued create_account job with the full checklist', () => {
    const { job, tasks } = buildProvisioningJob({ orgId: 'o', managedAccountId: 'a' });
    expect(job).toMatchObject({
      orgId: 'o',
      managedAccountId: 'a',
      jobType: 'create_account',
      state: 'queued',
    });
    expect(tasks.map(t => t.taskType)).toEqual([...PROVISIONING_TASK_TYPES]);
    expect(tasks.map(t => t.sequence)).toEqual([0, 1, 2, 3]);
  });
});

describe('allTasksDoneAfter', () => {
  it('is true only when the completed task finishes the last pending one', () => {
    const tasks = [
      { id: 't1', status: 'done' },
      { id: 't2', status: 'in_progress' },
    ];
    expect(allTasksDoneAfter(tasks, 't2')).toBe(true); // t2 becomes done → all done
    expect(allTasksDoneAfter(tasks, 't1')).toBe(false); // t2 still not done
  });

  it('is true for a single-task job', () => {
    expect(allTasksDoneAfter([{ id: 't', status: 'pending' }], 't')).toBe(true);
  });
});
