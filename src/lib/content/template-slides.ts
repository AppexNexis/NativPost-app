/**
 * Template slide helpers — shared parser for a ContentTemplate's multi-slide
 * media (Slideshow / Carousel / Data Story).
 *
 * `content_template.thumbnailUrls` and `content_template.slideCaptions` are
 * both jsonb columns declared as `Record<string, string> | string[]`. Prod
 * rows come from Apify writers that upsert numeric-keyed records
 * (e.g. { "0": url, "1": url }); older rows may already be arrays. This
 * module normalizes both shapes to an ordered array so downstream consumers
 * (TemplateCard preview, Create page mediaSlots builder, editor script
 * hydration) can share one source of truth.
 */

export type TemplateSlideSource = Record<string, string> | string[] | null | undefined;

/**
 * Parse a jsonb `thumbnailUrls` / `slideCaptions` value into an ordered
 * string array. Numeric-keyed records are sorted by key so slide order
 * matches upload order. Empty / non-string entries are filtered out.
 */
export function parseTemplateSlides(input: TemplateSlideSource): string[] {
  if (!input) {
    return [];
  }
  if (Array.isArray(input)) {
    return input.filter((u): u is string => typeof u === 'string' && u.length > 0);
  }
  if (typeof input === 'object') {
    const keys = Object.keys(input);
    const allNumeric = keys.length > 0 && keys.every(k => /^\d+$/.test(k));
    const orderedKeys = allNumeric ? keys.sort((a, b) => Number(a) - Number(b)) : keys;
    return orderedKeys
      .map(k => (input as Record<string, string>)[k])
      .filter((u): u is string => typeof u === 'string' && u.length > 0);
  }
  return [];
}

/**
 * True when a template should be treated as multi-slide (slideshow-style)
 * for Remix / Editor purposes. Combines the contentType hint with an
 * actual slide-count check so mis-typed rows still work.
 */
export function isMultiSlideTemplate(
  contentType: string | null | undefined,
  slides: string[],
): boolean {
  if (slides.length > 1) return true;
  const ct = contentType || '';
  return ct === 'slideshow' || ct === 'carousel' || ct === 'data_story';
}
