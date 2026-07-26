// Managed Content add-on (docs §19). Pure — no db/Env. Like Managed Posting but
// the deliverable is an APPROVED content piece in the customer's library, not an
// auto-publish: an operator drafts it; on QA approval the linked content_item is
// marked approved for the customer to schedule/publish themselves. Reuses the
// generic quota math from managed-posting.

// Monthly content-piece allotment per Managed Content tier. Keep in sync with the
// tier ids + allotments in the addons.ts catalog (managed_content).
export const MANAGED_CONTENT_QUOTA: Record<string, number> = {
  lite: 15,
  growth: 40,
  studio: 80,
};

/** Monthly content-piece quota for a tier id, or null for an unknown tier. */
export function contentQuotaForTier(tierId: string | null | undefined): number | null {
  if (!tierId) {
    return null;
  }
  return MANAGED_CONTENT_QUOTA[tierId] ?? null;
}

export type ContentPieceTask = { taskType: string; sequence: number };

export type NewContentPieceJob = {
  job: {
    orgId: string;
    managedAccountId: string;
    jobType: 'content_piece';
    state: 'queued';
    priority: number;
    contentItemId: string;
  };
  tasks: ContentPieceTask[];
};

/**
 * Build the content_piece job + tasks. No publish task — the piece is delivered
 * to the library on approval, not published to the platform.
 */
export function buildContentPieceJob(input: {
  orgId: string;
  managedAccountId: string;
  contentItemId: string;
  priority?: number;
}): NewContentPieceJob {
  return {
    job: {
      orgId: input.orgId,
      managedAccountId: input.managedAccountId,
      jobType: 'content_piece',
      state: 'queued',
      priority: input.priority ?? 0,
      contentItemId: input.contentItemId,
    },
    tasks: [
      { taskType: 'draft_content', sequence: 0 },
      { taskType: 'peer_review', sequence: 1 },
    ],
  };
}
