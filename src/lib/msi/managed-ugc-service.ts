// Managed UGC service (docs §19). Request a short-form video (gated on the
// add-on); creates a draft content_item + a ugc_video job for an operator. On QA
// approval (operations-service) the content is delivered and a $25 per-video fee
// is billed via an invoice item.

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { contentItemSchema, managedAccountSchema, msiJobSchema, msiTaskSchema } from '@/models/Schema';

import { isAddonActive } from './addon-service';
import { buildUgcJob } from './managed-ugc';

const UGC_ADDON = 'managed_ugc';

export type UgcStatus = { active: boolean };

export async function getUgcStatus(orgId: string): Promise<UgcStatus> {
  return { active: await isAddonActive(orgId, UGC_ADDON) };
}

export type UgcOutcome =
  | { ok: true; jobId: string; contentItemId: string }
  | { ok: false; error: string };

/** Request a UGC video: gated on the add-on + account ownership. */
export async function requestUgcVideo(input: {
  orgId: string;
  managedAccountId: string;
  topic: string;
  notes?: string;
  priority?: number;
}): Promise<UgcOutcome> {
  const { orgId, managedAccountId } = input;
  const topic = input.topic.trim();
  if (!topic) {
    return { ok: false, error: 'Tell us what the video should be about.' };
  }
  if (!(await isAddonActive(orgId, UGC_ADDON))) {
    return { ok: false, error: 'Managed UGC is not active. Activate it in Add-ons first.' };
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
      caption: input.notes?.trim() || `UGC video: ${topic}`,
      contentType: 'video',
      topic,
      status: 'draft',
    })
    .returning({ id: contentItemSchema.id });
  if (!content) {
    return { ok: false, error: 'Could not create the request. Please try again.' };
  }

  const { job, tasks } = buildUgcJob({
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

  return { ok: true, jobId: jobRow!.id, contentItemId: content.id };
}
