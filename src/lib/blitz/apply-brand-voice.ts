/**
 * applyBrandVoice
 *
 * Rewrites a Blitz post caption in the org's brand voice using Claude
 * Haiku (fast + cheap). Also injects the brand name per campaign
 * `mentionFrequency` when the setting fires.
 *
 * Cheap by design: one Haiku call per post. Cached in-process by
 * `hash(templateId + brandProfileUpdatedAt + platform)` so repeated
 * generations against the same template+brand don't pay twice.
 *
 * Fails soft: any error returns the source caption unchanged. Blitz
 * generation must never block on brand-voice rewriting.
 */

import Anthropic from '@anthropic-ai/sdk';

// Pure constants module (no React) — imported so the generation budget and the
// renderer's cap are literally the same number rather than two literals that
// drift. See DEFAULT_CAPTION_BUDGET below.
import { TEXT_LIMITS } from '@/components/editor/compositions/text-limits';

export type BrandProfileLike = {
  brandName?: string | null;
  industry?: string | null;
  toneFormality?: number | null;
  toneHumor?: number | null;
  toneEnergy?: number | null;
  vocabulary?: unknown;
  forbiddenWords?: unknown;
  communicationStyle?: string | null;
  productsServices?: unknown;
  updatedAt?: Date | string | null;
};

export type MentionFrequency = 'never' | 'rarely' | 'sometimes' | 'always' | string;

export type ApplyBrandVoiceOpts = {
  profile: BrandProfileLike | null | undefined;
  sourceCaption: string;
  contentType: string;
  platform?: string | null;
  hookText?: string | null;
  templateId?: string | null;
  mentionFrequency?: MentionFrequency;
  /**
   * Hard character budget for the rewritten caption. Passed into the prompt so
   * the model WRITES to fit, instead of us cutting afterwards and leaving a
   * visible "…" in the caption box. Defaults to DEFAULT_CAPTION_BUDGET.
   */
  maxChars?: number;
};

/**
 * Default caption budget — what generation is TOLD to write within.
 *
 * Must equal the tightest cap any renderer enforces, which is
 * `TEXT_LIMITS.hook` in compositions/text-limits.ts (the compiled MP4's
 * limit). Budget higher than the renderer and copy clears the preview but
 * gets cut when the video bakes; that mismatch is exactly how a trailing
 * ellipsis reached published captions.
 *
 * Imported from TEXT_LIMITS rather than duplicated as a literal, so the two
 * cannot drift apart no matter which one someone edits.
 */
export const DEFAULT_CAPTION_BUDGET: number = TEXT_LIMITS.hook;

/**
 * Strip the punctuation that reads as machine-written.
 *
 * Em and en dashes are the giveaway — "Your face is your brand — own it."
 * A comma carries the same beat without the tell. Hyphens inside compound
 * words (multi-step, hand-waving) are left alone; only dashes acting as
 * sentence punctuation are replaced.
 */
export function stripAiTells(text: string): string {
  return text
    // Spaced em/en dash used as a clause break → comma.
    .replace(/\s+[—–]\s+/g, ', ')
    // Unspaced em/en dash between words → comma + space.
    .replace(/(\w)[—–](\w)/g, '$1, $2')
    // Any stragglers (leading/trailing) → drop.
    .replace(/[—–]/g, '')
    // A trailing ellipsis is the other tell: it reads as truncated output.
    .replace(/\s*(\.{3}|…)\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim();
}

export type ApplyBrandVoiceResult = {
  caption: string;
  // True when the mention roll fired AND the brand name was appended.
  mentionInjected: boolean;
  // True when the returned text is from cache (helps callers reason
  // about cost + latency in logs).
  cached: boolean;
};

// -----------------------------------------------------------
// Simple in-process LRU cache. Bounded to prevent Vercel Lambda
// memory drift across cold starts. Keyed on templateId + brand hash.
//
// Sized to hold a whole generation chunk with room to spare. `prewarmBrandVoice`
// fills the cache for every post in a chunk before the insert loop reads it
// back, so the ceiling must exceed the chunk size or early entries would be
// evicted before their post is reached and re-pay for the rewrite.
// -----------------------------------------------------------
const CACHE_MAX = 1000;
const cache = new Map<string, string>();

function cachePut(key: string, value: string): void {
  if (cache.size >= CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey) {
      cache.delete(firstKey);
    }
  }
  cache.set(key, value);
}

