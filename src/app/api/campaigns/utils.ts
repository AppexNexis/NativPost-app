// ============================================================
// Campaign Engine — Shared Utilities
// ============================================================

import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';

import { applySetToSlots } from '@/lib/blitz/apply-set-to-slots';
import { buildEditorScript, buildReasoning } from '@/lib/blitz/build-editor-script';
import { buildSourceMediaSlots } from '@/lib/blitz/build-source-media-slots';
import { pickDefaultSet } from '@/lib/blitz/pick-default-set';
import {
  BLITZ_ALLOWED_PLATFORMS,
  getConnectedPlatforms,
  NoConnectedChannelsError,
} from '@/lib/social/connected-platforms';
import {
  brandProfileSchema,
  campaignContentSchema,
  campaignSchema,
  contentAngleSchema,
  contentItemSchema,
  contentTemplateSchema,
  publishingQueueSchema,
  socialAccountSchema,
} from '@/models/Schema';

export const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
export const ENGINE_URL = process.env.NATIVPOST_ENGINE_URL || 'http://localhost:8000';
export const API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

// Content types the Remotion preview pipeline knows how to render.
// Mirrors COMPOSITION_BY_TYPE in src/components/editor/RemotionPreviewPlayer.tsx.
// Anything else can't be previewed on the Blitz swipe card and must be
// skipped at insert time rather than persisting a dead row.
const RENDERABLE_CONTENT_TYPES = new Set([
  'slideshow',
  'carousel',
  'data_story',
  'wall_of_text',
  'talking_head',
  'green_screen',
  'video_hook',
  'ugc',
  'reel',
  'single_image',
]);

// ── Content type mapping ─────────────────────────────────────────────────────

const MIX_KEY_TO_CONTENT_TYPE: Record<string, string> = {
  slideshow: 'reel',
  greenScreen: 'reel',
  videoHook: 'reel',
  talkingHead: 'reel',
  carousel: 'slideshow',
  ugc: 'ugc_ad',
  dataStory: 'data_story',
  scene: 'scene',
  textMotion: 'text_motion',
  aiGraphic: 'ai_graphic',
  thumbnail: 'thumbnail',
};

