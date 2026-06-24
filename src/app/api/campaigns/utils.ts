// ============================================================
// Campaign Engine — Shared Utilities
// ============================================================

import { eq, and, gte, lt, sql } from 'drizzle-orm';

import {
  campaignContentSchema,
  campaignSchema,
  contentAngleSchema,
  contentItemSchema,
  contentTemplateSchema,
  publishingQueueSchema,
  socialAccountSchema,
} from '@/models/Schema';

export const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
export const API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

// ── Content type mapping ─────────────────────────────────────────────────────

const MIX_KEY_TO_CONTENT_TYPE: Record<string, string> = {
  slideshow: 'reel',
  wallOfText: 'text_only',
  greenScreen: 'reel',
  videoHook: 'reel',
  talkingHead: 'reel',
  carousel: 'carousel',
  ugc: 'ugc_ad',
  dataStory: 'data_story',
  scene: 'scene',
  textMotion: 'text_motion',
  aiGraphic: 'ai_graphic',
  thumbnail: 'thumbnail',
};

export function mapMixKeyToContentType(mixKey: string): string {
  return MIX_KEY_TO_CONTENT_TYPE[mixKey] || mixKey;
}

const CONTENT_TYPE_TO_MEDIA_GENERATOR: Record<string, string | null> = {
  reel: 'generate-video',
  single_image: 'generate-image',
  carousel: 'generate-carousel',
  text_only: null,
  ugc_ad: 'generate-ugc-ad',
  data_story: 'generate-data-story',
  scene: 'generate-scene',
  text_motion: 'generate-text-motion',
  ai_graphic: 'generate-ai-graphic',
  thumbnail: 'generate-thumbnail',
};

export function getMediaGenerator(contentType: string): string | null {
  return CONTENT_TYPE_TO_MEDIA_GENERATOR[contentType] ?? null;
}

// ── Weighted random selection ────────────────────────────────────────────────

export interface WeightedItem {
  weight: number;
}

export function pickWeighted<T extends WeightedItem>(items: T[]): T | undefined {
  if (!items || items.length === 0) return undefined;
  const total = items.reduce((sum, i) => sum + (i.weight || 0), 0);
  if (total <= 0) return items[0];
  let random = Math.random() * total;
  for (const item of items) {
    random -= (item.weight || 0);
    if (random <= 0) return item;
  }
  return items[items.length - 1];
}

export function pickContentType(contentMix: Record<string, number>): string {
  const entries = Object.entries(contentMix).filter(([, v]) => (v || 0) > 0);
  if (entries.length === 0) return 'reel';
  const weighted = entries.map(([key, value]) => ({ key, weight: value || 0 }));
  const picked = pickWeighted(weighted);
  return mapMixKeyToContentType(picked?.key || 'reel');
}

export function pickAngle(angles: { angleId: string; weight: number }[]): string | undefined {
  if (!angles || angles.length === 0) return undefined;
  return pickWeighted(angles)?.angleId;
}

// ── Scheduling ───────────────────────────────────────────────────────────────

export function calculateSchedule(
  startDate: Date | null,
  postsPerDay: number,
  postIndex: number,
): { scheduledDate: Date; scheduledTime: string } {
  const effectiveStart = startDate ? new Date(startDate) : new Date();
  effectiveStart.setHours(0, 0, 0, 0);

  const dayIndex = Math.floor(postIndex / postsPerDay);
  const slotIndex = postIndex % postsPerDay;

  // Spread posts across typical engagement hours
  const timeSlots = ['09:00', '13:00', '17:00', '11:00', '15:00', '19:00', '08:00', '16:00', '20:00'];
  const scheduledTime = timeSlots[slotIndex % timeSlots.length] || '09:00';

  const scheduledDate = new Date(effectiveStart);
  scheduledDate.setDate(scheduledDate.getDate() + dayIndex);

  return { scheduledDate, scheduledTime };
}

export function combineDateAndTime(date: Date, timeStr: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const result = new Date(date);
  result.setHours(hours || 0, minutes || 0, 0, 0);
  return result;
}

// ── Internal API helpers ─────────────────────────────────────────────────────

