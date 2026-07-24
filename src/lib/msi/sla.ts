// SLA computation (docs §7.5). Per-job-type due dates + percentile summaries
// for the "95% within N days" display. Pure.

import type { JobType } from './job-workflow';

/** Target completion time per job type, in hours. */
export const JOB_SLA_HOURS: Record<JobType, number> = {
  create_account: 48,
  update_profile: 24,
  replace_avatar: 12,
  update_bio: 12,
  prepare_first_posts: 48,
  publish_post: 6,
  pause_account: 4,
  resume_account: 4,
  transfer_ownership: 72,
  recover_account: 72,
  appeal_restriction: 120,
  archive_account: 24,
};

export function slaDueAt(jobType: JobType, from: Date = new Date()): Date {
  return new Date(from.getTime() + JOB_SLA_HOURS[jobType] * 3_600_000);
}

/** Nearest-rank percentile (p in 0..1). Returns 0 for empty input. */
export function percentile(samples: number[], p: number): number {
  if (samples.length === 0) {
    return 0;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil(clamp01(p) * sorted.length);
  const idx = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[idx] ?? 0;
}

export type SlaSummary = {
  sampleSize: number;
  p50: number;
  p90: number;
};

export function summarizeSla(samples: number[]): SlaSummary {
  return {
    sampleSize: samples.length,
    p50: percentile(samples, 0.5),
    p90: percentile(samples, 0.9),
  };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