// Maps camelCase mix keys to their actual template content_type column values.
// Template rows store snake_case content types (e.g. 'green_screen', 'video_hook')
// distinct from the engine-level type 'reel'. fetchCampaignTemplates uses this so
// the template-availability gate matches rows the DB actually has.
const MIX_KEY_TO_TEMPLATE_CONTENT_TYPE: Record<string, string> = {
  slideshow: 'slideshow',
  greenScreen: 'green_screen',
  videoHook: 'video_hook',
  talkingHead: 'talking_head',
  carousel: 'carousel',
  ugc: 'ugc',
  dataStory: 'data_story',
  wallOfText: 'wall_of_text',
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

// ── Engine campaign request builder ───────────────────────────────────────────

function mapContentMixToEngine(mix: Record<string, number>) {
  return {
    slideshow: mix.slideshow ?? 0,
    green_screen: mix.greenScreen ?? 0,
    video_hook: mix.videoHook ?? 0,
    talking_head: mix.talkingHead ?? 0,
    carousel: mix.carousel ?? 0,
    ugc: mix.ugc ?? 0,
  };
}

function buildEngineBrandProfile(profile: any) {
  return {
    brand_name: profile.brandName,
    industry: profile.industry,
    target_audience: profile.targetAudience,
    company_description: profile.companyDescription,
    tone_formality: profile.toneFormality,
    tone_humor: profile.toneHumor,
    tone_energy: profile.toneEnergy,
    vocabulary: profile.vocabulary,
    forbidden_words: profile.forbiddenWords,
    communication_style: profile.communicationStyle,
    primary_color: profile.primaryColor,
    image_style: profile.imageStyle,
    content_examples: profile.contentExamples,
    anti_patterns: profile.antiPatterns,
    hashtag_strategy: profile.hashtagStrategy,
    linkedin_voice: profile.linkedinVoice,
    instagram_voice: profile.instagramVoice,
    twitter_voice: profile.twitterVoice,
    facebook_voice: profile.facebookVoice,
    tiktok_voice: profile.tiktokVoice,
    mission: profile.mission,
    values: profile.values,
    products_services: profile.productsServices,
    key_differentiators: profile.keyDifferentiators,
    growth_stage: profile.growthStage || 'early',
  };
}

export type CampaignTemplateRow = {
  id: string;
  contentType: string;
  sourceUrl: string | null;
  structure: any;
  angles: string[];
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  thumbnailUrls: Record<string, string> | string[] | null;
  slideCaptions: Record<string, string> | string[] | null;
  sourcePlatform: string | null;
  sourceCreator: string | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
};

// Maps a CampaignTemplateRow (camelCase) to the engine's expected shape
// (snake_case). The engine's Pydantic model requires `content_type`, not
// `contentType` — without this mapping every template fails validation and
// the engine returns 422 Unprocessable Entity.
function mapTemplateToEngine(t: CampaignTemplateRow): Record<string, any> {
  return {
    id: t.id,
    content_type: t.contentType,
    source_url: t.sourceUrl,
    structure: t.structure,
    angles: t.angles,
    media_url: t.mediaUrl,
    thumbnail_url: t.thumbnailUrl,
    thumbnail_urls: t.thumbnailUrls,
    slide_captions: t.slideCaptions,
    source_platform: t.sourcePlatform,
    source_creator: t.sourceCreator,
    view_count: t.viewCount,
    like_count: t.likeCount,
    comment_count: t.commentCount,
  };
}

async function fetchCampaignTemplates(
  db: any,
  _orgId: string,                    // prefix with _ to suppress unused warning
  contentMix: Record<string, number>,
): Promise<CampaignTemplateRow[]> {
  const mixKeys = Object.entries(contentMix)
    .filter(([, v]) => (v || 0) > 0)
    .map(([k]) => k);

  // Map mix keys to the template content_type column values (snake_case).
  // Using mapMixKeyToContentType here is WRONG — that converts to engine-level
  // types like 'reel' which don't match DB content_type values.
  const templateTypes = mixKeys
    .map((k) => MIX_KEY_TO_TEMPLATE_CONTENT_TYPE[k])
    .filter(Boolean) as string[];
  const uniqueTypes = Array.from(new Set(templateTypes));

  if (uniqueTypes.length === 0) return [];

  const templates = await db
    .select({
      id: contentTemplateSchema.id,
      contentType: contentTemplateSchema.contentType,
      sourceUrl: contentTemplateSchema.sourceUrl,
      structure: contentTemplateSchema.structure,
      angles: contentTemplateSchema.angles,
      mediaUrl: contentTemplateSchema.mediaUrl,
      thumbnailUrl: contentTemplateSchema.thumbnailUrl,
      thumbnailUrls: contentTemplateSchema.thumbnailUrls,
      slideCaptions: contentTemplateSchema.slideCaptions,
      sourcePlatform: contentTemplateSchema.sourcePlatform,
      sourceCreator: contentTemplateSchema.sourceCreator,
      viewCount: contentTemplateSchema.viewCount,
      likeCount: contentTemplateSchema.likeCount,
      commentCount: contentTemplateSchema.commentCount,
    })
    .from(contentTemplateSchema)
    .where(
      and(
        eq(contentTemplateSchema.curationStatus, 'approved'),
        eq(contentTemplateSchema.isActive, true),
        // Filter at the DB level so large template tables don't ship rows
        // that will be dropped by the JS filter anyway.
        inArray(contentTemplateSchema.contentType, uniqueTypes),
      ),
    );

  return (templates as any[])
    .filter((t) => uniqueTypes.includes(t.contentType))
    .filter((t) => {
      // A template with no renderable media can't produce a Blitz card.
      // Keep it only if it has a mediaUrl OR a non-empty thumbnailUrls
      // collection — mirrors the ingestion-must-gate-on-media invariant.
      if (t.mediaUrl) return true;
      if (t.thumbnailUrl) return true;
      const tu = t.thumbnailUrls;
      if (Array.isArray(tu) && tu.length > 0) return true;
      if (tu && typeof tu === 'object' && Object.keys(tu).length > 0) return true;
      return false;
    })
    .map((t) => ({
      id: t.id,
      contentType: t.contentType,
      sourceUrl: t.sourceUrl ?? null,
      structure: t.structure || {},
      angles: (t.angles as string[]) || [],
      mediaUrl: t.mediaUrl ?? null,
      thumbnailUrl: t.thumbnailUrl ?? null,
      thumbnailUrls: t.thumbnailUrls ?? null,
      slideCaptions: t.slideCaptions ?? null,
      sourcePlatform: t.sourcePlatform ?? null,
      sourceCreator: t.sourceCreator ?? null,
      viewCount: t.viewCount ?? null,
      likeCount: t.likeCount ?? null,
      commentCount: t.commentCount ?? null,
    }));
}

// ── Core generation orchestrator ─────────────────────────────────────────────

export async function generateCampaignPosts(
  db: any,
  orgId: string,
  campaign: any,
  _topicOverride?: string,
  targetPlatformsOverride?: string[],
  onProgress?: (progress: GenerationProgress) => void | Promise<void>,
  onPostComplete?: (event: PostCompleteEvent) => void | Promise<void>,
  onPostError?: (event: PostErrorEvent) => void | Promise<void>,
): Promise<GenerationResult> {
  const postsPerDay = campaign.postsPerDay || 10;
  const campaignLengthDays = campaign.campaignLengthDays || 7;
  const totalPosts = postsPerDay * campaignLengthDays;

  const contentMix = (campaign.contentMix as Record<string, number>) || {};
  const campaignAngles = (campaign.angles as { angleId: string; weight: number }[]) || [];

  // Fetch brand profile
  const [profile] = await db
    .select()
    .from(brandProfileSchema)
    .where(eq(brandProfileSchema.orgId, orgId))
    .limit(1);

  if (!profile) {
    throw new Error('No Brand Profile found. Complete your Brand Profile first.');
  }

  // Resolve target platforms — hard-gated to connected FB / IG / TikTok.
  // Empty result throws NoConnectedChannelsError so the caller can render
  // a "Connect a channel" CTA instead of silently generating posts for
  // platforms the org can't publish to (per 2026-07-07 product decision).
  const allowedPlatforms = BLITZ_ALLOWED_PLATFORMS as unknown as string[];
  const connected = await getConnectedPlatforms(db, orgId, { restrictTo: allowedPlatforms });
  let targetPlatforms: string[];
  if (targetPlatformsOverride && targetPlatformsOverride.length > 0) {
    // Intersect override with connected so callers can't publish to
    // platforms the org hasn't connected.
    const connectedSet = new Set(connected);
    targetPlatforms = targetPlatformsOverride.filter((p) => connectedSet.has(p));
  } else {
    targetPlatforms = connected;
  }
  if (targetPlatforms.length === 0) {
    throw new NoConnectedChannelsError();
  }

  // Resolve angles with names
  let anglesWithNames: { angle_id: string; angle_name: string; weight: number }[] = [];
  if (campaignAngles.length > 0) {
    const angleRows = await db
      .select()
      .from(contentAngleSchema)
      .where(eq(contentAngleSchema.orgId, orgId));

    const angleMap = new Map<string, any>(angleRows.map((a: any) => [a.id, a]));
    anglesWithNames = campaignAngles.map((a) => {
      const row = angleMap.get(a.angleId);
      return {
        angle_id: a.angleId,
        angle_name: row?.name || 'General',
        weight: a.weight,
      };
    });
  }

  // Fetch templates for remix. Every Blitz/Campaign post is a shallow
  // clone of a Library template — text is regenerated, media is cloned
  // (or swapped for a matching Set on safe-swap content types).
  // If contentMix asks for types with no matching approved templates,
  // the engine will fall back to text-only generation for those posts.
  const templates = await fetchCampaignTemplates(db, orgId, contentMix);
  const templatesById = new Map<string, CampaignTemplateRow>();
  for (const t of templates) templatesById.set(t.id, t);

  // Build engine payload
  const payload = {
    brand_profile: buildEngineBrandProfile(profile),
    campaign_name: campaign.name || 'Campaign',
    content_mix: mapContentMixToEngine(contentMix),
    remix_ratio: campaign.remixRatio ?? 0,
    angles: anglesWithNames,
    mention_frequency: campaign.mentionFrequency || 'sometimes',
    gender_preference: campaign.genderPreference || 'all',
    own_media_mix: campaign.ownMediaMix ?? 50,
    influencer_frequency: campaign.influencerFrequency ?? 0,
    target_accounts: (campaign.targetAccounts as { accountId: string; platform: string }[] || []).map((a) => ({
      account_id: a.accountId,
      platform: a.platform,
    })),
    posts_per_day: postsPerDay,
    campaign_length_days: campaignLengthDays,
    start_date: campaign.startDate
      ? new Date(campaign.startDate).toISOString().slice(0, 10)
      : new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    quality_threshold: campaign.qualityThreshold ?? 0.7,
    target_platforms: targetPlatforms,
    content_mode: 'normal',
    templates: templates.map(mapTemplateToEngine),
  };

  onProgress?.({
    postIndex: 0,
    total: totalPosts,
    status: 'generating_text',
    percent: 5,
  });

  // Call engine — bound the wait so a hung engine surfaces as a real error
  // instead of silently consuming Vercel's 300s budget and leaving the job
  // stuck in 'processing'. 240s leaves ~60s headroom for post-insert work.
  const engineController = new AbortController();
  const engineTimeout = setTimeout(() => engineController.abort(), 240 * 1000);
  let res: Response;
  try {
    res = await fetch(`${ENGINE_URL}/api/campaign/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: engineController.signal,
    });
  } catch (fetchErr: any) {
    clearTimeout(engineTimeout);
    if (fetchErr?.name === 'AbortError') {
      throw new Error(`Campaign engine timed out after 240s at ${ENGINE_URL}. The engine may be down or overloaded.`);
    }
    throw new Error(`Campaign engine unreachable at ${ENGINE_URL}: ${fetchErr?.message || fetchErr}`);
  }
  clearTimeout(engineTimeout);

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`Campaign engine failed: ${res.status} ${text}`);
  }

  const engineResult = await res.json() as {
    campaign_name: string;
    total_posts: number;
    posts: Array<{
      index: number;
      caption: string;
      hashtags: string[];
      platform_specific: Record<string, unknown>;
      content_type: string;
      content_format: string;
      angle_id?: string;
      angle_name?: string;
      is_remixed: boolean;
      template_id?: string;
      scheduled_date?: string;
      scheduled_time?: string;
      anti_slop_score?: number;
      quality_flags: string[];
      title?: string;
    }>;
  };

  let failedPosts = 0;
  const contentItemIds: string[] = [];

  // Guarantee exactly postsPerDay cards reach the Blitz queue. The engine
  // may return more posts than needed (buffer) or some posts may reference
  // unresolvable template_ids. We stop once we've successfully inserted
  // postsPerDay cards.
  let inserted = 0;
  const postsToCreate = postsPerDay;
  // Track template IDs used in this batch so consecutive cards never show
  // the same preview. Without this, the engine may assign the same
  // template_id to multiple posts, producing identical-looking cards.
  const usedTemplateIds = new Set<string>();

  // Pre-compute a content-type rotation schedule from the campaign mix
  // so the Blitz queue always shows visually diverse cards. Even when the
  // engine returns monotonous types, the client-side cycles through the
  // available template content types in round-robin order.
  const mixContentTypes = Object.entries(contentMix)
    .filter(([, v]) => (v || 0) > 0)
    .map(([key]) => MIX_KEY_TO_TEMPLATE_CONTENT_TYPE[key])
    .filter(Boolean) as string[];
  const uniqueMixTypes = Array.from(new Set(mixContentTypes));

  // Build per-type template pools for fast lookup during dedup fallback.
  const templatesByType = new Map<string, CampaignTemplateRow[]>();
  for (const t of templates) {
    const list = templatesByType.get(t.contentType) || [];
    list.push(t);
    templatesByType.set(t.contentType, list);
  }

  let contentTypeRoundRobin = 0;
  function nextContentType(): string {
    if (uniqueMixTypes.length === 0) return 'reel';
    const ct = uniqueMixTypes[contentTypeRoundRobin % uniqueMixTypes.length]!;
    contentTypeRoundRobin++;
    return ct;
  }

  for (const [i, post] of engineResult.posts.entries()) {
    if (inserted >= postsToCreate) {
      break;
    }
    try {
      onProgress?.({
        postIndex: i,
        total: engineResult.total_posts,
        status: 'saving_post',
        percent: Math.round(((i + 1) / engineResult.total_posts) * 50) + 45,
      });

      // Look up the engine-suggested template. If not found, assign a
      // random fallback from the fetched pool so every Blitz card has
      // renderable source media. Skip-by-no-template silently starves the
      // queue — user gets fewer cards than postsPerDay.
      // ── Template selection with content-type cycling ──
      // Round-robin through the mix's content types so the Blitz queue
      // always shows visually diverse cards. Content type diversity
      // matters more than matching the engine's suggested template.
      const targetContentType = nextContentType();

      let template: CampaignTemplateRow | undefined = post.template_id
        ? templatesById.get(post.template_id)
        : undefined;

      // If the engine-suggested template was already used OR it doesn't
      // match the round-robin target type, try to find a better one.
      const needsSwap = !template
        || usedTemplateIds.has(template.id)
        || (uniqueMixTypes.length > 1 && template.contentType !== targetContentType);

      if (needsSwap && templates.length > 0) {
        // Try 1: unused template of the round-robin target type
        const pool1 = (templatesByType.get(targetContentType) || [])
          .filter((t) => !usedTemplateIds.has(t.id));
        if (pool1.length > 0) {
          template = pool1[Math.floor(Math.random() * pool1.length)]!;
        } else {
          // Try 2: any unused template of a different content type
          // (cross-grade to maintain visual diversity across cards)
          const otherTypes = templates.filter(
            (t) => !usedTemplateIds.has(t.id) && t.contentType !== template?.contentType,
          );
          if (otherTypes.length > 0) {
            template = otherTypes[Math.floor(Math.random() * otherTypes.length)]!;
            console.warn(
              `[Campaign] Post ${i}: type "${targetContentType}" pool exhausted, ` +
              `cross-grading to "${template.contentType}"`,
            );
          } else {
            // Try 3: any unused template (even same type — last resort)
            const anyUnused = templates.filter((t) => !usedTemplateIds.has(t.id));
            if (anyUnused.length > 0) {
              template = anyUnused[Math.floor(Math.random() * anyUnused.length)]!;
            }
            // If all unused templates are exhausted, keep the
            // engine-suggested template (even if it's a duplicate).
            // Better to show a repeat card than produce a dead slot.
          }
        }
        if (template && !post.template_id) {
          console.warn(
            `[Campaign] Post ${i}: no engine-suggested template_id, ` +
            `assigned ${template.id} (${template.contentType})`,
          );
        }
      }

      if (template) {
        usedTemplateIds.add(template.id);
      }

      if (!template) {
        // Zero templates in the fetched set — can't produce any card.
        const detail = 'No templates available.';
        console.warn(`[Campaign] Post ${i} skipped:`, detail);
        onPostError?.({ postIndex: i, detail });
        failedPosts++;
        continue;
      }

      // Content type from the resolved template, not the engine.
      const resolvedContentType = template.contentType;

      // Build sourceMediaSlots from the template row.
      let sourceMediaSlots: Record<string, any> = buildSourceMediaSlots(template);

      // Attempt Media Set substitution for safe-swap content types.
      try {
        const set = await pickDefaultSet(db, orgId, resolvedContentType);
        if (set) {
          sourceMediaSlots = applySetToSlots(sourceMediaSlots as any, set, resolvedContentType);
        }
      } catch (setErr: any) {
        console.warn(`[Campaign] Set substitution failed for post ${i}:`, setErr?.message || setErr);
      }

      // Content type must be one the Remotion preview pipeline supports,
      // otherwise the Blitz swipe card can't render it.
      if (!RENDERABLE_CONTENT_TYPES.has(resolvedContentType)) {
        const detail = `Content type '${resolvedContentType}' has no Remotion composition`;
        console.warn(`[Campaign] Post ${i} skipped:`, detail);
        onPostError?.({ postIndex: i, detail });
        failedPosts++;
        continue;
      }

      const editorScript = buildEditorScript(
        { caption: post.caption, content_type: post.content_type, template_id: post.template_id },
        { contentType: resolvedContentType, slideCaptions: template.slideCaptions, thumbnailUrls: template.thumbnailUrls },
      );

      // Reasoning: angle name only. Blitz users don't care about the
      // source template platform/creator — just what angle was used.
      const reasoning = buildReasoning(
        { angle_name: post.angle_name },
        { contentType: resolvedContentType },
      );

      const sourceTemplateSnapshot = {
        viewCount: template.viewCount,
        likeCount: template.likeCount,
        commentCount: template.commentCount,
        thumbnailUrls: template.thumbnailUrls,
      };

      // Preserve raw source media in graphicUrls[0] so compile can find
      // the untouched original (team memory: preserve-raw-source-in-compile-pipeline).
      const rawSource = template.mediaUrl || template.thumbnailUrl || null;

      // Insert content item — populates templateId FK column AND full
      // enrichmentData so downstream previews (Blitz swipe, detail page,
      // editor rehydrate) find everything they need without extra fetches.
      const [contentItem] = await db
        .insert(contentItemSchema)
        .values({
          orgId,
          brandProfileId: profile.id,
          caption: post.caption,
          hashtags: post.hashtags || [],
          contentType: resolvedContentType,
          topic: post.angle_name || campaign.name || null,
          graphicUrls: rawSource ? [rawSource] : [],
          variantGroupId: null,
          variantNumber: 1,
          isSelectedVariant: true,
          templateId: post.template_id || null,
          targetPlatforms,
          platformSpecific: post.platform_specific || {},
          status: 'pending_review',
          antiSlopScore: post.anti_slop_score ?? null,
          qualityFlags: post.quality_flags || [],
          contentMode: 'normal',
          enrichmentData: {
            sourceMediaSlots,
            editorScript,
            editorStyle: {},
            editorLayout: 'centered',
            isCompiled: false,
            ...(sourceTemplateSnapshot ? { sourceTemplateSnapshot } : {}),
            ...(reasoning ? { reasoning } : {}),
          },
          enrichmentApplied: [],
          campaignId: campaign.id,
          angleId: post.angle_id || null,
          influencerId: null,
          generationParams: {
            campaignId: campaign.id,
            angleId: post.angle_id,
            contentFormat: post.content_format,
            remixSource: post.is_remixed ? post.template_id : undefined,
            templateId: post.template_id,
            aiModelUsed: 'campaign-engine',
          },
          contentFormat: post.content_format,
          aspectRatio: post.content_format === 'carousel' ? '1:1' : '9:16',
          durationSeconds: null,
          aiModelUsed: 'campaign-engine',
        })
        .returning();

      contentItemIds.push(contentItem.id);

      // Link to campaign
      const scheduledDate = post.scheduled_date
        ? new Date(`${post.scheduled_date}T00:00:00Z`)
        : calculateSchedule(campaign.startDate, postsPerDay, i).scheduledDate;
      const scheduledTime = post.scheduled_time || calculateSchedule(campaign.startDate, postsPerDay, i).scheduledTime;

      await db.insert(campaignContentSchema).values({
        campaignId: campaign.id,
        contentItemId: contentItem.id,
        sequenceIndex: i,
        scheduledDate,
        scheduledTime,
      });

      // Media already populated from the cloned template. Every Blitz
      // post has a template at this point (fallback assigned if needed).
      onProgress?.({
        postIndex: i,
        total: engineResult.total_posts,
        status: 'finalizing_post',
        percent: Math.round(((i + 1) / engineResult.total_posts) * 100),
      });

      inserted++;

      onPostComplete?.({
        postIndex: i,
        contentItemId: contentItem.id,
        contentType: resolvedContentType,
        scheduledDate: scheduledDate.toISOString().slice(0, 10),
      });
    } catch (err: any) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`[Campaign] Post ${i} failed:`, detail);
      onPostError?.({ postIndex: i, detail });
      failedPosts++;
    }
  }

  // ── Template fallback: fill remaining quota from unused templates ──
  // When the engine doesn't produce enough unique posts (e.g., same
  // template_id assigned to multiple posts, or engine returns fewer
  // posts than postsPerDay), take templates directly from the library.
  // Each unused template becomes a Blitz card with basic caption text
  // and the same source media — no engine call needed.
  //
  // Content types are cycled round-robin through the campaign mix so the
  // Blitz queue always shows visually diverse cards. Without this, a
  // library with mostly slideshow templates would fill every remaining
  // slot with slideshow cards.
  if (inserted < postsToCreate && templates.length > 0) {
    const remaining = postsToCreate - inserted;

    // Build per-type pools of unused templates for round-robin cycling.
    const unusedByType = new Map<string, CampaignTemplateRow[]>();
    for (const t of templates) {
      if (usedTemplateIds.has(t.id)) continue;
      if (!RENDERABLE_CONTENT_TYPES.has(t.contentType)) continue;
      const list = unusedByType.get(t.contentType) || [];
      list.push(t);
      unusedByType.set(t.contentType, list);
    }

    // Cycle through content types, picking one unused template per type.
    // Keep going until all slots are filled or no unused templates remain.
    const fillTemplates: CampaignTemplateRow[] = [];
    let safety = 0;
    while (fillTemplates.length < remaining && safety < remaining * 3) {
      safety++;
      const targetType = nextContentType();
      const pool = unusedByType.get(targetType);
      if (pool && pool.length > 0) {
        const picked = pool.shift()!;
        fillTemplates.push(picked);
        usedTemplateIds.add(picked.id);
      } else {
        // That type's pool is empty — grab any remaining unused template.
        for (const [, typePool] of unusedByType) {
          if (typePool.length > 0) {
            const picked = typePool.shift()!;
            fillTemplates.push(picked);
            usedTemplateIds.add(picked.id);
            break;
          }
        }
      }
    }

    if (fillTemplates.length > 0) {
      console.warn(
        `[Campaign] Engine produced ${inserted} unique posts (${failedPosts} failed). ` +
        `Filling ${fillTemplates.length} slots with content-type-cycled templates.`,
      );
    }

    for (const template of fillTemplates) {
      if (inserted >= postsToCreate) break;

      try {
        const resolvedContentType = template.contentType;
        if (!RENDERABLE_CONTENT_TYPES.has(resolvedContentType)) continue;

        let sourceMediaSlots = buildSourceMediaSlots(template);

        // Apply media set substitution (same logic as engine posts)
        try {
          const set = await pickDefaultSet(db, orgId, resolvedContentType);
          if (set) {
            sourceMediaSlots = applySetToSlots(sourceMediaSlots as any, set, resolvedContentType);
          }
        } catch { /* keep original slots */ }

        const slideCaptions = template.slideCaptions;
        const firstSlideCaption = Array.isArray(slideCaptions)
          ? slideCaptions[0]
          : slideCaptions && typeof slideCaptions === 'object'
            ? Object.values(slideCaptions)[0]
            : undefined;
        const caption = firstSlideCaption
          || `Hook text for ${resolvedContentType.replace(/_/g, ' ')}`;

        const editorScript = buildEditorScript(
          { caption, content_type: resolvedContentType, template_id: template.id },
          { contentType: resolvedContentType, slideCaptions: template.slideCaptions, thumbnailUrls: template.thumbnailUrls },
        );

        const reasoning = buildReasoning(
          {},
          { contentType: resolvedContentType },
        );

        const rawSource = template.mediaUrl || template.thumbnailUrl || null;

        const [contentItem] = await db
          .insert(contentItemSchema)
          .values({
            orgId: campaign.orgId,
            caption,
            status: 'pending_review',
            contentType: resolvedContentType,
            enrichmentData: {
              sourceMediaSlots,
              sourceTemplateSnapshot: {
                viewCount: template.viewCount,
                likeCount: template.likeCount,
                commentCount: template.commentCount,
                thumbnailUrls: template.thumbnailUrls,
              },
              editorScript,
              reasoning,
            },
            graphicUrls: rawSource ? [rawSource] : [],
            templateId: template.id,
            contentFormat: resolvedContentType === 'slideshow' ? 'carousel' : 'single',
            aspectRatio: '9:16',
            aiModelUsed: 'template-fallback',
          })
          .returning();

        contentItemIds.push(contentItem.id);

        await db.insert(campaignContentSchema).values({
          campaignId: campaign.id,
          contentItemId: contentItem.id,
          sequenceIndex: contentItemIds.length - 1,
          scheduledDate: calculateSchedule(campaign.startDate, postsPerDay, contentItemIds.length - 1).scheduledDate,
          scheduledTime: calculateSchedule(campaign.startDate, postsPerDay, contentItemIds.length - 1).scheduledTime,
        });

        inserted++;
        usedTemplateIds.add(template.id);
      } catch (err: any) {
        console.error(`[Campaign] Template fallback failed for ${template.id}:`, err?.message || err);
        failedPosts++;
      }
    }
  }

  return {
    totalPosts: engineResult.total_posts,
    completedPosts: engineResult.total_posts - failedPosts,
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
      campaignId: item.campaignId || undefined,
      angleId: item.angleId || undefined,
      templateId: (item.generationParams as Record<string, any>)?.templateId || undefined,
      orgId,
    });

    const variant = textResult.variants?.[0];
    if (variant) {
      await db.update(contentItemSchema)
        .set({
          caption: variant.caption,
          hashtags: variant.hashtags || [],
          platformSpecific: variant.platform_specific || {},
          antiSlopScore: variant.anti_slop_score ?? null,
          qualityFlags: variant.quality_flags || [],
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
): Promise<{ scheduled: number; skipped: number }> {
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
  let skippedCount = 0;

  for (const row of items) {
    const contentItem = row.ci;
    const cc = row.cc;
    if (!contentItem) continue;

    // Only schedule approved posts
    if (contentItem.status !== 'approved') {
      skippedCount++;
      continue;
    }

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

  return { scheduled: scheduledCount, skipped: skippedCount };
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
