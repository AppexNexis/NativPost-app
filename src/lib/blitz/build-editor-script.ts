/**
 * buildEditorScript
 *
 * Maps an engine `CampaignPost` shape into the editor `script` field the
 * Remotion compositions read (`ContentEditScript` in src/types/v2.ts).
 *
 * The engine returns a monolithic `caption` — the compositions want
 * per-role fields (hookText / bodyText / ctaText / wallText / slideCopy).
 * We split the caption on blank lines / newlines and route the pieces
 * into the shape appropriate for the template's contentType.
 *
 * Text is length-capped so previews don't overflow the card and so
 * per-slide text stays readable:
 *   - slideshow / carousel     ≤ 80 chars / slide
 *   - wall_of_text             ≤ 220 chars (wallText)
 *   - all others               ≤ 60 char hook, ≤ 140 char body
 */

const SLIDE_CHAR_CAP = 80;
const WALL_CHAR_CAP = 220;
const HOOK_CHAR_CAP = 90;
const BODY_CHAR_CAP = 140;
const CTA_CHAR_CAP = 40;

function clip(s: string | undefined, cap: number): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  if (!t) return undefined;
  if (t.length <= cap) return t;
  // Prefer a whole word boundary near the cap.
  const slice = t.slice(0, cap);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > cap * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd();
}