export async function callInternalApi(
  endpoint: string,
  method: 'GET' | 'POST' = 'POST',
  body?: unknown,
  orgId?: string,
): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`,
  };
  if (orgId) {
    headers['X-Org-Id'] = orgId;
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`Internal API ${endpoint} failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function generateTextContent(params: {
  topic: string;
  contentType: string;
  targetPlatforms: string[];
  contentMode?: string;
  templateId?: string;
  angleId?: string;
  campaignId?: string;
  orgId?: string;
}) {
  const body = {
    topic: params.topic,
    contentType: params.contentType,
    targetPlatforms: params.targetPlatforms,
    numVariants: 1,
    contentMode: params.contentMode || 'normal',
    ...(params.templateId ? { templateId: params.templateId } : {}),
    ...(params.angleId ? { angleId: params.angleId } : {}),
    ...(params.campaignId ? { campaignId: params.campaignId } : {}),
  };
  return callInternalApi('/api/content/generate', 'POST', body, params.orgId);
}

export async function generateMediaForContentItem(
  contentItemId: string,
  contentType: string,
  orgId?: string,
) {
  const generator = getMediaGenerator(contentType);
  if (!generator) return null;
  return callInternalApi(`/api/content/${contentItemId}/${generator}`, 'POST', {}, orgId);
}

// ── Template selection ───────────────────────────────────────────────────────

export async function pickTemplate(
  db: any,
  orgId: string,
  contentType: string,
  angleId?: string,
): Promise<string | undefined> {
  if (!angleId) return undefined;

  try {
    const [angle] = await db
      .select()
      .from(contentAngleSchema)
      .where(
        and(
          eq(contentAngleSchema.id, angleId),
          eq(contentAngleSchema.orgId, orgId),
        ),
      )
      .limit(1);

    if (!angle) return undefined;

    const templates = await db
      .select()
      .from(contentTemplateSchema)
      .where(
        and(
          eq(contentTemplateSchema.contentType, contentType),
          eq(contentTemplateSchema.curationStatus, 'approved'),
          eq(contentTemplateSchema.isActive, true),
        ),
      )
      .limit(50);

    const matching = templates.filter((t: any) => {
      const tAngles = (t.angles as string[]) || [];
      return tAngles.includes(angle.name) || tAngles.includes(angleId);
    });

    if (matching.length === 0) return undefined;

    const idx = Math.floor(Math.random() * matching.length);
    return matching[idx].id;
  } catch (err) {
    console.error('[Template] Failed to pick template:', err);
    return undefined;
  }
}

// ── Progress types ───────────────────────────────────────────────────────────

export interface GenerationProgress {
  postIndex: number;
  total: number;
  status: string;
  percent: number;
}

export interface PostCompleteEvent {
  postIndex: number;
  contentItemId: string;
  contentType: string;
  scheduledDate: string;
}

export interface PostErrorEvent {
  postIndex: number;
  detail: string;
}

export interface GenerationResult {
  totalPosts: number;
  completedPosts: number;
  failedPosts: number;
  contentItemIds: string[];
}

// ── Core generation orchestrator ─────────────────────────────────────────────

