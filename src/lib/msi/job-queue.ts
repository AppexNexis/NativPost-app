// Pure shaping for the cross-org Ops queue (docs §8). Groups jobs by state in a
// work-priority order and flags SLA breaches. No db/Env.

import type { JobState } from './job-workflow';
import { isJobTerminal } from './job-workflow';

/** A non-terminal job past its SLA due time (matches the worker's breach rule). */
export function jobSlaBreached(
  job: { state: string; slaDueAt: Date | null },
  now: Date = new Date(),
): boolean {
  return (
    !isJobTerminal(job.state as JobState)
    && job.slaDueAt !== null
    && job.slaDueAt.getTime() < now.getTime()
  );
}

export function countByState<T extends { state: string }>(
  jobs: T[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const j of jobs) {
    counts[j.state] = (counts[j.state] ?? 0) + 1;
  }
  return counts;
}

/** Display order: work needing attention first, terminal states last. */
export const QUEUE_STATE_ORDER: readonly string[] = [
  'failed',
  'peer_review',
  'qa',
  'in_progress',
  'blocked',
  'assigned',
  'queued',
  'completed',
  'cancelled',
];

export function groupJobsByState<T extends { state: string }>(
  jobs: T[],
): { state: string; jobs: T[] }[] {
  const byState = new Map<string, T[]>();
  for (const j of jobs) {
    const list = byState.get(j.state) ?? [];
    list.push(j);
    byState.set(j.state, list);
  }

  const rank = (s: string) => {
    const i = QUEUE_STATE_ORDER.indexOf(s);
    return i === -1 ? QUEUE_STATE_ORDER.length : i;
  };

  return [...byState.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([state, list]) => ({ state, jobs: list }));
}