function cacheGet(key: string): string | undefined {
  const hit = cache.get(key);
  if (hit !== undefined) {
    // Move to end (LRU touch)
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit;
}

function toStringArray(v: unknown): string[] {
  if (!v) {
    return [];
  }
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
  }
  return [];
}

function deriveBrandTone(formality: number, humor: number, energy: number): string {
  const tones: string[] = [];
  if (formality >= 7) {
    tones.push('professional');
  } else if (formality <= 3) {
    tones.push('casual');
  }
  if (humor >= 7) {
    tones.push('playful');
  } else if (humor <= 3) {
    tones.push('serious');
  }
  if (energy >= 7) {
    tones.push('bold');
  } else if (energy <= 3) {
    tones.push('calm');
  }
  return tones.length === 0 ? 'balanced' : tones.join(' ');
}

function mentionShouldFire(frequency: MentionFrequency | undefined): boolean {
  switch (frequency) {
    case 'always':
      return true;
    case 'sometimes':
      return Math.random() < 0.5;
    case 'rarely':
      return Math.random() < 0.25;
    case 'never':
    default:
      return false;
  }
}

function alreadyMentions(caption: string, brandName: string): boolean {
  if (!brandName) {
    return true;
  }
  const needle = brandName.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  const hay = caption.toLowerCase();
  return hay.includes(`@${needle}`) || hay.includes(needle);
}

function appendMention(caption: string, brandName: string, platform: string | null | undefined): string {
  const p = (platform || '').toLowerCase();
  const usesHandle = p === 'twitter' || p === 'x' || p === 'instagram';
  // No em dash here either — it was stamping the exact punctuation we strip
  // from the body onto the end of every mentioning caption.
  const trimmed = caption.replace(/[\s.,;:]+$/g, '');
  const suffix = usesHandle ? `. @${brandName}` : `. ${brandName}`;
  return trimmed + suffix;
}

function stripForbidden(caption: string, forbidden: string[]): string {
  if (forbidden.length === 0) {
    return caption;
  }
  let out = caption;
  for (const word of forbidden) {
    if (!word) {
      continue;
    }
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    out = out.replace(re, '').replace(/\s{2,}/g, ' ');
  }
  return out.trim();
}

function buildCacheKey(opts: ApplyBrandVoiceOpts): string {
  const templateId = opts.templateId || 'none';
  const brandStamp = opts.profile?.updatedAt
    ? new Date(opts.profile.updatedAt).getTime()
    : 'no-brand';
  const platform = opts.platform || 'any';
  const captionHash = simpleHash(opts.sourceCaption);
  return `${templateId}:${brandStamp}:${platform}:${captionHash}`;
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h.toString(36);
}

