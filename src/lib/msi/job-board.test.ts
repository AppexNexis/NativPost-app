import { describe, expect, it } from 'vitest';

import {
  buildJobBoard,
  jobStateTone,
  type JobRow,
  taskStatusTone,
  type TaskRow,
} from './job-board';

const job = (id: string, over: Partial<JobRow> = {}): JobRow => ({
  id,
  jobType: 'create_account',
  state: 'in_progress',
  priority: 0,
  attempts: 0,
  maxAttempts: 3,
  slaDueAt: null,
  createdAt: new Date('2026-07-24T00:00:00Z'),
  ...over,
});

const task = (id: string, jobId: string, sequence: number, status: string): TaskRow => ({
  id,
  jobId,
  taskType: 'profile_setup',
  status,
  sequence,
});

describe('buildJobBoard', () => {
  it('nests tasks under jobs, sorted by sequence, with done counts', () => {
    const board = buildJobBoard(
      [job('j1'), job('j2')],
      [
        task('t2', 'j1', 2, 'pending'),
        task('t1', 'j1', 1, 'done'),
        task('t3', 'j2', 1, 'done'),
      ],
    );
    const j1 = board.find(j => j.id === 'j1')!;
    expect(j1.tasks.map(t => t.id)).toEqual(['t1', 't2']); // sorted by sequence
    expect(j1.taskCount).toBe(2);
    expect(j1.tasksDone).toBe(1);

    const j2 = board.find(j => j.id === 'j2')!;
    expect(j2.tasksDone).toBe(1);
    expect(j2.taskCount).toBe(1);
  });

  it('handles jobs with no tasks', () => {
    const board = buildJobBoard([job('j1')], []);
    expect(board[0]!.tasks).toEqual([]);
    expect(board[0]!.taskCount).toBe(0);
    expect(board[0]!.tasksDone).toBe(0);
  });
});

describe('state tones', () => {
  it('maps job states to tones', () => {
    expect(jobStateTone('completed')).toBe('live');
    expect(jobStateTone('failed')).toBe('danger');
    expect(jobStateTone('qa')).toBe('progress');
    expect(jobStateTone('queued')).toBe('neutral');
  });

  it('maps task statuses to tones', () => {
    expect(taskStatusTone('done')).toBe('live');
    expect(taskStatusTone('in_progress')).toBe('progress');
    expect(taskStatusTone('skipped')).toBe('warn');
    expect(taskStatusTone('pending')).toBe('neutral');
  });
});
