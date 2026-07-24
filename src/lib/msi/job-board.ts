// Pure shaping for the Ops job board (docs §7, §8). Nests tasks under their
// jobs (sequenced) with a done/total progress count, and maps job/task states
// to display tones. No db/Env.

import type { StateTone } from './display';

export type JobRow = {
  id: string;
  jobType: string;
  state: string;
  priority: number;
  attempts: number;
  maxAttempts: number;
  slaDueAt: Date | null;
  createdAt: Date;
};

export type TaskRow = {
  id: string;
  jobId: string;
  taskType: string;
  status: string;
  sequence: number;
};

export type JobWithTasks = JobRow & {
  tasks: TaskRow[];
  tasksDone: number;
  taskCount: number;
};

export function buildJobBoard(jobs: JobRow[], tasks: TaskRow[]): JobWithTasks[] {
  const byJob = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    const list = byJob.get(t.jobId) ?? [];
    list.push(t);
    byJob.set(t.jobId, list);
  }

  return jobs.map((j) => {
    const jobTasks = (byJob.get(j.id) ?? [])
      .slice()
      .sort((a, b) => a.sequence - b.sequence);
    return {
      ...j,
      tasks: jobTasks,
      tasksDone: jobTasks.filter(t => t.status === 'done').length,
      taskCount: jobTasks.length,
    };
  });
}

export function jobStateTone(state: string): StateTone {
  switch (state) {
    case 'completed':
      return 'live';
    case 'failed':
      return 'danger';
    case 'blocked':
      return 'warn';
    case 'in_progress':
    case 'peer_review':
    case 'qa':
      return 'progress';
    case 'cancelled':
    default:
      return 'neutral'; // queued, assigned, cancelled
  }
}

export function taskStatusTone(status: string): StateTone {
  switch (status) {
    case 'done':
      return 'live';
    case 'in_progress':
      return 'progress';
    case 'skipped':
      return 'warn';
    default:
      return 'neutral'; // pending
  }
}
