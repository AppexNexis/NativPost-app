// Managed Posting service (docs §19). DB layer for the Managed Posting add-on:
// reads the org's tier/quota, counts usage this period, and creates a posting
// request (a draft content_item + a content_post job the operator fulfils). The
// content_post job flows through the standard workflow and, on QA approval,
// enqueues a publish_post (see operations-service) — reusing the whole pipeline.

import { and, count, eq, gte } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  contentItemSchema,
  managedAccountSchema,
  msiJobSchema,
  msiTaskSchema,
} from '@/models/Schema';

import { getOrgAddon } from './addon-service';
import {
  buildContentPostJob,
  canRequestPost,
  quotaForTier,
  remainingPosts,
} from './managed-posting';

const MANAGED_POSTING_ADDON = 'managed_posting';

export type PostingStatus =
  | { active: false }
  | {
      active: true;
      tierId: string | null;
      quota: number;
      used: number;
      remaining: number;
    };

/** Start of the current calendar month, UTC — the quota window. */
function monthStartUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Count content_post jobs an org has requested this month (each = 1 quota). */
export async function countPostsThisPeriod(orgId: string, now: Date = new Date()): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(msiJobSchema)
    .where(
      and(
        eq(msiJobSchema.orgId, orgId),
        eq(msiJobSchema.jobType, 'content_post'),
        gte(msiJobSchema.createdAt, monthStartUtc(now)),
      ),
    );
  return row?.n ?? 0;
}

/** The org's Managed Posting status: active?, tier, quota, usage, remaining. */
export async function getPostingStatus(orgId: string, now: Date = new Date()): Promise<PostingStatus> {
  const sub = await getOrgAddon(orgId, MANAGED_POSTING_ADDON);
  if (!sub || sub.status !== 'active') {
    return { active: false };
  }
  const quota = quotaForTier(sub.tierId) ?? 0;
  const used = await countPostsThisPeriod(orgId, now);
  return {
    active: true,
    tierId: sub.tierId,
    quota,
    used,
    remaining: remainingPosts(quota, used),
  };
}

export type RequestOutcome =
  | { ok: true; jobId: string; contentItemId: string; remaining: number }
  | { ok: false; error: string };

/**
 * Create a Managed Posting request: validates the add-on is active + within
 * quota, that the managed account belongs to the org, then inserts a draft
 * content_item and a content_post job (+ tasks) for an operator to fulfil.
 */
export async function requestManagedPost(input: {
  orgId: string;
  managedAccountId: string;
  topic: string;
  notes?: string;
  priority?: number;
}): Promise<RequestOutcome> {
  const { orgId, managedAccountId } = input;
  const topic = input.topic.trim();
  if (!topic) {
    return { ok: false, error: 'A topic or brief is required.' };
  }

  const status = await getPostingStatus(orgId);
  if (!status.active) {
    return { ok: false, error: 'Managed Posting is not active. Activate it in Add-ons first.' };
  }
  if (status.quota <= 0) {
    return { ok: false, error: 'No Managed Posting tier selected. Choose a tier in Add-ons.' };
  }
  if (!canRequestPost(status.quota, status.used)) {
    return {
      ok: false,
      error: `You've used all ${status.quota} posts in your Managed Posting plan this month.`,
    };
  }

  // The account must belong to this org (no cross-org requests).
  const [account] = await db
    .select({ id: managedAccountSchema.id })
    .from(managedAccountSchema)
    .where(and(eq(managedAccountSchema.id, managedAccountId), eq(managedAccountSchema.orgId, orgId)))
    .limit(1);
  if (!account) {
    return { ok: false, error: 'Managed account not found.' };
  }

  // Draft content the operator fills in. Minimal required fields; the brief goes
  // into topic + caption for the operator to refine.
  const [content] = await db
    .insert(contentItemSchema)
    .values({
      orgId,
      caption: input.notes?.trim() || `Managed post: ${topic}`,
      contentType: 'image',
      topic,
      status: 'draft',
    })
    .returning({ id: contentItemSchema.id });

  if (!content) {
    return { ok: false, error: 'Could not create the draft. Please try again.' };
  }

  const { job, tasks } = buildContentPostJob({
    orgId,
    managedAccountId,
    contentItemId: content.id,
    priority: input.priority,
  });
  const [jobRow] = await db.insert(msiJobSchema).values(job).returning({ id: msiJobSchema.id });
  if (jobRow && tasks.length > 0) {
    await db.insert(msiTaskSchema).values(
      tasks.map(t => ({ jobId: jobRow.id, taskType: t.taskType, sequence: t.sequence })),
    );
  }

  return {
    ok: true,
    jobId: jobRow!.id,
    contentItemId: content.id,
    remaining: remainingPosts(status.quota, status.used + 1),
  };
}
