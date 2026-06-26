/**
 * Shared helpers for translating user remix edits (from the RemixEditor)
 * into media-engine payloads.
 *
 * The RemixEditor emits:
 *   - structure.hook/body/cta text & duration
 *   - style (font, colors, alignment)
 *   - layout
 *   - mediaReplacements (background/slide/hook_video/b_roll)
 *   - audioTrack
 *
 * Most rendering engines do not yet accept every remix field directly, so
 * this module maps the high-level edits to the closest engine parameters.
 */

export interface RemixEdits {
  structure?: {
    hook?: { text?: string; duration?: number };
    body?: { text?: string; duration?: number };
    cta?: { text?: string; duration?: number };
  };
  style?: {
    fontFamily?: string;
    fontSize?: number;
    color?: string;
    backgroundColor?: string;
    align?: 'left' | 'center' | 'right';
    weight?: 'normal' | 'bold';
    italic?: boolean;
    underline?: boolean;
  };
  layout?: string;
  mediaReplacements?: Array<{
    id: string;
    slot: 'background' | 'slide' | 'hook_video' | 'b_roll';
    label: string;
    currentUrl: string;
    newUrl?: string;
    newPublicId?: string;
  }>;
  audioTrack?: {
    name: string;
    url: string;
    source: 'library' | 'upload' | 'original';
  };
}

export type ContentGenerator =
  | 'slideshow'
  | 'ugc_ad'
  | 'text_motion'
  | 'data_story'
  | 'carousel'
  | 'single_image'
  | 'scene'
  | 'ai_graphic';

/**
 * Extract the user-provided replacement media URLs for a given slot.
 */
export function getReplacementUrls(
  remixEdits: RemixEdits | null | undefined,
  slots?: Array<'background' | 'slide' | 'hook_video' | 'b_roll'>,
): string[] {
  if (!remixEdits?.mediaReplacements?.length) return [];
  return remixEdits.mediaReplacements
    .filter((r) => (!slots || slots.includes(r.slot)) && r.newUrl)
    .map((r) => r.newUrl!);
}

/**
 * Build a single caption string from hook/body/cta edits.
 */
function buildCaptionFromStructure(remixEdits: RemixEdits | null | undefined): string | undefined {
  const parts = [
    remixEdits?.structure?.hook?.text,
    remixEdits?.structure?.body?.text,
    remixEdits?.structure?.cta?.text,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

/**
 * Merge remix edits into a media-engine payload.
 *
 * The helper is intentionally non-destructive: if the user did not edit a
 * field, the original payload value is preserved.
 */
export function applyRemixEdits(
  payload: Record<string, unknown>,
  remixEdits: RemixEdits | null | undefined,
  generator: ContentGenerator,
): Record<string, unknown> {
  if (!remixEdits) return payload;

  const merged = { ...payload };

  // ── Media replacements ────────────────────────────────────────────────────
  const replacementUrls = getReplacementUrls(remixEdits);

  if (generator === 'slideshow' || generator === 'single_image' || generator === 'scene') {
    if (replacementUrls.length > 0) {
      merged.images = replacementUrls;
    }
  }

  if (generator === 'ugc_ad') {
    if (replacementUrls.length > 0) {
      merged.images = replacementUrls.slice(0, 4);
    }
  }

  if (generator === 'carousel') {
    // Carousel slides are explicit objects; media replacement is not yet
    // supported at the per-slide level here.
  }

  // ── Text overrides ────────────────────────────────────────────────────────
  const editedCaption = buildCaptionFromStructure(remixEdits);

  if (generator === 'slideshow' && editedCaption) {
    merged.caption = editedCaption;
  }

  if (generator === 'text_motion') {
    if (remixEdits.structure?.hook?.text) {
      merged.headline = remixEdits.structure.hook.text;
    }
    if (remixEdits.structure?.body?.text) {
      merged.subtext = remixEdits.structure.body.text;
    }
    if (remixEdits.structure?.cta?.text) {
      merged.cta = remixEdits.structure.cta.text;
    }
  }

  if (generator === 'ugc_ad') {
    if (remixEdits.structure?.hook?.text) merged.hook = remixEdits.structure.hook.text;
    if (remixEdits.structure?.body?.text) merged.problem = remixEdits.structure.body.text;
    if (remixEdits.structure?.cta?.text) merged.cta = remixEdits.structure.cta.text;
  }

  if (generator === 'data_story' && remixEdits.structure?.hook?.text) {
    merged.headline = remixEdits.structure.hook.text;
  }

  if (generator === 'single_image') {
    // For quote/announcement/stat cards, prefer hook text as the headline/quote.
    if (remixEdits.structure?.hook?.text) {
      if (merged.template === 'quote-card') {
        merged.quote = remixEdits.structure.hook.text;
      } else if (merged.template === 'announcement-card' || merged.template === 'stat-card') {
        merged.headline = remixEdits.structure.hook.text;
      }
    }
    if (remixEdits.structure?.body?.text) {
      if (merged.template === 'quote-card' && !merged.attribution) {
        merged.attribution = remixEdits.structure.body.text;
      } else if (merged.template === 'announcement-card') {
        merged.subtext = remixEdits.structure.body.text;
      }
    }
    if (remixEdits.structure?.cta?.text) {
      merged.cta = remixEdits.structure.cta.text;
    }
  }

  if (generator === 'scene' || generator === 'ai_graphic') {
    if (remixEdits.structure?.hook?.text) {
      merged.headline = remixEdits.structure.hook.text;
    }
    if (remixEdits.structure?.body?.text) {
      merged.subtext = remixEdits.structure.body.text;
    }
    if (remixEdits.structure?.cta?.text) {
      merged.cta = remixEdits.structure.cta.text;
    }
  }

  // ── Style / brand colors ──────────────────────────────────────────────────
  // The editor's style.color is text color; we do not have a universal engine
  // parameter for text color yet, so we only propagate layout hints and keep
  // the color fields for future engine support.
  if (remixEdits.layout) {
    merged.layout = remixEdits.layout;
  }

  return merged;
}

/**
 * Read remix edits stored in a content item's generationParams.
 */
export function getRemixEditsFromGenerationParams(
  generationParams: unknown,
): RemixEdits | undefined {
  if (!generationParams || typeof generationParams !== 'object') return undefined;
  const params = generationParams as Record<string, unknown>;
  return params.remixEdits as RemixEdits | undefined;
}
