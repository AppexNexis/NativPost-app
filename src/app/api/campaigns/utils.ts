// ============================================================
// Campaign Engine — Shared Utilities
// ============================================================

import { waitUntil } from '@vercel/functions';
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';

import { applyBrandVoice } from '@/lib/blitz/apply-brand-voice';
import { applySetToSlots, InsufficientAssetsError } from '@/lib/blitz/apply-set-to-slots';
import { buildEditorScript, buildReasoning, deriveTopicLabel } from '@/lib/blitz/build-editor-script';
import { buildSourceMediaSlots } from '@/lib/blitz/build-source-media-slots';
import { generateBlitzSlideCaptions } from '@/lib/blitz/generate-slide-captions';
import { pickDefaultSet } from '@/lib/blitz/pick-default-set';
import {
  getConnectedPlatforms,
  NoConnectedChannelsError,
} from '@/lib/social/connected-platforms';
import {
  aiInfluencerSchema,
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
  'video_hook_demo',
  'ugc',
  'reel',
  'single_image',
]);

// ── Influencer rotation ──────────────────────────────────────────────────────

/**
 * Assigns an influencer to a post at loop index `postIndex`.
 *
 * Rules:
 *  - Empty enabled list → null
 *  - frequency <= 0     → null (slider off means never attach)
 *  - frequency === 100  → deterministic round-robin by index
 *  - 0 < frequency < 100 → probabilistic roll; on pass, round-robin
 *
 * Round-robin (vs Math.random pick) so a user with 3 influencers and
 * freq=100 gets an even A/B/C/A/B/C spread — not an unlucky ABABAB cluster.
 */
function pickInfluencerForPost(
  enabledIds: string[] | null | undefined,
  frequency: number | null | undefined,
  postIndex: number,
): string | null {
  const ids = Array.isArray(enabledIds) ? enabledIds : [];
  if (ids.length === 0) {
    return null;
  }
  const freq = typeof frequency === 'number' ? frequency : 0;
  if (freq <= 0) {
    return null;
  }
  if (freq < 100 && Math.random() * 100 >= freq) {
    return null;
  }
  return ids[postIndex % ids.length] ?? null;
}

// ── Content type mapping ─────────────────────────────────────────────────────