function splitLines(caption: string | undefined): string[] {
  if (!caption) return [];
  return caption
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export type BuiltEditorScript = {
  hookText?: string;
  bodyText?: string;
  ctaText?: string;
  wallText?: string;
  slideCopy?: string[];
};

export function buildEditorScript(
  post: { caption: string; content_type?: string; template_id?: string },
  template: { contentType: string; slideCaptions?: Record<string, string> | string[] | null; thumbnailUrls?: Record<string, string> | string[] | null },
): BuiltEditorScript {
  const lines = splitLines(post.caption);
  const contentType = template.contentType;

  if (contentType === 'slideshow' || contentType === 'carousel' || contentType === 'data_story') {
    const templateSlides = parseSlideStrings(template.thumbnailUrls);
    const slideCount = Math.max(templateSlides.length, 1);
    const perSlideRaw = lines.length >= slideCount
      ? lines.slice(0, slideCount)
      : padWith(lines, slideCount, '');
    const slideCopy = perSlideRaw
      .map((s) => clip(s, SLIDE_CHAR_CAP))
      .map((s) => s ?? '')
      .filter((_, i) => i < slideCount);
    return {
      hookText: clip(lines[0], HOOK_CHAR_CAP),
      slideCopy,
    };
  }

  if (contentType === 'wall_of_text') {
    return {
      wallText: clip(post.caption, WALL_CHAR_CAP) || clip(lines.join(' '), WALL_CHAR_CAP),
    };
  }

  // Talking head / green screen / video hook / video_hook_demo / ugc / reel → 3-part
  return {
    hookText: clip(lines[0], HOOK_CHAR_CAP),
    bodyText: lines.length > 2
      ? clip(lines.slice(1, -1).join(' '), BODY_CHAR_CAP)
      : clip(lines[1], BODY_CHAR_CAP),
    ctaText: lines.length > 1 ? clip(lines[lines.length - 1], CTA_CHAR_CAP) : undefined,
  };
}

/**
 * Structured "Why This Content?" payload stored under
 * `enrichmentData.reasoning`. Consumed by the Blitz WhyPopover which
 * renders each field as its own section (title text, angle chip,
 * source-metric chips).
 */
export type BlitzReasoning = {
  whyThisContent: string;
  angleName: string | null;
  topicLabel: string | null;
  sourceMetrics: { views: number | null; likes: number | null; comments: number | null } | null;
  sourceCreator: string | null;
  sourcePlatform: string | null;
};

export function buildReasoning(
  post: { angle_name?: string; topic_label?: string; is_remixed?: boolean },
  template: {
    contentType: string;
    sourcePlatform?: string | null;
    sourceCreator?: string | null;
    viewCount?: number | null;
    likeCount?: number | null;
    commentCount?: number | null;
  },
): BlitzReasoning {
  const angleName = post.angle_name?.trim() || null;
  const topicLabel = post.topic_label?.trim() || null;
  const parts: string[] = [];
  if (topicLabel) parts.push(topicLabel + '.');
  else if (angleName) parts.push(`Angle: ${angleName}.`);
  else parts.push('Selected from your active content mix and audience angles.');
  if (template.sourcePlatform && template.sourceCreator) {
    parts.push(`Remixed from @${template.sourceCreator} on ${capitalize(template.sourcePlatform)}.`);
  }
  const hasMetrics = [template.viewCount, template.likeCount, template.commentCount].some((n) => typeof n === 'number' && n > 0);
  return {
    whyThisContent: parts.join(' '),
    angleName,
    topicLabel,
    sourceMetrics: hasMetrics
      ? {
          views: template.viewCount ?? null,
          likes: template.likeCount ?? null,
          comments: template.commentCount ?? null,
        }
      : null,
    sourceCreator: template.sourceCreator ?? null,
    sourcePlatform: template.sourcePlatform ?? null,
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Derive a short 3-5 word topic label for the Blitz "topic pill" from the
 * template's caption/hook/slideCaptions. Prefers strong, punchy phrases.
 * Returns null when nothing usable is available.
 */
export function deriveTopicLabel(template: {
  structure?: any;
  slideCaptions?: Record<string, string> | string[] | null;
  niches?: string[] | null;
  contentType?: string;
}): string | null {
  const candidates: string[] = [];
  // 1. structure.hooks (array of short phrases)
  const hooks = template.structure?.hooks;
  if (Array.isArray(hooks)) candidates.push(...hooks.filter((h): h is string => typeof h === 'string'));
  // 2. structure.caption first line
  const capLine = typeof template.structure?.caption === 'string' ? template.structure.caption.split(/\r?\n/)[0] : '';
  if (capLine) candidates.push(capLine);
  // 3. First slide caption
  const slides = parseSlideStrings(template.slideCaptions);
  if (slides[0]) candidates.push(slides[0]);
  // Pick the first candidate that yields a compact, cased phrase.
  for (const raw of candidates) {
    const label = toTopicLabel(raw);
    if (label) return label;
  }
  // 4. Fallback: titlecased first niche
  const niche = template.niches?.[0];
  if (niche) return toTitleCase(niche);
  return null;
}

function toTopicLabel(raw: string): string | null {
  if (!raw) return null;
  // Strip hashtags, mentions, urls, emojis.
  let s = raw
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[#@]\w+/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;
  // First sentence.
  s = (s.split(/[.!?]/)[0] || '').trim();
  if (!s) return null;
  const words = s.split(' ').filter(Boolean);
  if (words.length < 2) return null;
  // Cap at 5 words / 40 chars for a punchy pill.
  const trimmed = words.slice(0, 5).join(' ');
  const capped = trimmed.length > 40 ? trimmed.slice(0, 40).replace(/\s+\S*$/, '') : trimmed;
  return toTitleCase(capped);
}

function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => {
      if (!w) return w;
      // Preserve small words in the middle in lowercase for readability.
      const small = new Set(['and', 'or', 'the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'with']);
      if (i > 0 && small.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

// ── Helpers ──────────────────────────────────────────────────────────────

function parseSlideStrings(input: any): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.filter((u): u is string => typeof u === 'string' && u.length > 0);
  if (typeof input === 'object') {
    const keys = Object.keys(input);
    const allNumeric = keys.length > 0 && keys.every((k) => /^\d+$/.test(k));
    const orderedKeys = allNumeric ? keys.sort((a, b) => Number(a) - Number(b)) : keys;
    return orderedKeys
      .map((k) => (input as Record<string, string>)[k])
      .filter((u): u is string => typeof u === 'string' && u.length > 0);
  }
  return [];
}

function padWith<T>(arr: T[], targetLen: number, filler: T): T[] {
  if (arr.length >= targetLen) return arr;
  return [...arr, ...Array(targetLen - arr.length).fill(filler)];
}