export async function generateCampaignPosts(
  db: any,
  orgId: string,
  campaign: any,
  topicOverride?: string,
  targetPlatformsOverride?: string[],
  onProgress?: (progress: GenerationProgress) => void | Promise<void>,
  onPostComplete?: (event: PostCompleteEvent) => void | Promise<void>,
  onPostError?: (event: PostErrorEvent) => void | Promise<void>,
): Promise<GenerationResult> {
  const postsPerDay = campaign.postsPerDay || 3;
  const campaignLengthDays = campaign.campaignLengthDays || 7;
  const totalPosts = postsPerDay * campaignLengthDays;

  const contentMix = (campaign.contentMix as Record<string, number>) || {};
  const angles = (campaign.angles as { angleId: string; weight: number }[]) || [];

  // Derive topic and platforms
  const topic = topicOverride || campaign.name || campaign.description || 'General';
  let targetPlatforms: string[];

  if (targetPlatformsOverride && targetPlatformsOverride.length > 0) {
    targetPlatforms = targetPlatformsOverride;
  } else {
    // Default to org's connected platforms or a safe fallback
    const accounts = await db
      .select({ platform: socialAccountSchema.platform })
      .from(socialAccountSchema)
      .where(and(eq(socialAccountSchema.orgId, orgId), eq(socialAccountSchema.isActive, true)));

    // targetPlatforms = accounts.length > 0
    //   ? [...new Set(accounts.map((a: any) => a.platform))]
    //   : ['instagram', 'linkedin'];
    targetPlatforms = accounts.length > 0
      ? Array.from(new Set(accounts.map((a: any) => a.platform as string)))
      : ['instagram', 'linkedin'];
  }

  let failedPosts = 0;
  const contentItemIds: string[] = [];

  for (let i = 0; i < totalPosts; i++) {
    try {
      onProgress?.({
        postIndex: i,
        total: totalPosts,
        status: 'generating_text',
        percent: Math.round((i / totalPosts) * 100),
      });

      const contentType = pickContentType(contentMix);
      const angleId = pickAngle(angles);

      // Pick template if remixRatio applies
      let templateId: string | undefined;
      if ((campaign.remixRatio || 0) > 0 && Math.random() * 100 < (campaign.remixRatio || 0)) {
        templateId = await pickTemplate(db, orgId, contentType, angleId);
      }

      // Generate text
      const textResult = await generateTextContent({
        topic,
        contentType,
        targetPlatforms,
        contentMode: 'normal',
        templateId,
        angleId,
        campaignId: campaign.id,
        orgId,
      });

      const variant = textResult.variants?.[0];
      if (!variant || !variant.id) {
        throw new Error('No variant returned from text generation');
      }

      const contentItemId = variant.id;
      contentItemIds.push(contentItemId);

      // Generate media
      onProgress?.({
        postIndex: i,
        total: totalPosts,
        status: 'generating_media',
        percent: Math.round((i / totalPosts) * 100),
      });

      try {
        await generateMediaForContentItem(contentItemId, contentType, orgId);
      } catch (mediaErr: any) {
        // Media failure is non-fatal — the post exists, just without media
        console.warn(`[Campaign] Media generation failed for post ${i}:`, mediaErr.message);
      }

      // Schedule
      const { scheduledDate, scheduledTime } = calculateSchedule(campaign.startDate, postsPerDay, i);

      // Link to campaign
      await db.insert(campaignContentSchema).values({
        campaignId: campaign.id,
        contentItemId,
        sequenceIndex: i,
        scheduledDate,
        scheduledTime,
      });

      // Update content item with v2 metadata
      await db.update(contentItemSchema)
        .set({
          status: 'pending_review',
          updatedAt: new Date(),
        })
        .where(eq(contentItemSchema.id, contentItemId));

      onPostComplete?.({
        postIndex: i,
        contentItemId,
        contentType,
        // scheduledDate: scheduledDate.toISOString().split('T')[0],
        scheduledDate: scheduledDate.toISOString().slice(0, 10),

      });
    } catch (err: any) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`[Campaign] Post ${i} failed:`, detail);
      onPostError?.({ postIndex: i, detail });
      failedPosts++;
    }
  }

  return {
    totalPosts,
    completedPosts: totalPosts - failedPosts,
    failedPosts,
    contentItemIds,
  };
}

// ── Re-roll helper ───────────────────────────────────────────────────────────

export async function reRollPost(
  db: any,
  orgId: string,
  campaignId: string,
  contentItemId: string,
  keepText: boolean,
): Promise<any> {
  // Find campaignContent link
  const [cc] = await db
    .select()
    .from(campaignContentSchema)
    .where(
      and(
        eq(campaignContentSchema.campaignId, campaignId),
        eq(campaignContentSchema.contentItemId, contentItemId),
      ),
    )
    .limit(1);

  if (!cc) {
    throw new Error('Content item not found in this campaign');
  }

  // Get content item
  const [item] = await db
    .select()
    .from(contentItemSchema)
    .where(eq(contentItemSchema.id, contentItemId))
    .limit(1);

  if (!item || item.orgId !== orgId) {
    throw new Error('Content item not found');
  }

  // Regenerate text if requested
  if (!keepText) {
    const textResult = await generateTextContent({
      topic: item.topic || 'General',
      contentType: item.contentType,
      targetPlatforms: (item.targetPlatforms as string[]) || ['instagram', 'linkedin'],
      contentMode: item.contentMode || 'normal',
      orgId,
    });

    const variant = textResult.variants?.[0];
    if (variant) {
      await db.update(contentItemSchema)
        .set({
          caption: variant.caption,
          hashtags: variant.hashtags || [],
          platformSpecific: variant.platformSpecific || {},
          antiSlopScore: variant.antiSlopScore ?? null,
          qualityFlags: variant.qualityFlags || [],
          graphicUrls: [], // clear media for regeneration
          updatedAt: new Date(),
        })
        .where(eq(contentItemSchema.id, contentItemId));
    }
  }

  // Regenerate media
  try {
    await generateMediaForContentItem(contentItemId, item.contentType, orgId);
  } catch (mediaErr: any) {
    console.warn(`[Re-roll] Media generation failed:`, mediaErr.message);
  }

  // Mark as rolled
  await db.update(campaignContentSchema)
    .set({ isRolled: true })
    .where(eq(campaignContentSchema.id, cc.id));

  // Decrement re-rolls
  await db.update(campaignSchema)
    .set({
      reRollsRemaining: sql`${campaignSchema.reRollsRemaining} - 1`,
      updatedAt: new Date(),
    })
    .where(eq(campaignSchema.id, campaignId));

  // Return updated item
  const [updatedItem] = await db
    .select()
    .from(contentItemSchema)
    .where(eq(contentItemSchema.id, contentItemId))
    .limit(1);

  return updatedItem;
}