// -----------------------------------------------------------
// Main entry point.
// -----------------------------------------------------------
export async function applyBrandVoice(opts: ApplyBrandVoiceOpts): Promise<ApplyBrandVoiceResult> {
  const source = (opts.sourceCaption || '').trim();
  if (!source) {
    return { caption: '', mentionInjected: false, cached: false };
  }

  const profile = opts.profile;
  const brandName = (profile?.brandName || '').trim();

  // No brand profile → return source unchanged (still honor mention if
  // frequency says so, but only if we have a brand name to inject).
  if (!profile) {
    return { caption: source, mentionInjected: false, cached: false };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const forbidden = toStringArray(profile.forbiddenWords);
  const vocabulary = toStringArray(profile.vocabulary).slice(0, 12);
  const products = toStringArray(profile.productsServices).slice(0, 8);
  const brandTone = deriveBrandTone(
    profile.toneFormality ?? 5,
    profile.toneHumor ?? 5,
    profile.toneEnergy ?? 5,
  );

  const cacheKey = buildCacheKey(opts);
  let rewritten: string | null = cacheGet(cacheKey) ?? null;
  const cached = rewritten !== null;

  if (!rewritten && apiKey) {
    try {
      const client = new Anthropic({ apiKey });
      const prompt = `You rewrite short-form social captions in the voice of ${brandName || 'the brand'}.

Brand:
- Name: ${brandName || 'unspecified'}
- Industry: ${profile.industry || 'general'}
- Tone: ${brandTone}
- Style: ${profile.communicationStyle || 'default'}
${vocabulary.length ? `- Preferred words: ${vocabulary.join(', ')}` : ''}
${products.length ? `- Products/services: ${products.join(', ')}` : ''}
${forbidden.length ? `- NEVER use these words: ${forbidden.join(', ')}` : ''}

Content type: ${opts.contentType}
${opts.platform ? `Platform: ${opts.platform}` : ''}
${opts.hookText ? `Hook context: ${opts.hookText}` : ''}

Rewrite this caption in the brand voice above.

Hard rules:
- MAXIMUM ${opts.maxChars ?? DEFAULT_CAPTION_BUDGET} characters. This is a hard limit, not a target. The caption is rendered inside a fixed box and anything longer gets cut, so finish the thought within the budget rather than writing long.
- End on a complete sentence. Never trail off, and never end with an ellipsis.
- Never use em dashes or en dashes (— or –). Use a comma, a full stop, or restructure the sentence. Hyphens inside compound words are fine.
- Preserve the hook. Do not add hashtags. Do not add emojis unless the tone is playful or bold.
- Do not restate the brand name at the end; it is appended separately if needed.

Return ONLY the rewritten caption, no quotes, no preamble.

Source caption:
${source}`;

      const response = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 400,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content
        .filter(c => c.type === 'text')
        .map(c => (c as { text: string }).text)
        .join(' ')
        .replace(/^["'`]+|["'`]+$/g, '')
        .trim();

      if (text) {
        rewritten = text;
        cachePut(cacheKey, rewritten);
      }
    } catch (err) {
      console.warn('[applyBrandVoice] Anthropic rewrite failed, trying DeepSeek:', err);
    }
  }

  // ── DeepSeek fallback ────────────────────────────────────────────────
  // When Anthropic is out of credits or unavailable, try DeepSeek with
  // the same prompt. The OpenAI-compatible endpoint uses a raw fetch so
  // we don't need an extra SDK. Cached identically to Anthropic results.
  if (!rewritten) {
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    if (deepseekKey) {
      try {
        const deepseekPrompt = `You rewrite short-form social captions in the voice of ${brandName || 'the brand'}.

Brand:
- Name: ${brandName || 'unspecified'}
- Industry: ${profile.industry || 'general'}
- Tone: ${brandTone}
- Style: ${profile.communicationStyle || 'default'}
${vocabulary.length ? `- Preferred words: ${vocabulary.join(', ')}` : ''}
${products.length ? `- Products/services: ${products.join(', ')}` : ''}
${forbidden.length ? `- NEVER use these words: ${forbidden.join(', ')}` : ''}

Content type: ${opts.contentType}
${opts.platform ? `Platform: ${opts.platform}` : ''}
${opts.hookText ? `Hook context: ${opts.hookText}` : ''}

Rewrite this caption in the brand voice above.

Hard rules:
- MAXIMUM ${opts.maxChars ?? DEFAULT_CAPTION_BUDGET} characters. This is a hard limit, not a target. The caption is rendered inside a fixed box and anything longer gets cut, so finish the thought within the budget rather than writing long.
- End on a complete sentence. Never trail off, and never end with an ellipsis.
- Never use em dashes or en dashes (— or –). Use a comma, a full stop, or restructure the sentence. Hyphens inside compound words are fine.
- Preserve the hook. Do not add hashtags. Do not add emojis unless the tone is playful or bold.
- Do not restate the brand name at the end; it is appended separately if needed.

Return ONLY the rewritten caption, no quotes, no preamble.

Source caption:
${source}`;

        const dsRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${deepseekKey}`,
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            max_tokens: 400,
            temperature: 0.7,
            messages: [{ role: 'user', content: deepseekPrompt }],
          }),
        });

        if (dsRes.ok) {
          const dsBody = await dsRes.json();
          const dsText = dsBody?.choices?.[0]?.message?.content?.trim();
          if (dsText) {
            rewritten = dsText.replace(/^["'`]+|["'`]+$/g, '').trim();
            cachePut(cacheKey, rewritten!);
          }
        } else {
          console.warn('[applyBrandVoice] DeepSeek fallback failed:', dsRes.status, await dsRes.text().catch(() => ''));
        }
      } catch (dsErr) {
        console.warn('[applyBrandVoice] DeepSeek fallback error:', dsErr);
      }
    }
  }

  let final = rewritten || source;
  final = stripForbidden(final, forbidden);
  // Applied to BOTH branches on purpose: the model is told not to use dashes,
  // but it sometimes does anyway, and the `source` fallback is scraped
  // template copy that was never asked. This is the single place every caption
  // passes through, so it's the only place the guarantee holds.
  final = stripAiTells(final);

  // Brand-name mention roll — only fires when we have a brand name AND
  // the caption doesn't already mention it (avoids double stamps).
  let mentionInjected = false;
  if (brandName && mentionShouldFire(opts.mentionFrequency) && !alreadyMentions(final, brandName)) {
    final = appendMention(final, brandName, opts.platform);
    mentionInjected = true;
  }

  return { caption: final, mentionInjected, cached };
}

// -----------------------------------------------------------
// Prewarm
// -----------------------------------------------------------

/**
 * Default fan-out for `prewarmBrandVoice`. Haiku is happy well above this;
 * the limit is here so a 400-post campaign doesn't open 400 sockets at once
 * inside a serverless invocation. Tune with the `concurrency` argument.
 */
export const BRAND_VOICE_CONCURRENCY = 8;

/**
 * Populate the rewrite cache for a batch of posts, N at a time.
 *
 * WHY: `generateCampaignPosts` calls `applyBrandVoice` once per post from
 * inside a strictly sequential insert loop. Each call is a blocking Haiku
 * round trip, and the cache key includes the templateId — and generation
 * deliberately picks a *unique template per post* — so it missed on
 * essentially every post. That made generation time linear in posts × LLM
 * latency: ~3-6 minutes for 112 posts, well past any serverless time limit.
 *
 * Running the same calls up front with bounded concurrency turns that into
 * (posts / concurrency) × latency, and leaves the loop's own `applyBrandVoice`
 * call as a pure cache hit. The loop is untouched: same inputs, same cache
 * key, same result — only the wall-clock changes.
 *
 * Fails soft per item. A rewrite that errors here simply isn't cached, and
 * the loop pays for it the old way instead of the batch failing.
 */
export async function prewarmBrandVoice(
  items: ApplyBrandVoiceOpts[],
  concurrency: number = BRAND_VOICE_CONCURRENCY,
): Promise<{ warmed: number; failed: number; skippedEmpty: number }> {
  if (items.length === 0) {
    return { warmed: 0, failed: 0, skippedEmpty: 0 };
  }

  // Collapse duplicates up front — two posts sharing a template and caption
  // resolve to one cache key, so there's no point paying twice. Items with no
  // source caption are dropped: `applyBrandVoice` returns immediately for
  // those without calling the model, so counting them as "warmed" reports work
  // that never happened (a batch of 50 empty captions logged "50 warmed in
  // 1ms", which reads like a cache hit rather than a no-op).
  const byKey = new Map<string, ApplyBrandVoiceOpts>();
  let skippedEmpty = 0;
  for (const item of items) {
    if (!item.sourceCaption?.trim()) {
      skippedEmpty++;
      continue;
    }
    const key = buildCacheKey(item);
    if (!byKey.has(key) && cacheGet(key) === undefined) {
      byKey.set(key, item);
    }
  }
  const pending = Array.from(byKey.values());

  let warmed = 0;
  let failed = 0;
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < pending.length) {
      const item = pending[cursor++];
      if (!item) {
        return;
      }
      try {
        await applyBrandVoice(item);
        warmed++;
      } catch {
        // Cached on success only; a miss just means the loop pays for it.
        failed++;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, pending.length) }, () => worker()),
  );

  return { warmed, failed, skippedEmpty };
}
