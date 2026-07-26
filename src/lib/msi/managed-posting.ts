// Managed Posting add-on (docs §19). Pure logic — no db/Env. The first MSI
// add-on with a real workflow: the customer requests a post; an operator drafts
// it (on a linked content_item); it flows through the standard job workflow
// (draft → peer_review → qa); on QA approval it enqueues a publish_post for the
// content. This module owns the per-tier monthly quota and the job/task shape.

// Monthly post allotment per Managed Posting tier. Keep in sync with the tier
// ids + allotments in the addons.ts catalog (managed_posting).
export const MANAGED_POSTING_QUOTA: Record<string, number> = {
  starter: 12,
  professional: 30,
  scale: 60,
};

/** Monthly post quota for a tier id, or null for an unknown tier. */
export function quotaForTier(tierId: string | null | undefined): number | null {
  if (!tierId) {
    return null;
  }
  return MANAGED_POSTING_QUOTA[tierId] ?? null;
}

/** Posts left this period. Never negative. */
export function remainingPosts(quota: number, usedThisPeriod: number): number {
  return Math.max(0, quota - usedThisPeriod);
}

/** Whether another post can be requested given the quota and usage so far. */
export function canRequestPost(quota: number, usedThisPeriod: number): boolean {
  return usedThisPeriod < quota;
}

export type ContentPostTask = { taskType: string; sequence: number };

export type NewContentPostJob = {
  job: {
    orgId: string;
    managedAccountId: string;
    jobType: 'content_post';
    state: 'queued';
    priority: number;
    contentItemId: string;
  };
  tasks: ContentPostTask[];
};

/**
 * Build the content_post job + tasks for a Managed Posting request. The job
 * carries the draft content_item the operator fills in; the standard workflow
 * (draft → review → publish) then applies.
 */
export function buildContentPostJob(input: {
  orgId: string;
  managedAccountId: string;
  contentItemId: string;
  priority?: number;
}): NewContentPostJob {
  return {
    job: {
      orgId: input.orgId,
      managedAccountId: input.managedAccountId,
      jobType: 'content_post',
      state: 'queued',
      priority: input.priority ?? 0,
      contentItemId: input.contentItemId,
    },
    tasks: [
      { taskType: 'draft_content', sequence: 0 },
      { taskType: 'peer_review', sequence: 1 },
      { taskType: 'publish', sequence: 2 },
    ],
  };
}
