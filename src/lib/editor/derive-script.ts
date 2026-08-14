/**
 * One derivation of overlay text (hook / body / CTA) from a content item.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Four surfaces used to carry their own copy of "read `enrichmentData.editorScript`,
 * and if it looks empty, split `item.caption` on newlines instead":
 *
 *   - components/editor/EditorContext.tsx      (deriveScriptFromCaption)
 *   - components/content/detail/ContentPreview.tsx
 *   - components/content/detail/ContentDetailClient.tsx  (TikTok review modal)
 *   - components/content/caption-spec.ts       (getOverlayTextParts)
 *
 * Every one of them tested emptiness with `script.hookText || script.bodyText ||
 * script.ctaText`, which cannot tell "this item was never authored in the editor"
 * from "the author deliberately cleared every field". So clearing hook, body and
 * CTA in the editor did not clear the overlay: each surface fell through to
 * `item.caption` and redrew the copy the user had just deleted — and reopening
 * the editor re-derived the script from that same caption, resurrecting the text
 * for good.
 *
 * `isAuthoredScript` draws the distinction on key PRESENCE, not truthiness. The
 * editor writes `hookText: ''` when you empty the field, so the key exists and
 * the empty value is honoured. Legacy rows (no editorScript, or `{}`) still get
 * the caption split.
 *
 * The split also applies the renderer's own caps (TEXT_LIMITS). A caption's last
 * line is not a call to action — it is the last paragraph of a caption — so
 * routing it into `ctaText` verbatim is what produced the 90-plus-character
 * "CTAs" that overflow the card. `deriveScriptFromCaption` keeps only its final
 * sentence, within the CTA budget the compiled MP4 enforces.
 */

import { TEXT_LIMITS, truncateWithEllipsis } from '@/components/editor/compositions/text-limits';
import type { ContentEditScript } from '@/types/v2';

/** The text-bearing keys. Presence of ANY of these marks a script as authored. */
const SCRIPT_TEXT_KEYS = ['hookText', 'bodyText', 'ctaText', 'wallText', 'slideCopy'] as const;

type ScriptLike = Record<string, unknown> | null | undefined;

/**
 * True when this script was written by the editor — including when the author
 * emptied every field. Distinguishes a deliberate blank from a missing script.
 */
export function isAuthoredScript(script: ScriptLike): boolean {
  if (!script || typeof script !== 'object') {
    return false;
  }
  return SCRIPT_TEXT_KEYS.some(k => k in script);
}

/** True when the script carries no visible copy at all. */
export function isBlankScript(script: ScriptLike): boolean {
  if (!script || typeof script !== 'object') {
    return true;
  }
  const s = script as ContentEditScript;
  if ((s.hookText ?? '').trim() || (s.bodyText ?? '').trim() || (s.ctaText ?? '').trim() || (s.wallText ?? '').trim()) {
    return false;
  }
  return !(Array.isArray(s.slideCopy) && s.slideCopy.some(entry => (typeof entry === 'string' ? entry : entry?.text ?? '').trim()));
}

/**
 * Reduce a line to something that reads as a call to action: its LAST sentence,
 * inside the CTA budget. "…isn't a luxury. It's the baseline for brands that
 * want to be taken seriously" → "It's the baseline for brands…".
 */
export function tightenCta(raw: string | null | undefined): string {
  const text = (raw ?? '').trim();
  if (!text) {
    return '';
  }
  if (text.length <= TEXT_LIMITS.cta) {
    return text;
  }
  // Split on sentence ends, keeping the terminator with its sentence. The
  // closing beat is the CTA; everything before it is body copy.
  const sentences = text.match(/[^.!?]+[.!?]*/g)?.map(s => s.trim()).filter(Boolean) ?? [text];
  const last = sentences[sentences.length - 1] ?? text;
  return truncateWithEllipsis(last, TEXT_LIMITS.cta);
}

/**
 * Split a monolithic caption into hook / body / CTA, capped to what the
 * renderer will fit. Used ONLY when an item has no authored script.
 */
export function deriveScriptFromCaption(caption?: string | null): ContentEditScript {
  if (!caption || typeof caption !== 'string') {
    return {};
  }
  const lines = caption.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    return {};
  }
  if (lines.length === 1) {
    return { hookText: truncateWithEllipsis(lines[0], TEXT_LIMITS.hook) };
  }
  if (lines.length === 2) {
    return {
      hookText: truncateWithEllipsis(lines[0], TEXT_LIMITS.hook),
      bodyText: truncateWithEllipsis(lines[1], TEXT_LIMITS.body),
    };
  }
  return {
    hookText: truncateWithEllipsis(lines[0], TEXT_LIMITS.hook),
    bodyText: truncateWithEllipsis(lines.slice(1, -1).join('\n'), TEXT_LIMITS.body),
    ctaText: tightenCta(lines[lines.length - 1]),
  };
}

/**
 * The overlay script for an item: the authored one when it exists (blank
 * included), the caption split otherwise.
 */
export function resolveItemScript(item: {
  caption?: string | null;
  enrichmentData?: unknown;
} | null | undefined): ContentEditScript {
  if (!item) {
    return {};
  }
  const script = ((item.enrichmentData ?? {}) as Record<string, unknown>).editorScript as ScriptLike;
  if (isAuthoredScript(script)) {
    return script as ContentEditScript;
  }
  return deriveScriptFromCaption(item.caption);
}

/**
 * Rebuild the post's caption from its overlay script, so the copy the editor
 * shows is the copy that gets published. Returns '' for a script the author
 * has emptied — which is what clears a stale caption instead of letting it
 * outlive the text it came from.
 */
export function composeCaptionFromScript(script: ScriptLike): string {
  if (!script || typeof script !== 'object') {
    return '';
  }
  const s = script as ContentEditScript;
  const parts = [s.hookText, s.bodyText, s.ctaText]
    .map(p => (p ?? '').trim())
    .filter(Boolean);
  if (parts.length > 0) {
    return parts.join('\n\n');
  }
  const wall = (s.wallText ?? '').trim();
  if (wall) {
    return wall;
  }
  if (Array.isArray(s.slideCopy)) {
    const slides = s.slideCopy
      .map(entry => (typeof entry === 'string' ? entry : entry?.text ?? '').trim())
      .filter(Boolean);
    if (slides.length > 0) {
      return slides.join('\n\n');
    }
  }
  return '';
}
