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
};

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
// -----------------------------------------------------------
const CACHE_MAX = 500;
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
  const suffix = usesHandle ? ` — @${brandName}` : ` — ${brandName}`;
  const trimmed = caption.replace(/\s+$/g, '');
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

Rewrite this caption in the brand voice above. Keep it roughly the same length. Preserve the hook. Do not add hashtags. Do not add emojis unless the tone is playful or bold. Do not restate the brand name at the end — that will be appended separately if needed. Return ONLY the rewritten caption, no quotes, no preamble.

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
      console.warn('[applyBrandVoice] rewrite failed, using source:', err);
    }
  }

  let final = rewritten || source;
  final = stripForbidden(final, forbidden);

  // Brand-name mention roll — only fires when we have a brand name AND
  // the caption doesn't already mention it (avoids double stamps).
  let mentionInjected = false;
  if (brandName && mentionShouldFire(opts.mentionFrequency) && !alreadyMentions(final, brandName)) {
    final = appendMention(final, brandName, opts.platform);
    mentionInjected = true;
  }

  return { caption: final, mentionInjected, cached };
}