const MIX_KEY_TO_CONTENT_TYPE: Record<string, string> = {
  slideshow: 'reel',
  greenScreen: 'reel',
  videoHook: 'reel',
  talkingHead: 'reel',
  videoHookDemo: 'reel',
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
  videoHookDemo: 'video_hook_demo',
  carousel: 'carousel',
  ugc: 'ugc',
  dataStory: 'data_story',
  wallOfText: 'wall_of_text',
  // NOTE: scene / text_motion / ai_graphic / thumbnail intentionally
  // omitted. Their template rows exist in the DB but no Remotion
  // composition renders them yet — they would silently fall back to
  // EditorComposition and render as a black-video with plain text on the
  // Blitz swipe card. Re-add when compositions ship.
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

export type WeightedItem = {
  weight: number;
};

export function pickWeighted<T extends WeightedItem>(items: T[]): T | undefined {
  if (!items || items.length === 0) {
    return undefined;
  }
  const total = items.reduce((sum, i) => sum + (i.weight || 0), 0);
  if (total <= 0) {
    return items[0];
  }
  let random = Math.random() * total;
  for (const item of items) {
    random -= (item.weight || 0);
    if (random <= 0) {
      return item;
    }
  }
  return items[items.length - 1];
}

export function pickContentType(contentMix: Record<string, number>): string {
  const entries = Object.entries(contentMix).filter(([, v]) => (v || 0) > 0);
  if (entries.length === 0) {
    return 'reel';
  }
  const weighted = entries.map(([key, value]) => ({ key, weight: value || 0 }));
  const picked = pickWeighted(weighted);
  return mapMixKeyToContentType(picked?.key || 'reel');
}

export function pickAngle(angles: { angleId: string; weight: number }[]): string | undefined {
  if (!angles || angles.length === 0) {
    return undefined;
  }
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

// Server-to-server text generation.
//
// EARLIER IMPLEMENTATION (broken): posted to /api/content/generate over
// HTTP with an Authorization: Bearer header. The target route uses Clerk
// auth() which reads cookies only, so the Bearer token was silently
// ignored and every internal call came back as 401 Unauthorized. This
// surfaced in the Campaign editor's "Regenerate Text" button.
//
// FIX: call the engine directly (same POST /api/generate contract the
// public route uses) and return the same `{ variants }` shape callers
// expect. No HTTP self-fetch, no Clerk round-trip.
export async function generateTextContent(params: {
  db: any;
  topic: string;
  contentType: string;
  targetPlatforms: string[];
  contentMode?: string;
  templateId?: string;
  angleId?: string;
  campaignId?: string;
  orgId: string;
}) {
  const { db, orgId } = params;

  const [profile] = await db
    .select()
    .from(brandProfileSchema)
    .where(eq(brandProfileSchema.orgId, orgId))
    .limit(1);

  if (!profile) {
    throw new Error('No Brand Profile found. Complete your Brand Profile first.');
  }

  const enginePayload = {
    brand_profile: buildEngineBrandProfile(profile),
    topic: params.topic || null,
    content_type: params.contentType || 'text_only',
    target_platforms: params.targetPlatforms,
    num_variants: 1,
    content_mode: params.contentMode || 'normal',
    enrichment: null,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90_000);
  let res: Response;
  try {
    res = await fetch(`${ENGINE_URL}/api/generate`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(enginePayload),
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === 'AbortError') {
      throw new Error('Content engine timed out. Please try again.');
    }
    throw new Error(`Engine unreachable: ${err?.message || err}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`Engine failed: ${res.status} ${text}`);
  }

  const data = await res.json() as { variants?: any[] };
  return { variants: data.variants || [] };
}

export async function generateMediaForContentItem(
  contentItemId: string,
  contentType: string,
  orgId?: string,
) {
  const generator = getMediaGenerator(contentType);
  if (!generator) {
    return null;
  }
  return callInternalApi(`/api/content/${contentItemId}/${generator}`, 'POST', {}, orgId);
}

// ── Template selection ───────────────────────────────────────────────────────

export async function pickTemplate(
  db: any,
  orgId: string,
  contentType: string,
  angleId?: string,
): Promise<string | undefined> {
  if (!angleId) {
    return undefined;
  }

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

    if (!angle) {
      return undefined;
    }

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

    if (matching.length === 0) {
      return undefined;
    }

    const idx = Math.floor(Math.random() * matching.length);
    return matching[idx].id;
  } catch (err) {
    console.error('[Template] Failed to pick template:', err);
    return undefined;
  }
}

// ── Progress types ───────────────────────────────────────────────────────────

export type GenerationProgress = {
  postIndex: number;
  total: number;
  status: string;
  percent: number;
};

export type PostCompleteEvent = {
  postIndex: number;
  contentItemId: string;
  contentType: string;
  scheduledDate: string;
};

export type PostErrorEvent = {
  postIndex: number;
  detail: string;
};

export type GenerationResult = {
  totalPosts: number;
  completedPosts: number;
  failedPosts: number;
  contentItemIds: string[];
  // Count of posts skipped because a Media Set had fewer distinct
  // assets than the slideshow template's required slides.
  skippedInsufficientAssets?: number;
  // Set when the org has already hit its per-day cap for this campaign.
  dailyLimitReached?: boolean;
};

// ── Engine campaign request builder ───────────────────────────────────────────

function mapContentMixToEngine(mix: Record<string, number>) {
  return {
    slideshow: mix.slideshow ?? 0,
    green_screen: mix.greenScreen ?? 0,
    video_hook: mix.videoHook ?? 0,
    talking_head: mix.talkingHead ?? 0,
    video_hook_demo: mix.videoHookDemo ?? 0,
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
  niches: string[];
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

// Randomised hook pool so Blitz cards never show the same text.
// Defined at module level so both Phase 1 (template-first) and the
// template fallback section can reference it.
//
// Pool sizing note (2026-07-11): each content type now carries 12+ hooks
// so a campaign that generates 14 slideshow posts doesn't burn through
// the pool halfway. Each line targets 80-120 chars per user request so
// captions read as a real post caption, not a headline. Voice mirrors
// creator-style (Sahil Bloom, Justin Welsh) — hook first, one concrete
// specific, no filler, no em/en dashes, no emojis.
const FALLBACK_HOOKS: Record<string, string[]> = {
  slideshow: [
    'The exact step by step nobody spells out, saved and screenshotted so you actually finish this weekend.',
    'This is the seven slide breakdown I wish someone dropped in my DMs before I wasted three months guessing.',
    'Screenshot every slide, then come back tonight when you have real time to sit with each one properly.',
    'Full walkthrough of the workflow that shipped four launches this quarter, without adding a single hire.',
    'The framework we use every Monday, laid out cleanly so you can copy it into your notes app in one pass.',
    'Save this for later, it is the compressed version of a workshop that used to cost people real money.',
    'Everything I learned the expensive way, folded into seven slides so you can skip the expensive part.',
    'The template we run every launch through before we ship a single post, no assumptions, no shortcuts.',
    'Slide four is the one people miss, and it is the reason the other three do not actually compound.',
    'This is what a well built content system looks like when you strip out the software and the theatre.',
    'Read this once slowly, then decide if the way you have been doing this is worth another quarter of it.',
    'The playbook I would hand a friend on day one if I had to start from zero with only a week to prove it.',
  ],
  carousel: [
    'Five things I would tell my past self, if I had to compress two years of trial and error into a swipe.',
    'The playbook I have been sitting on for months, mostly because I was not sure anyone wanted the honest version.',
    'Swipe through, keep what is useful, throw the rest away, that is how you actually make a framework yours.',
    'What actually shifted after we tried it this way, ranked by which decision moved the biggest number.',
    'The short version, so you can decide in ninety seconds whether the long version is worth your afternoon.',
    'Every mistake I made in my first year, mapped to the one line of advice that would have prevented it.',
    'The frameworks I still use weekly, and the ones I threw out after they stopped surviving contact with reality.',
    'A quick tour of what actually moves the needle when you have less time than the calendar makes it seem.',
    'Ten years of context, compressed into a swipe you can read on the walk from your kitchen to your desk.',
    'Not another list of tips, this is the shortlist I actually run through before I commit to a new bet.',
    'The uncomfortable truths, ranked by how long it took me to accept them, saved for the version of you still resisting.',
    'A working checklist, not a hype post, use it the next time you are about to say yes to something big.',
  ],
  data_story: [
    'The number that changed how we think about growth, and the one line of context that made it click for the team.',
    'This chart made me rethink the whole strategy, and I am still not sure the second-order effects are priced in.',
    'What the last thirty days of data actually shows, once you strip out the vanity spikes everyone loves to post.',
    'Why the trend everyone is chasing is quietly losing steam, and the smaller signal that is worth watching instead.',
    'One metric worth watching this month, and the reason the three you are already tracking are lying to you.',
    'The chart nobody wants to post because it complicates the tidy narrative we all agreed to two quarters ago.',
    'What happens when you plot the same funnel by cohort instead of by week, and why the picture inverts completely.',
    'The data we almost missed, sitting in a tab we barely open, and what it says about the next two quarters.',
    'A quiet number that moved eight percent this month, which is the kind of move you only see if you look for it.',
    'The one input we can control, plotted against the one output that pays rent, is a shorter conversation than you think.',
    'Read the axis label twice, then decide whether the chart everyone is sharing means what they think it means.',
    'A slower cut of the same data, without the smoothing, tells a story you cannot unsee once you have seen it.',
  ],
  green_screen: [
    'Here is what most people get wrong about this, and the tiny shift that fixes it without changing anything else.',
    'The part nobody explains clearly, in thirty seconds, before you have to sit through another vague explainer.',
    'Simple version, this is why it matters right now, and what the next twelve months probably look like from here.',
    'What is actually happening, no jargon, no theatre, just the plain read a friend would give you over coffee.',
    'Quick breakdown for anyone still on the fence, so you can decide before the moment stops being interesting.',
    'The context nobody adds to the headline, which is usually the reason the headline sounds so tidy in the first place.',
    'A grounded take, without the outrage economy tax, on why this is a bigger deal than most feeds are treating it as.',
    'The version of this story I would tell my parents, without any of the industry shorthand nobody agreed to.',
    'What changed this week, what did not, and which of the two the timeline is currently getting the wrong way round.',
    'A short read on why this actually matters, once you back out the platform incentives that made it feel urgent.',
    'Thirty seconds of context that will make every other post about this feel a lot less confusing this week.',
    'The one framing shift that makes the rest of this story sit differently, and it takes less than a minute to explain.',
  ],
  video_hook: [
    'Stop scrolling if you are doing this the hard way, because the shortcut is boring, obvious, and hiding in plain sight.',
    'Watch this before you commit to your next launch, because the thirty seconds you spend here will save you a month.',
    'Everyone got this wrong for a full year, and here is the version that actually works when you stop performing it.',
    'The one shift that made everything else click, and the reason nobody talks about it is that it is not photogenic.',
    'You will want to see this before your next post goes out, because the second half of the video is the part that changes.',
    'This is the version I wish someone had made when I was where you are, so I did not have to figure it out slowly.',
    'The advice that finally landed after I ignored it three times, delivered by a person who has actually tried it.',
    'A short case for slowing down, from someone who spent a year moving fast and mostly moved in the wrong direction.',
    'Do not build the next thing yet, watch this first, because the framing at the end changes what you should build.',
    'What I would tell a smart friend at the exact stage you are in, without the polite hedging LinkedIn requires.',
    'The uncomfortable middle of the video is the part worth staying for, because that is where the real trade off shows.',
    'A quick take on the trade nobody wants to name, and the reason most people who succeed at this eventually quit anyway.',
  ],
  video_hook_demo: [
    'This is what ten seconds with the right tool looks like, which is roughly what the manual version takes an hour to do.',
    'Watch what happens when you skip the setup step, because that is the step everyone quietly skips in their tutorials.',
    'The workflow that saves us hours every single week, filmed in real time so you can see where the seconds actually go.',
    'Before you copy any tutorial you saw yesterday, watch this, because ninety percent of them are missing the last step.',
    'This is faster than the way you are doing it now, and the setup only takes the length of the video you are watching.',
    'The unedited version of the workflow, mistakes included, so you can see what the polished tutorials tend to hide.',
    'A quick before and after, on the same task, so the trade off between the two ways is not something you have to guess at.',
    'One tool, three keystrokes, and a small mental model shift, is roughly the whole demo, feel free to skim.',
    'Every step of the workflow, with none of the hand-waving, so you can decide if the switch is actually worth your time.',
    'The demo I would run for a friend if we were sitting at the same laptop, which is why it is a little rougher than usual.',
    'Watch the last twenty seconds twice, because the small decision at the end is where all of the compounding happens.',
    'A working example, on real data, so you can see the failure modes the demo videos never seem to include on purpose.',
  ],
  talking_head: [
    'Real talk on what is actually working right now, without the survivorship bias baked into most of the timeline this week.',
    'Here is the honest take nobody else is giving you, mostly because giving it in public still carries a small career tax.',
    'What I learned after ninety days of testing this, delivered as a plain read, not a pitch dressed up in soft lighting.',
    'You may not want to hear this, but the version of the story that keeps landing wrong needs a correction pass.',
    'The uncomfortable truth about the current playbook, is that most of the people running it stopped believing in it.',
    'A grounded update from someone who has been quiet on purpose, because the internet rewards the wrong kinds of speed.',
    'The advice I would give a friend, off the record, if they asked me what to do with the next twelve months of their life.',
    'What changed my mind this quarter, and the reason I am willing to say it out loud in a place my past self can read it.',
    'A slower conversation about a fast moving thing, because the pace of the platform is not the pace the decisions need.',
    'The version of this take I would not have shared a year ago, and the reason I feel differently about it right now.',
    'A short read on why the smart move looks boring from the outside, and expensive from the inside, but pays anyway.',
    'The framing that finally stopped costing me sleep, delivered to you in case it stops costing you yours as well.',
  ],
  wall_of_text: [
    'Take five minutes to read this, it is worth it, and the parts you disagree with are probably the parts to reread.',
    'The full argument, laid out step by step, so we can stop arguing past each other in the replies for another week.',
    'Bookmark this so you can come back to it later, because the version of you reading it in a month will need it more.',
    'The thread I wish someone sent me last year, in one place, without the reply-tab context nobody wants to reconstruct.',
    'Read it once, decide if it changes your plan, and if it does, the follow up post will make more sense in a week.',
    'A longer piece than the timeline usually rewards, because the shorter version got misread three times last month.',
    'The argument, without the cliffhanger structure, because I have decided the payoff is worth losing the retention curve.',
    'A slow read, on purpose, because the fast version has been circulating for a month and has quietly done real damage.',
    'What the shorter posts are not saying out loud, in a format that gives the argument room to actually breathe.',
    'The complete version of a take I have been trimming for two weeks, published now because the middle is the point.',
    'A patient walk through the same terrain three other posts skated over, because the details are where the trade lives.',
    'The version with the caveats included, so you can push back on the exact line instead of the compressed rewrite.',
  ],
  reel: [
    'This one is going to be everywhere this week, which is exactly the moment the version that actually works stops working.',
    'Trend spotted, here is the version that works, filmed without the ironic distance most people are using to hedge it.',
    'Do this before it stops working, and it will, because the platform is already indexing on the response it triggers.',
    'The move most people are missing right now, and the reason it is missing is that it looks a little too plain in the feed.',
    'Copy this exact setup, then make it your own, because the second half of that sentence is the whole game.',
    'A quick take on the format everyone is about to overuse, with a small tweak that keeps it working past next week.',
    'The version of the trend that survives the algorithm shift, delivered before the shift has actually happened yet.',
    'What to do this week if you want a chance at cutting through, without spending three hours filming a single video.',
    'The idea worth ten of the ones your saved folder has been sitting on since March, filmed in a single take on purpose.',
    'A working template, not a hype post, so you can decide by the end of the video whether it is worth pressing record.',
    'Save this, film your version tonight, and post before the format tips into cliche, which is roughly Thursday morning.',
    'The pattern the last three viral posts share, once you strip out the topics and only look at the shape of them.',
  ],
  ugc: [
    'Tried it for two weeks, here is what happened, without the sponsored polish most of the reviews on this quietly carry.',
    'Honest review, zero sponsorship attached, filmed on my kitchen counter because the branded set never actually helps.',
    'This is my third one and I still recommend it, which is not something I say about most of the things I own.',
    'What nobody tells you about actually using this, because the marketing pages are always describing a slightly different product.',
    'The one thing that made me stick with it past the two week mark, when I was very close to giving up on it entirely.',
    'A grounded review, six weeks in, so you can decide by the end of the video whether it earns a spot in your day.',
    'What broke first, what I fixed easily, and the one thing I am still annoyed about but not annoyed enough to return.',
    'The real trade off, in the format I would use to describe it to a friend who was thinking about spending money on this.',
    'The reason it stayed in my routine, plainly, and the reason the previous three did not, so you can weigh both.',
    'A short pitch for slowing down before you buy, from someone who has been buying too many of these for two years.',
    'Bought it on a whim, kept it for a reason, and the reason is not the reason the ad copy would like you to believe.',
    'A quick walk through of the actual daily use, mistakes included, so you can see where the marketing decided to trim.',
  ],
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
  _orgId: string, // prefix with _ to suppress unused warning
  contentMix: Record<string, number>,
  niche?: string | null,
): Promise<CampaignTemplateRow[]> {
  const mixKeys = Object.entries(contentMix)
    .filter(([, v]) => (v || 0) > 0)
    .map(([k]) => k);

  // Map mix keys to the template content_type column values (snake_case).
  // Using mapMixKeyToContentType here is WRONG — that converts to engine-level
  // types like 'reel' which don't match DB content_type values.
  const templateTypes = mixKeys
    .map(k => MIX_KEY_TO_TEMPLATE_CONTENT_TYPE[k])
    .filter(Boolean) as string[];
  const uniqueTypes = Array.from(new Set(templateTypes));

  if (uniqueTypes.length === 0) {
    return [];
  }

  // Shared column selector to avoid repetition
  const templateColumns = {
    id: contentTemplateSchema.id,
    contentType: contentTemplateSchema.contentType,
    sourceUrl: contentTemplateSchema.sourceUrl,
    structure: contentTemplateSchema.structure,
    angles: contentTemplateSchema.angles,
    niches: contentTemplateSchema.niches,
    mediaUrl: contentTemplateSchema.mediaUrl,
    thumbnailUrl: contentTemplateSchema.thumbnailUrl,
    thumbnailUrls: contentTemplateSchema.thumbnailUrls,
    slideCaptions: contentTemplateSchema.slideCaptions,
    sourcePlatform: contentTemplateSchema.sourcePlatform,
    sourceCreator: contentTemplateSchema.sourceCreator,
    viewCount: contentTemplateSchema.viewCount,
    likeCount: contentTemplateSchema.likeCount,
    commentCount: contentTemplateSchema.commentCount,
  };

  // Build WHERE clause — content type + active + approved + optional niche
  const whereClauses: any[] = [
    eq(contentTemplateSchema.curationStatus, 'approved'),
    eq(contentTemplateSchema.isActive, true),
    inArray(contentTemplateSchema.contentType, uniqueTypes),
  ];
  if (niche) {
    // Postgres JSONB `?` operator: true if the array `niches` contains the string.
    whereClauses.push(sql`${contentTemplateSchema.niches} ? ${niche}`);
  }

  let templates = await db
    .select(templateColumns)
    .from(contentTemplateSchema)
    .where(and(...whereClauses));

  // ── Per-type niche fallback ─────────────────────────────────────────────
  // If niche filtering left some content types with zero templates, fetch
  // templates for those specific missing types WITHOUT the niche filter.
  // This ensures the campaign content mix is respected even when non-slideshow
  // templates (green_screen, video_hook, etc.) haven't been niche-tagged yet.
  if (niche) {
    const foundTypes = new Set((templates as any[]).map((t: any) => t.contentType));
    const missingTypes = uniqueTypes.filter(t => !foundTypes.has(t));
    if (missingTypes.length > 0) {
      console.log(
        `[Campaign] Niche "${niche}" missing templates for [${missingTypes.join(', ')}] — fetching without niche filter`,
      );
      const fallback = await db
        .select(templateColumns)
        .from(contentTemplateSchema)
        .where(and(
          eq(contentTemplateSchema.curationStatus, 'approved'),
          eq(contentTemplateSchema.isActive, true),
          inArray(contentTemplateSchema.contentType, missingTypes),
        ));
      templates = [...(templates as any[]), ...(fallback as any[])];
    }
  }

  return (templates as any[])
    .filter((t: any) => uniqueTypes.includes(t.contentType))
    .filter((t: any) => {
      // A template with no renderable media can't produce a Blitz card.
      // Keep it if it has a mediaUrl, thumbnailUrl, thumbnailUrls collection,
      // OR a sourceUrl (video-type templates — video_hook, green_screen,
      // talking_head, video_hook_demo — are imported with sourceUrl as the
      // backing video but may not have a separate processed mediaUrl/thumbnailUrl).
      if (t.mediaUrl) {
        return true;
      }
      if (t.sourceUrl) {
        return true;
      }
      if (t.thumbnailUrl) {
        return true;
      }
      const tu = t.thumbnailUrls;
      if (Array.isArray(tu) && tu.length > 0) {
        return true;
      }
      if (tu && typeof tu === 'object' && Object.keys(tu).length > 0) {
        return true;
      }
      return false;
    })
    .map((t: any) => ({
      id: t.id,
      contentType: t.contentType,
      sourceUrl: t.sourceUrl ?? null,
      structure: t.structure || {},
      angles: (t.angles as string[]) || [],
      niches: (t.niches as string[]) || [],
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
  const postsPerDay = campaign.postsPerDay || 1;
  const campaignLengthDays = campaign.campaignLengthDays || 7;
  const accountsCount = Math.max(1, ((campaign.targetAccounts as any[]) || []).length);
  // Prefer the row-stored totalPosts when present — the POST route
  // computes accounts × postsPerDay × days there. Fall back to computing
  // locally so older campaign rows still generate correctly.
  const totalPosts = campaign.totalPosts && campaign.totalPosts > 0
    ? campaign.totalPosts
    : accountsCount * postsPerDay * campaignLengthDays;
  // Phase 1 must fill the ENTIRE campaign window, not just one day.
  // Blitz's per-day generation model (which this code was cloned from)
  // relies on subsequent auto-refill calls, but Campaigns need the whole
  // schedule up-front so the Review grid and Calendar can show every slot.
  // NOTE: The daily-cap gate later in this function may lower this to
  // (dailyLimit - existingTodayCount). See `enforcedPostsToCreate` below.
  let postsToCreate = totalPosts;

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

  // ── Daily-cap gate (Blitz-critical) ────────────────────────────────────
  // The generic campaign generator was cloned from the Blitz per-day model
  // and never got a "how many did we already insert today" check. Concurrent
  // /generate kicks + auto-refill effects + stale-sweep flipping items to
  // 'failed' let the queue overshoot the user's postsPerDay setting — the
  // "You've seen 15 of 10 posts" bug. Compute the shortfall vs today's cap
  // BEFORE touching templates so we never insert past it.
  //
  // "Today" is the calendar day in server local time; failed items are
  // re-attemptable and don't consume the cap.
  const dailyLimit = postsPerDay;
  const _now = new Date();
  const _startOfDay = new Date(
    _now.getFullYear(),
    _now.getMonth(),
    _now.getDate(),
  );
  const todayCountRows = await db
    .select({ contentItemId: campaignContentSchema.contentItemId })
    .from(campaignContentSchema)
    .innerJoin(
      contentItemSchema,
      eq(campaignContentSchema.contentItemId, contentItemSchema.id),
    )
    .where(
      and(
        eq(campaignContentSchema.campaignId, campaign.id),
        eq(contentItemSchema.orgId, orgId),
        gte(contentItemSchema.createdAt, _startOfDay),
        inArray(contentItemSchema.status, ['pending_review', 'approved', 'skipped']),
      ),
    );
  const existingTodayCount = todayCountRows.length;
  const remainingToday = Math.max(0, dailyLimit - existingTodayCount);
  postsToCreate = Math.min(totalPosts, remainingToday);
  if (postsToCreate === 0) {
    console.log(
      `[Campaign] Daily cap reached: existing=${existingTodayCount} `
      + `limit=${dailyLimit} — skipping generation.`,
    );
    return {
      totalPosts: 0,
      completedPosts: 0,
      failedPosts: 0,
      contentItemIds: [],
      skippedInsufficientAssets: 0,
      dailyLimitReached: true,
    };
  }

  // Resolve target platforms — hard-gated to connected FB / IG / TikTok / YouTube.
  // YouTube was added to campaign support on 2026-07-10. BLITZ_ALLOWED_PLATFORMS
  // still restricts to the first three for the Blitz feed, but campaigns can
  // publish to YouTube so we use a broader list here.
  const CAMPAIGN_PUBLISH_PLATFORMS = ['facebook', 'instagram', 'tiktok', 'youtube'];
  const connected = await getConnectedPlatforms(db, orgId, { restrictTo: CAMPAIGN_PUBLISH_PLATFORMS });
  let targetPlatforms: string[];
  if (targetPlatformsOverride && targetPlatformsOverride.length > 0) {
    // Intersect override with connected so callers can't publish to
    // platforms the org hasn't connected.
    const connectedSet = new Set(connected);
    targetPlatforms = targetPlatformsOverride.filter(p => connectedSet.has(p));
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

  // Filter templates by brand profile niche so only templates relevant
  // to the user's industry are used. Templates store their target niches
  // in the `niches` JSONB array; brandProfile.industry is the source of
  // truth (e.g. "b2b saas", "agency", "fitness", "personal brand").
  const niche = profile?.industry || null;

  // Fetch templates for remix. Every Blitz/Campaign post is a shallow
  // clone of a Library template — text is regenerated, media is cloned
  // (or swapped for a matching Set on safe-swap content types).
  // If contentMix asks for types with no matching approved templates,
  // the engine will fall back to text-only generation for those posts.
  const templates = await fetchCampaignTemplates(db, orgId, contentMix, niche);
  // Pad with off-niche templates when the niche pool is thin. Old logic
  // only re-fetched on ZERO matches, so a "Startup" niche with 3 approved
  // templates gave a monotonous Blitz even when the library had 493.
  // We now widen whenever the niche pool is smaller than ~3× the requested
  // post count, dedup by id, and prepend the on-niche results so ranking
  // still favours them.
  if (templates.length < postsToCreate * 3) {
    const wider = await fetchCampaignTemplates(db, orgId, contentMix, null);
    const seen = new Set(templates.map((t: any) => t.id));
    for (const t of wider) {
      if (!seen.has(t.id)) {
        templates.push(t);
        seen.add(t.id);
      }
    }
    if (niche) {
      console.log(
        `[Campaign] Niche "${niche}" pool small (${templates.length - wider.length + templates.length}) — `
        + `padded with ${wider.length} off-niche templates, ${templates.length} total.`,
      );
    }
  }
  const templatesById = new Map<string, CampaignTemplateRow>();
  for (const t of templates) {
    templatesById.set(t.id, t);
  }

  // ── Phase 1: Template-first allocation ──
  // Content library templates are the PRIMARY source for Blitz cards.
  // Each post gets a unique template with media-set substitution and
  // randomized hook text. This guarantees visual AND textual diversity
  // because every template looks different and captions don't share the
  // engine's monotonous pattern.
  //
  // The engine is ONLY called if template allocation can't fill all slots,
  // which is rare with a well-populated library.

  // Group templates by content type for round-robin cycling
  const byType = new Map<string, CampaignTemplateRow[]>();
  for (const t of templates) {
    const list = byType.get(t.contentType) || [];
    list.push(t);
    byType.set(t.contentType, list);
  }

  // Content-type rotation schedule from the campaign mix
  const mixTypes = Object.entries(contentMix)
    .filter(([, v]) => (v || 0) > 0)
    .map(([k]) => MIX_KEY_TO_TEMPLATE_CONTENT_TYPE[k])
    .filter(Boolean) as string[];
  const uniqueMixTypes = Array.from(new Set(mixTypes));

  let typeIdx = 0;
  function nextType(): string {
    if (uniqueMixTypes.length === 0) {
      return 'reel';
    }
    const t = uniqueMixTypes[typeIdx % uniqueMixTypes.length]!;
    typeIdx++;
    return t;
  }

  // Track used templates and hooks so no two cards look the same,
  // even across multiple generation batches (auto-refill, page refresh).
  // IMPORTANT: `campaignId` is NOT stored on `contentItemSchema` as a column
  // — it lives on the `campaignContentSchema` join table. And Phase 1 items
  // store `templateId` INSIDE `enrichmentData`, not as the FK column. Both
  // must be handled to build the correct exclusion set.
  const joinRows = await db
    .select({
      templateId: contentItemSchema.templateId,
      enrichmentData: contentItemSchema.enrichmentData,
    })
    .from(campaignContentSchema)
    .innerJoin(
      contentItemSchema,
      eq(campaignContentSchema.contentItemId, contentItemSchema.id),
    )
    .where(
      and(
        eq(campaignContentSchema.campaignId, campaign.id),
        eq(contentItemSchema.orgId, orgId),
      ),
    );

  const usedTemplateIds = new Set<string>();
  const usedHooks = new Set<string>();
  for (const row of joinRows) {
    // Phase 1 items store templateId inside enrichmentData, NOT as the FK
    // column. Engine-supplement and template-fallback items set the FK
    // column. Check both.
    const tid = row.templateId
      || ((row.enrichmentData as Record<string, any>)?.templateId as string | undefined)
      || null;
    if (tid) {
      usedTemplateIds.add(tid);
    }
    // Also seed usedHooks from existing items' editorScript.hookText so
    // the re-gen doesn't produce cards with the same hook text.
    const ed = row.enrichmentData as Record<string, any> | undefined;
    if (ed?.editorScript?.hookText) {
      usedHooks.add(String(ed.editorScript.hookText));
    }
  }

  function pickUniqueHook(contentType: string): string {
    const pool = FALLBACK_HOOKS[contentType] || FALLBACK_HOOKS.reel || ['Check this out!'];
    for (let attempt = 0; attempt < pool.length * 3; attempt++) {
      const h = pool[Math.floor(Math.random() * pool.length)]!;
      if (!usedHooks.has(h)) {
        usedHooks.add(h);
        return h;
      }
    }
    // All hooks exhausted — accept a duplicate silently. Do NOT append a
    // counter suffix like " (N)" — that leaks the collision-avoidance
    // counter into the visible caption text on the Blitz card.
    return pool[Math.floor(Math.random() * pool.length)]!;
  }

  // Allocate template posts
  // Content type cycling: when a type has no unused templates, try the
  // next type in the rotation instead of falling through to "any type".
  // The old fallthrough biased toward the most-abundant content type
  // (typically slideshow), which produced monotype Blitz queues even
  // when the campaign mix asked for diverse types.
  const templatePosts: Array<{ template: CampaignTemplateRow; hookText: string }> = [];
  for (let i = 0; i < postsToCreate; i++) {
    // Try up to uniqueMixTypes.length attempts to find a type with available
    // templates. If all types are exhausted, fall through to "any unused".
    let found = false;
    for (let attempt = 0; attempt < uniqueMixTypes.length; attempt++) {
      const target = nextType();
      const pool = byType.get(target) || [];
      const picked = pool.filter(t => !usedTemplateIds.has(t.id));
      if (picked.length > 0) {
        const t = picked[Math.floor(Math.random() * picked.length)]!;
        usedTemplateIds.add(t.id);
        templatePosts.push({ template: t, hookText: pickUniqueHook(t.contentType) });
        found = true;
        break;
      }
    }
    if (found) {
      continue;
    }

    // All content-type pools exhausted — try any unused template (cross-grade).
    const all = templates.filter(t => !usedTemplateIds.has(t.id));
    if (all.length === 0) {
      break;
    } // no templates left — engine will fill
    const t = all[Math.floor(Math.random() * all.length)]!;
    usedTemplateIds.add(t.id);
    templatePosts.push({ template: t, hookText: pickUniqueHook(t.contentType) });
  }

  console.log(
    `[Campaign] Phase 1: allocated ${templatePosts.length} template posts `
    + `(target=${postsToCreate}, available=${templates.length})`,
  );

  // Preload video pool + baseImageUrl for every enabled influencer once
  // before ANY insertion path so all three sites (template posts, engine
  // supplement, fallback) can hydrate sourceMediaSlots without N+1 queries.
  // Videos are round-robined from the pool so consecutive talking_head posts
  // assigned to the same influencer get different face videos.
  const enabledInfluencerIds = Array.isArray(campaign.enabledInfluencerIds)
    ? (campaign.enabledInfluencerIds as string[])
    : [];
  const influencerVideoMap = new Map<string, string[]>();
  const influencerBaseImageMap = new Map<string, string>();
  if (enabledInfluencerIds.length > 0) {
    try {
      const influencerRows = await db
        .select({
          id: aiInfluencerSchema.id,
          latestVideoUrl: aiInfluencerSchema.latestVideoUrl,
          latestVideoUrls: aiInfluencerSchema.latestVideoUrls,
          baseImageUrl: aiInfluencerSchema.baseImageUrl,
        })
        .from(aiInfluencerSchema)
        .where(inArray(aiInfluencerSchema.id, enabledInfluencerIds));
      for (const r of influencerRows) {
        const urls: string[] = [];
        if (Array.isArray(r.latestVideoUrls)) {
          for (const entry of r.latestVideoUrls) {
            if (entry?.url) {
              urls.push(entry.url);
            }
          }
        }
        // Fallback: if pool is empty but legacy single URL exists, use it
        if (urls.length === 0 && r.latestVideoUrl) {
          urls.push(r.latestVideoUrl);
        }
        if (urls.length > 0) {
          influencerVideoMap.set(r.id, urls);
        }
        if (r.baseImageUrl) {
          influencerBaseImageMap.set(r.id, r.baseImageUrl);
        }
      }
    } catch (err) {
      console.warn('[Campaign] Failed to load influencer video map:', err);
    }
  }

  // Insert template posts with media set substitution
  let inserted = 0;
  const contentItemIds: string[] = [];
  let failedPosts = 0;
  // Counts posts skipped because the selected Media Set has fewer distinct
  // assets than the template's slide count. Surfaced in the /generate
  // response so the client can show a "your set is too small" hint.
  let skippedInsufficientAssets = 0;

  // Seed the progress record with the total up-front so the client sees
  // "0 of 14" the moment the drain claims the job, not "0 of 0". The
  // drain-job throttler will accept this first write because lastPercent
  // starts at -1 (any value passes).
  try {
    await onProgress?.({
      postIndex: 0,
      total: postsToCreate,
      status: 'phase1_starting',
      percent: 1,
    });
  } catch { /* best-effort */ }

  for (const { template, hookText } of templatePosts) {
    try {
      let sourceMediaSlots = buildSourceMediaSlots(template);
      let _insufficientAssets = false;
      try {
        const set = await pickDefaultSet(db, orgId, template.contentType);
        if (set) {
          // Rotate the starting asset index so consecutive posts show different
          // leading images even when the same media set applies to every post.
          sourceMediaSlots = applySetToSlots(sourceMediaSlots as any, set, template.contentType, inserted);
        }
      } catch (err) {
        if (err instanceof InsufficientAssetsError) {
          _insufficientAssets = true;
        }
        // Non-insufficient errors: keep original slots (best-effort).
      }
      if (_insufficientAssets) {
        skippedInsufficientAssets++;
        console.log(
          `[Campaign] Skipping ${template.id} — media set too small for ${template.contentType} template.`,
        );
        continue;
      }

      const resolvedContentType = template.contentType;
      if (!RENDERABLE_CONTENT_TYPES.has(resolvedContentType)) {
        continue;
      }

      // Build a proper editor script from the template's caption data so the
      // Blitz card shows per-slide text (slideshows), bodyText (video hooks),
      // etc. Only fall back to pickUniqueHook when no caption is available.
      // Content-template rows store the original caption as structure.caption
      // or slideCaptions — neither is guaranteed, so fall back gracefully.
      const rawTemplateCaption = template.structure?.caption
        || (Array.isArray(template.slideCaptions) ? template.slideCaptions.join('\n') : '')
        || (typeof template.slideCaptions === 'object' && template.slideCaptions !== null
          ? Object.values(template.slideCaptions).join('\n') : '')
        || '';

      // Rewrite the source caption in the brand voice + roll for a
      // brand-name mention per campaign.mentionFrequency. Cached by
      // (templateId, brandUpdatedAt, platform) so repeat generations
      // don't re-pay. Falls back to raw on any error.
      const _voice = await applyBrandVoice({
        profile,
        sourceCaption: rawTemplateCaption,
        contentType: resolvedContentType,
        platform: Array.isArray(targetPlatforms) ? targetPlatforms[0] : null,
        templateId: template.id,
        mentionFrequency: campaign.mentionFrequency as any,
      });
      const templateCaption = _voice.caption || rawTemplateCaption;

      let editorScript = buildEditorScript(
        { caption: templateCaption, content_type: resolvedContentType, template_id: template.id },
        { contentType: resolvedContentType, slideCaptions: template.slideCaptions, thumbnailUrls: template.thumbnailUrls },
      );
      if (!editorScript.hookText) {
        editorScript = { hookText };
      }
      // Duplicate-hook guard.
      //
      // When multiple posts pull from the same template family the derived
      // hookText tends to collide (same caption prefix → same clip). Even
      // when it doesn't, similar templates produce near-identical opening
      // lines. Detect a repeat and swap the collided hook for a fresh
      // FALLBACK_HOOKS pick (which pickUniqueHook already tracks). The
      // rest of editorScript (slideCopy, bodyText, ctaText) stays intact
      // so slideshows still get their per-slide captions.
      if (editorScript.hookText && usedHooks.has(editorScript.hookText)) {
        editorScript = { ...editorScript, hookText: pickUniqueHook(resolvedContentType) };
      } else if (editorScript.hookText) {
        usedHooks.add(editorScript.hookText);
      }
      // Same dedupe on the caption we persist to the DB: the hookText we
      // saved to caption above is used as the platform post caption. If
      // two posts share it, the campaign feed looks copy-pasted.
      const captionForRow = editorScript.hookText || hookText;

      // Derive a specific topic label for the Blitz topic pill from the
      // template's caption/hooks — e.g. "Real Results, Real Growth". Falls
      // back to null when nothing usable is available; UI hides the pill.
      const topicLabel = deriveTopicLabel(template);
      const reasoning = buildReasoning(
        { topic_label: topicLabel || undefined },
        {
          contentType: resolvedContentType,
          sourcePlatform: template.sourcePlatform,
          sourceCreator: template.sourceCreator,
          viewCount: template.viewCount,
          likeCount: template.likeCount,
          commentCount: template.commentCount,
        },
      );

      const rawSource = template.mediaUrl || template.thumbnailUrl || template.sourceUrl || null;

      // Pick influencer + hydrate slots (same pattern as site 2).
      const pickedInfluencerId = pickInfluencerForPost(
        campaign.enabledInfluencerIds as string[] | null,
        campaign.influencerFrequency as number | null,
        inserted,
      );
      if (
        pickedInfluencerId
        && resolvedContentType === 'talking_head'
        && influencerVideoMap.has(pickedInfluencerId)
      ) {
        const videos = influencerVideoMap.get(pickedInfluencerId)!;
        sourceMediaSlots = {
          ...sourceMediaSlots,
          faceVideo: { url: videos[inserted % videos.length]! },
        };
      }
      if (
        pickedInfluencerId
        && (!sourceMediaSlots.background || !sourceMediaSlots.background.url)
        && influencerBaseImageMap.has(pickedInfluencerId)
      ) {
        sourceMediaSlots = {
          ...sourceMediaSlots,
          background: { url: influencerBaseImageMap.get(pickedInfluencerId)!, assetType: 'image' as const },
        };
      }

      const [contentItem] = await db
        .insert(contentItemSchema)
        .values({
          orgId,
          caption: captionForRow,
          enrichmentData: {
            sourceMediaSlots,
            editorScript,
            reasoning,
            isCompiled: false,
            templateId: template.id,
            templateSnapshot: template,
            topicLabel,
          },
          rawSource,
          contentType: resolvedContentType,
          status: 'pending_review',
          brandProfileId: profile?.id || null,
          angleId: null,
          influencerId: pickedInfluencerId,
          campaignId: campaign.id,
          targetPlatforms,
          graphicUrls: rawSource
            ? [rawSource]
            : Array.isArray(sourceMediaSlots?.slides) && sourceMediaSlots.slides.length > 0
              ? [sourceMediaSlots.slides[0]?.url || '']
              : [],
        })
        .returning();

      contentItemIds.push(contentItem.id);
      inserted++;

      if (pickedInfluencerId) {
        db.update(aiInfluencerSchema)
          .set({ usageCount: sql`usage_count + 1`, updatedAt: new Date() })
          .where(eq(aiInfluencerSchema.id, pickedInfluencerId))
          .execute().catch((err: unknown) => console.warn('[Campaign] Failed to bump usageCount:', err));
      }

      // Emit progress after each Phase 1 insert so the client status poll
      // has a live denominator + counter. Without this, Phase 1 fills every
      // slot silently (Phase 2/engine is the only place that historically
      // called onProgress), and the client's progress bar sits at 0/0 the
      // entire time until the final status='done' flip.
      try {
        await onProgress?.({
          postIndex: inserted,
          total: postsToCreate,
          status: 'phase1_inserting',
          percent: Math.min(95, Math.max(5, Math.round((inserted / postsToCreate) * 100))),
        });
      } catch { /* progress writes are best-effort */ }

      // Fire-and-forget per-slide caption generation for slideshow-type
      // Blitz cards so each slide gets its OWN unique caption instead of
      // all rendering the same hookText. Runs via waitUntil so the
      // request returns immediately; the Blitz card polls the row and
      // re-renders when enrichmentData.editorScript.slideCopy fills in.
      const isSlideshowType
        = resolvedContentType === 'slideshow'
          || resolvedContentType === 'carousel'
          || resolvedContentType === 'data_story';
      const slideUrls: string[] = Array.isArray((sourceMediaSlots as any)?.slides)
        ? ((sourceMediaSlots as any).slides as { url: string }[])
            .map(s => s?.url)
            .filter((u): u is string => typeof u === 'string' && u.length > 0)
        : [];
      const hasUniquePerSlide
        = Array.isArray(editorScript.slideCopy)
          && editorScript.slideCopy.length === slideUrls.length
          && new Set(editorScript.slideCopy.filter(Boolean)).size === slideUrls.length;
      if (isSlideshowType && slideUrls.length > 1 && !hasUniquePerSlide) {
        try {
          waitUntil(
            generateBlitzSlideCaptions({
              db,
              orgId,
              contentItemId: contentItem.id,
              contentType: resolvedContentType,
              slideUrls,
              hookText: editorScript.hookText,
              contextCaption: templateCaption,
            }).catch((err: any) => {
              console.error('[Campaign] slide caption gen failed:', err?.message || err);
            }),
          );
        } catch (err) {
          // waitUntil throws outside Vercel runtime (e.g. local dev without
          // the shim). Fire the promise anyway so local dev still gets
          // the captions.
          void generateBlitzSlideCaptions({
            db,
            orgId,
            contentItemId: contentItem.id,
            contentType: resolvedContentType,
            slideUrls,
            hookText: editorScript.hookText,
            contextCaption: templateCaption,
          }).catch((e: any) => {
            console.error('[Campaign] slide caption gen (local) failed:', e?.message || e);
          });
        }
      }

      await db.insert(campaignContentSchema).values({
        campaignId: campaign.id,
        contentItemId: contentItem.id,
        sequenceIndex: contentItemIds.length - 1,
        scheduledDate: calculateSchedule(campaign.startDate, postsPerDay, contentItemIds.length - 1).scheduledDate,
        scheduledTime: calculateSchedule(campaign.startDate, postsPerDay, contentItemIds.length - 1).scheduledTime,
      });

      const { scheduledDate: sDate } = calculateSchedule(campaign.startDate, postsPerDay, contentItemIds.length - 1);
      onPostComplete?.({
        postIndex: contentItemIds.length - 1,
        contentItemId: contentItem.id,
        contentType: resolvedContentType,
        scheduledDate: sDate.toISOString().slice(0, 10),
      });
    } catch (err: any) {
      console.error(`[Campaign] Phase 1 insert failed for ${template.id}:`, err?.message || err);
      failedPosts++;
      onPostError?.({
        postIndex: inserted,
        detail: err?.message || String(err),
      });
    }
  }

  // ── Phase 2: Engine supplement (only if template slots are unfilled) ──
  const remaining = postsToCreate - inserted;
  let engineResult: any = null;
  if (remaining <= 0) {
    console.log(`[Campaign] Phase 1 filled all ${postsToCreate} slots. Skipping engine call.`);
  } else {
    // Wrap engine block so on error we break out gracefully
    // instead of throwing and killing the entire campaign job.
    // Phase 1 already inserted what it could — the template fallback
    // section after this block fills remaining slots.
    do {
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
        target_accounts: (campaign.targetAccounts as { accountId: string; platform: string }[] || []).map(a => ({
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
          console.error(`[Campaign] Engine timed out after 240s at ${ENGINE_URL}.`);
        } else {
          console.error(`[Campaign] Engine unreachable at ${ENGINE_URL}: ${fetchErr?.message || fetchErr}`);
        }
        break; // exit do-while → template fallback
      }
      clearTimeout(engineTimeout);

      if (!res.ok) {
        const text = await res.text().catch(() => 'Unknown error');
        console.error(`[Campaign] Engine failed: ${res.status} ${text}`);
        break; // exit do-while → template fallback
      }

      engineResult = await res.json() as {
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

      // NOTE: Do NOT redeclare `failedPosts`, `contentItemIds`, or
      // `inserted` here — they exist in the outer scope (declared before
      // Phase 1) and MUST be reused so Phase-2 respects Phase-1's counters.
      // Redeclaring them silently doubled the daily cap and dropped
      // Phase-1 failures from the summary. Reassign only.

      // Guarantee exactly postsPerDay cards reach the Blitz queue. The engine
      // may return more posts than needed (buffer) or some posts may reference
      // unresolvable template_ids. We stop once we've successfully inserted
      // postsPerDay cards.
      // Use the Phase 1 `usedTemplateIds` set. The engine-supplement loop
      // must NOT re-insert templates already used in the template-first pass.
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
          const targetContentType = nextType();

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
            const pool1 = (byType.get(targetContentType) || [])
              .filter(t => !usedTemplateIds.has(t.id));
            if (pool1.length > 0) {
              template = pool1[Math.floor(Math.random() * pool1.length)]!;
            } else {
              // Try 2: any unused template of a different content type
              // (cross-grade to maintain visual diversity across cards)
              const otherTypes = templates.filter(
                t => !usedTemplateIds.has(t.id) && t.contentType !== template?.contentType,
              );
              if (otherTypes.length > 0) {
                template = otherTypes[Math.floor(Math.random() * otherTypes.length)]!;
                console.warn(
                  `[Campaign] Post ${i}: type "${targetContentType}" pool exhausted, `
                  + `cross-grading to "${template.contentType}"`,
                );
              } else {
                // Try 3: any unused template (even same type — last resort)
                const anyUnused = templates.filter(t => !usedTemplateIds.has(t.id));
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
                `[Campaign] Post ${i}: no engine-suggested template_id, `
                + `assigned ${template.id} (${template.contentType})`,
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
          let _insufficientAssets = false;
          try {
            const set = await pickDefaultSet(db, orgId, resolvedContentType);
            if (set) {
              sourceMediaSlots = applySetToSlots(sourceMediaSlots as any, set, resolvedContentType, inserted);
            }
          } catch (setErr: any) {
            if (setErr instanceof InsufficientAssetsError) {
              _insufficientAssets = true;
            } else {
              console.warn(`[Campaign] Set substitution failed for post ${i}:`, setErr?.message || setErr);
            }
          }
          if (_insufficientAssets) {
            skippedInsufficientAssets++;
            console.log(
              `[Campaign] Phase-2 skipping post ${i} — set too small for ${resolvedContentType}.`,
            );
            continue;
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

          // Rewrite engine-generated caption in brand voice + mention roll.
          const _voice2 = await applyBrandVoice({
            profile,
            sourceCaption: post.caption || '',
            contentType: resolvedContentType,
            platform: Array.isArray(targetPlatforms) ? targetPlatforms[0] : null,
            templateId: post.template_id || template.id,
            mentionFrequency: campaign.mentionFrequency as any,
          });
          const brandedCaption = _voice2.caption || post.caption || '';

          const editorScript = buildEditorScript(
            { caption: brandedCaption, content_type: post.content_type, template_id: post.template_id },
            { contentType: resolvedContentType, slideCaptions: template.slideCaptions, thumbnailUrls: template.thumbnailUrls },
          );

          // Blitz "Remixed From" panel + Why popover need full source
          // attribution (mediaUrl for the mini preview, creator/platform for
          // the popover, engagement metrics for chips).
          const topicLabel = deriveTopicLabel(template);
          const reasoning = buildReasoning(
            { angle_name: post.angle_name, topic_label: topicLabel || undefined },
            {
              contentType: resolvedContentType,
              sourcePlatform: template.sourcePlatform,
              sourceCreator: template.sourceCreator,
              viewCount: template.viewCount,
              likeCount: template.likeCount,
              commentCount: template.commentCount,
            },
          );

          const sourceTemplateSnapshot = {
            mediaUrl: template.mediaUrl,
            thumbnailUrl: template.thumbnailUrl,
            thumbnailUrls: template.thumbnailUrls,
            sourceUrl: template.sourceUrl,
            sourcePlatform: template.sourcePlatform,
            sourceCreator: template.sourceCreator,
            slideCaptions: template.slideCaptions,
            viewCount: template.viewCount,
            likeCount: template.likeCount,
            commentCount: template.commentCount,
          };

          // Preserve raw source media in graphicUrls[0] so compile can find
          // the untouched original (team memory: preserve-raw-source-in-compile-pipeline).
          const rawSource = template.mediaUrl || template.thumbnailUrl || template.sourceUrl || null;

          // Pick the influencer for this post once (Phase I6 rotation). If the
          // pick lands on an influencer with a cached talking-head render, use
          // it to hydrate mediaSlots.faceVideo so the TalkingHead composition
          // stops rendering black in the PiP window.
          const pickedInfluencerId = pickInfluencerForPost(
            campaign.enabledInfluencerIds as string[] | null,
            campaign.influencerFrequency as number | null,
            i,
          );
          if (
            pickedInfluencerId
            && resolvedContentType === 'talking_head'
            && influencerVideoMap.has(pickedInfluencerId)
          ) {
            const videos = influencerVideoMap.get(pickedInfluencerId)!;
            sourceMediaSlots = {
              ...sourceMediaSlots,
              faceVideo: { url: videos[inserted % videos.length]! },
            };
          }
          if (
            pickedInfluencerId
            && (!sourceMediaSlots.background || !sourceMediaSlots.background.url)
            && influencerBaseImageMap.has(pickedInfluencerId)
          ) {
            sourceMediaSlots = {
              ...sourceMediaSlots,
              background: { url: influencerBaseImageMap.get(pickedInfluencerId)!, assetType: 'image' as const },
            };
          }

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
              graphicUrls: rawSource
                ? [rawSource]
                : Array.isArray(sourceMediaSlots?.slides) && sourceMediaSlots.slides.length > 0
                  ? [sourceMediaSlots.slides[0]?.url || '']
                  : [],
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
                ...(topicLabel ? { topicLabel } : {}),
              },
              enrichmentApplied: [],
              campaignId: campaign.id,
              angleId: post.angle_id || null,
              influencerId: pickedInfluencerId,
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

          if (pickedInfluencerId) {
            db.update(aiInfluencerSchema)
              .set({ usageCount: sql`usage_count + 1`, updatedAt: new Date() })
              .where(eq(aiInfluencerSchema.id, pickedInfluencerId))
              .execute().catch((err: unknown) => console.warn('[Campaign] Failed to bump usageCount:', err));
          }

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
    } while (false);
  } // end engine supplement else block

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
      if (usedTemplateIds.has(t.id)) {
        continue;
      }
      if (!RENDERABLE_CONTENT_TYPES.has(t.contentType)) {
        continue;
      }
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
      const targetType = nextType();
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
        `[Campaign] Engine produced ${inserted} unique posts (${failedPosts} failed). `
        + `Filling ${fillTemplates.length} slots with content-type-cycled templates.`,
      );
    }

    for (const template of fillTemplates) {
      if (inserted >= postsToCreate) {
        break;
      }

      try {
        const resolvedContentType = template.contentType;
        if (!RENDERABLE_CONTENT_TYPES.has(resolvedContentType)) {
          continue;
        }

        let sourceMediaSlots = buildSourceMediaSlots(template);

        // Apply media set substitution (same logic as engine posts)
        let _insufficientAssets = false;
        try {
          const set = await pickDefaultSet(db, orgId, resolvedContentType);
          if (set) {
            sourceMediaSlots = applySetToSlots(sourceMediaSlots as any, set, resolvedContentType, inserted);
          }
        } catch (err) {
          if (err instanceof InsufficientAssetsError) {
            _insufficientAssets = true;
          }
          // Non-insufficient: silent (fallback path is best-effort).
        }
        if (_insufficientAssets) {
          skippedInsufficientAssets++;
          continue;
        }

        // Randomised caption pool so fallback Blitz posts don't all
        // show the same generic hook text on the card preview.
        const typeHooks = FALLBACK_HOOKS[resolvedContentType] || FALLBACK_HOOKS.reel!;
        const randomHook = typeHooks[Math.floor(Math.random() * typeHooks.length)]!;

        const slideCaptions = template.slideCaptions;
        const firstSlideCaption = Array.isArray(slideCaptions)
          ? slideCaptions[0]
          : slideCaptions && typeof slideCaptions === 'object'
            ? Object.values(slideCaptions)[0]
            : undefined;
        const rawCaption = firstSlideCaption
          || randomHook
          || `Hook text for ${resolvedContentType.replace(/_/g, ' ')}`;

        // Fallback-pool captions are the highest duplicate-risk path
        // (small pool of FALLBACK_HOOKS repeated across posts). Rewriting
        // in brand voice + optional mention breaks the collision AND
        // keeps the fallback aligned with the brand.
        const _voice3 = await applyBrandVoice({
          profile,
          sourceCaption: rawCaption,
          contentType: resolvedContentType,
          platform: Array.isArray(targetPlatforms) ? targetPlatforms[0] : null,
          templateId: template.id,
          mentionFrequency: campaign.mentionFrequency as any,
        });
        const caption = _voice3.caption || rawCaption;

        const editorScript = buildEditorScript(
          { caption, content_type: resolvedContentType, template_id: template.id },
          { contentType: resolvedContentType, slideCaptions: template.slideCaptions, thumbnailUrls: template.thumbnailUrls },
        );

        const topicLabel = deriveTopicLabel(template);
        const reasoning = buildReasoning(
          { topic_label: topicLabel || undefined },
          {
            contentType: resolvedContentType,
            sourcePlatform: template.sourcePlatform,
            sourceCreator: template.sourceCreator,
            viewCount: template.viewCount,
            likeCount: template.likeCount,
            commentCount: template.commentCount,
          },
        );

        const rawSource = template.mediaUrl || template.thumbnailUrl || template.sourceUrl || null;

        // Pick influencer + hydrate slots (same pattern as site 2).
        const pickedInfluencerId = pickInfluencerForPost(
          campaign.enabledInfluencerIds as string[] | null,
          campaign.influencerFrequency as number | null,
          inserted,
        );
        if (
          pickedInfluencerId
          && resolvedContentType === 'talking_head'
          && influencerVideoMap.has(pickedInfluencerId)
        ) {
          const videos = influencerVideoMap.get(pickedInfluencerId)!;
          sourceMediaSlots = {
            ...sourceMediaSlots,
            faceVideo: { url: videos[inserted % videos.length]! },
          };
        }
        if (
          pickedInfluencerId
          && (!sourceMediaSlots.background || !sourceMediaSlots.background.url)
          && influencerBaseImageMap.has(pickedInfluencerId)
        ) {
          sourceMediaSlots = {
            ...sourceMediaSlots,
            background: { url: influencerBaseImageMap.get(pickedInfluencerId)!, assetType: 'image' as const },
          };
        }

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
                mediaUrl: template.mediaUrl,
                thumbnailUrl: template.thumbnailUrl,
                thumbnailUrls: template.thumbnailUrls,
                sourceUrl: template.sourceUrl,
                sourcePlatform: template.sourcePlatform,
                sourceCreator: template.sourceCreator,
                slideCaptions: template.slideCaptions,
                viewCount: template.viewCount,
                likeCount: template.likeCount,
                commentCount: template.commentCount,
              },
              editorScript,
              reasoning,
              ...(topicLabel ? { topicLabel } : {}),
            },
            graphicUrls: rawSource
              ? [rawSource]
              : Array.isArray(sourceMediaSlots?.slides) && sourceMediaSlots.slides.length > 0
                ? [sourceMediaSlots.slides[0]?.url || '']
                : [],
            templateId: template.id,
            contentFormat: resolvedContentType === 'slideshow' ? 'carousel' : 'single',
            aspectRatio: '9:16',
            aiModelUsed: 'template-fallback',
            influencerId: pickedInfluencerId,
            campaignId: campaign.id,
            targetPlatforms,
          })
          .returning();

        contentItemIds.push(contentItem.id);

        if (pickedInfluencerId) {
          db.update(aiInfluencerSchema)
            .set({ usageCount: sql`usage_count + 1`, updatedAt: new Date() })
            .where(eq(aiInfluencerSchema.id, pickedInfluencerId))
            .execute().catch((err: unknown) => console.warn('[Campaign] Failed to bump usageCount:', err));
        }

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

  const totalEnginePosts = engineResult?.total_posts ?? inserted;

  console.log(
    `[Campaign] Generation complete: requested=${postsToCreate} inserted=${inserted} failed=${failedPosts} `
    + `enginePosts=${totalEnginePosts} itemIds=${contentItemIds.length}`,
  );

  return {
    totalPosts: totalEnginePosts,
    completedPosts: totalEnginePosts - failedPosts,
    failedPosts,
    contentItemIds,
    // Surface the count of posts skipped because a Media Set didn't have
    // enough distinct assets for the slideshow it was substituting into.
    // Consumed by the /generate route response so the UI can explain why
    // fewer posts landed than requested (per Ingestion loop counter discipline).
    skippedInsufficientAssets,
  };
}

// ── Re-roll helper ───────────────────────────────────────────────────────────

export async function reRollPost(
  db: any,
  orgId: string,
  campaignId: string,
  contentItemId: string,
  keepText: boolean,
  topicOverride: string | null = null,
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
      db,
      topic: topicOverride || item.topic || 'General',
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
    if (!contentItem) {
      continue;
    }

    // Only schedule approved posts
    if (contentItem.status !== 'approved') {
      skippedCount++;
      continue;
    }

    const platforms = (contentItem.targetPlatforms as string[]) || [];

    for (const platform of platforms) {
      const account = accounts.find((a: any) => a.platform === platform);
      if (!account) {
        continue;
      }

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
    if (!grouped[date]) {
      grouped[date] = [];
    }
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
