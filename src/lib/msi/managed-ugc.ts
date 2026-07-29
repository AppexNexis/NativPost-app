// Managed UGC add-on (docs §19). Pure — no db/Env. Per-deliverable pricing: the
// customer requests a short-form video; an operator (with AI) produces it; on QA
// approval the content is delivered and a per-video fee is billed. No monthly
// quota — you pay per deliverable.

export const UGC_PRICE_CENTS = 2500; // $25 per delivered video

export type UgcTask = { taskType: string; sequence: number };

export type NewUgcJob = {
  job: {
    orgId: string;
    managedAccountId: string;
    jobType: 'ugc_video';
    state: 'queued';
    priority: number;
    contentItemId: string;
  };
  tasks: UgcTask[];
};

/** Build the ugc_video job + tasks (produce → review; deliver on approval). */
export function buildUgcJob(input: {
  orgId: string;
  managedAccountId: string;
  contentItemId: string;
  priority?: number;
}): NewUgcJob {
  return {
    job: {
      orgId: input.orgId,
      managedAccountId: input.managedAccountId,
      jobType: 'ugc_video',
      state: 'queued',
      priority: input.priority ?? 0,
      contentItemId: input.contentItemId,
    },
    tasks: [
      { taskType: 'produce_video', sequence: 0 },
      { taskType: 'peer_review', sequence: 1 },
    ],
  };
}
