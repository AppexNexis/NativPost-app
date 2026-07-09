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
const HOOK_CHAR_CAP = 60;
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
 * Human-readable "Why this was picked" text stored under
 * `enrichmentData.reasoning`. Kept short — the SwipeCard popover appends
 * engagement counts pulled from the template snapshot.
 */
export function buildReasoning(
  post: { angle_name?: string; is_remixed?: boolean },
  _template: { contentType: string; sourcePlatform?: string | null; sourceCreator?: string | null },
): string {
  // Blitz shows only the generated result — never the source template
  // platform, creator, or "Remixed From" attribution. Keep reasoning
  // to angle name only.
  const parts: string[] = [];
  if (post.angle_name) parts.push(`Angle: ${post.angle_name}.`);
  if (parts.length === 0) parts.push('Selected from your active content mix and audience angles.');
  return parts.join(' ');
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