// ── Launch helper ──────────────────────────────────────────────────────────────

export async function scheduleCampaignPosts(
  db: any,
  orgId: string,
  campaignId: string,
): Promise<number> {
  const items = await db
    .select({
      cc: campaignContentSchema,
      ci: contentItemSchema,
    })
    .from(campaignContentSchema)
    .leftJoin(contentItemSchema, eq(campaignContentSchema.contentItemId, contentItemSchema.id))
    .where(eq(campaignContentSchema.campaignId, campaignId));

  const accounts = await db
    .select()
    .from(socialAccountSchema)
    .where(and(eq(socialAccountSchema.orgId, orgId), eq(socialAccountSchema.isActive, true)));

  let scheduledCount = 0;

  for (const row of items) {
    const contentItem = row.ci;
    const cc = row.cc;
    if (!contentItem) continue;

    const platforms = (contentItem.targetPlatforms as string[]) || [];

    for (const platform of platforms) {
      const account = accounts.find((a: any) => a.platform === platform);
      if (!account) continue;

      const scheduledFor = cc.scheduledDate
        ? combineDateAndTime(cc.scheduledDate, cc.scheduledTime || '09:00')
        : new Date();

      await db.insert(publishingQueueSchema).values({
        contentItemId: contentItem.id,
        socialAccountId: account.id,
        platform,
        scheduledFor,
        status: 'queued',
      });

      scheduledCount++;
    }

    // Update content item status to scheduled
    await db.update(contentItemSchema)
      .set({ status: 'scheduled', updatedAt: new Date() })
      .where(eq(contentItemSchema.id, contentItem.id));
  }

  return scheduledCount;
}

// ── Calendar helper ────────────────────────────────────────────────────────────

export async function getCampaignCalendar(
  db: any,
  campaignId: string,
  month: string, // YYYY-MM
): Promise<any[]> {
  const startOfMonth = new Date(`${month}-01T00:00:00Z`);
  const endOfMonth = new Date(startOfMonth);
  endOfMonth.setMonth(endOfMonth.getMonth() + 1);

  const items = await db
    .select({
      cc: campaignContentSchema,
      ci: contentItemSchema,
    })
    .from(campaignContentSchema)
    .leftJoin(contentItemSchema, eq(campaignContentSchema.contentItemId, contentItemSchema.id))
    .where(
      and(
        eq(campaignContentSchema.campaignId, campaignId),
        gte(campaignContentSchema.scheduledDate, startOfMonth),
        lt(campaignContentSchema.scheduledDate, endOfMonth),
      ),
    )
    .orderBy(campaignContentSchema.scheduledDate, campaignContentSchema.scheduledTime);

  const grouped: Record<string, any[]> = {};

  // for (const row of items) {
  //   const date = row.cc.scheduledDate
  //     ? new Date(row.cc.scheduledDate).toISOString().split('T')[0]
  //     : 'unscheduled';
  //   if (!grouped[date]) grouped[date] = [];
  //   grouped[date].push({
  //     ...row.cc,
  //     contentItem: row.ci,
  //   });
  // }

  for (const row of items) {
    const date = row.cc.scheduledDate
      ? new Date(row.cc.scheduledDate).toISOString().slice(0, 10)
      : 'unscheduled';
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push({
      ...row.cc,
      contentItem: row.ci,
    });
  }

  return Object.entries(grouped).map(([date, contentItems]) => ({
    date,
    contentItems,
  }));
}
