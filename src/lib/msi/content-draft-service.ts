// Content drafting for the Managed Posting add-on (docs §19). An operator opens
// a content_post job, reads the customer's brief (the linked content_item's
// topic), writes the post (caption + graphic), and saves it. The standard job
// workflow (mark draft_content done → review → QA) then carries it to publish.

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { contentItemSchema, msiJobSchema } from '@/models/Schema';

export interface ContentPostDraft {
  jobId: string;
  contentItemId: string;
  topic: string | null;
  caption: string;
  contentType: string;
  graphicUrls: string[];
}

async function loadDraft(jobId: string): Promise<ContentPostDraft | null> {
  const [job] = await db
    .select({
      jobType: msiJobSchema.jobType,
      contentItemId: msiJobSchema.contentItemId,
    })
    .from(msiJobSchema)
    .where(eq(msiJobSchema.id, jobId))
    .limit(1);
  const DRAFTABLE_TYPES = ['content_post', 'content_piece', 'ugc_video'];
  if (!job || !DRAFTABLE_TYPES.includes(job.jobType) || !job.contentItemId) {
    return null;
  }
  const [content] = await db
    .select({
      id: contentItemSchema.id,
      topic: contentItemSchema.topic,
      caption: contentItemSchema.caption,
      contentType: contentItemSchema.contentType,
      graphicUrls: contentItemSchema.graphicUrls,
    })
    .from(contentItemSchema)
    .where(eq(contentItemSchema.id, job.contentItemId))
    .limit(1);
  if (!content) {
    return null;
  }
  return {
    jobId,
    contentItemId: content.id,
    topic: content.topic,
    caption: content.caption,
    contentType: content.contentType,
    graphicUrls: Array.isArray(content.graphicUrls) ? (content.graphicUrls as string[]) : [],
  };
}

/** The draft behind a content_post job, or null if it isn't one. */
export async function getContentPostDraft(jobId: string): Promise<ContentPostDraft | null> {
  return loadDraft(jobId);
}

/** Update the operator's draft on a content_post job's linked content_item. */
export async function saveContentPostDraft(
  jobId: string,
  patch: { caption?: string; contentType?: string; graphicUrls?: string[] },
): Promise<ContentPostDraft | null> {
  const draft = await loadDraft(jobId);
  if (!draft) {
    return null;
  }
  const next = {
    caption: patch.caption?.trim() || draft.caption,
    contentType: patch.contentType || draft.contentType,
    graphicUrls: Array.isArray(patch.graphicUrls) ? patch.graphicUrls.filter(Boolean) : draft.graphicUrls,
  };
  await db
    .update(contentItemSchema)
    .set(next)
    .where(eq(contentItemSchema.id, draft.contentItemId));
  return { ...draft, ...next };
}
