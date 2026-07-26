// Managed Content service (docs §19). DB layer for the Managed Content add-on:
// tier/quota, usage this month, and a content-piece request (a draft content_item
// + a content_piece job the operator fulfils). On QA approval (operations-service)
// the content_item is marked approved and lands in the customer's library.

import { and, count, eq, gte } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  contentItemSchema,
  managedAccountSchema,
  msiJobSchema,
  msiTaskSchema,
} from '@/models/Schema';

import { getOrgAddon } from './addon-service';
import { buildContentPieceJob, contentQuotaForTier } from './managed-content';
import { canRequestPost, remainingPosts } from './managed-posting';

const MANAGED_CONTENT_ADDON = 'managed_content';

export type ContentStatus =
  | { active: false }
  | { active: true; tierId: string | null; quota: number; used: number; remaining: number };

function monthStartUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Content pieces requested this month (each content_piece job = 1 quota). */
export async function countContentThisPeriod(orgId: string, now: Date = new Date()): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(msiJobSchema)
    .where(
      and(
        eq(msiJobSchema.orgId, orgId),
        eq(msiJobSchema.jobType, 'content_piece'),
        gte(msiJobSchema.createdAt, monthStartUtc(now)),
      ),
    );
  return row?.n ?? 0;
}

/** The org's Managed Content status: active?, tier, quota, usage, remaining. */
export async function getContentStatus(orgId: string, now: Date = new Date()): Promise<ContentStatus> {
  const sub = await getOrgAddon(orgId, MANAGED_CONTENT_ADDON);
  if (!sub || sub.status !== 'active') {
    return { active: false };
  }
  const quota = contentQuotaForTier(sub.tierId) ?? 0;
  const used = await countContentThisPeriod(orgId, now);
  return { active: true, tierId: sub.tierId, quota, used, remaining: remainingPosts(quota, used) };
}

export type ContentOutcome =
  | { ok: true; jobId: string; contentItemId: string; remaining: number }
  | { ok: false; error: string };

/** Request a content piece: gated on the add-on + quota + account ownership. */
export async function requestContentPiece(input: {
  orgId: string;
  managedAccountId: string;
  topic: string;
  notes?: string;
  priority?: number;
}): Promise<ContentOutcome> {
  const { orgId, managedAccountId } = input;
  const topic = input.topic.trim();
  if (!topic) {
    return { ok: false, error: 'A topic or brief is required.' };
  }

  const status = await getContentStatus(orgId);
  if (!status.active) {
    return { ok: false, error: 'Managed Content is not active. Activate it in Add-ons first.' };
  }
  if (status.quota <= 0) {
    return { ok: false, error: 'No Managed Content tier selected. Choose a tier in Add-ons.' };
  }
  if (!canRequestPost(status.quota, status.used)) {
    return {
      ok: false,
      error: `You've used all ${status.quota} content pieces in your Managed Content plan this month.`,
    };
  }

  const [account] = await db
    .select({ id: managedAccountSchema.id })
    .from(managedAccountSchema)
    .where(and(eq(managedAccountSchema.id, managedAccountId), eq(managedAccountSchema.orgId, orgId)))
    .limit(1);
  if (!account) {
    return { ok: false, error: 'Managed account not found.' };
  }

  const [content] = await db
    .insert(contentItemSchema)
    .values({
      orgId,
      caption: input.notes?.trim() || `Content brief: ${topic}`,
      contentType: 'image',
      topic,
      status: 'draft',
    })
    .returning({ id: contentItemSchema.id });
  if (!content) {
    return { ok: false, error: 'Could not create the draft. Please try again.' };
  }

  const { job, tasks } = buildContentPieceJob({
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
