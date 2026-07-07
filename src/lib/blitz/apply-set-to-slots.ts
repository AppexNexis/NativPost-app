/**
 * applySetToSlots
 *
 * Swap template-derived media in a `sourceMediaSlots` shape with a user's
 * Media Set assets. Only invoked by Blitz for the safe-swap content types
 * (slideshow / carousel / wall_of_text). Text overlays / composition logic
 * are untouched — only the raw source URLs change.
 *
 * Behavior per content type:
 *   - slideshow / carousel → replace slides[] entries 1:1 by index. If the
 *     Set has fewer assets than the template had slides, keep the tail of
 *     the template slides (better than leaving blank frames).
 *   - wall_of_text → replace background with the Set's first image asset.
 *   - anything else → return slots unchanged.
 */

import type { SourceMediaSlots } from './build-source-media-slots';
import type { ResolvedSet } from './pick-default-set';

const SAFE_SWAP_TYPES = new Set(['slideshow', 'carousel', 'wall_of_text']);

export function applySetToSlots(
  slots: SourceMediaSlots,
  set: ResolvedSet,
  contentType: string,
): SourceMediaSlots {
  if (!SAFE_SWAP_TYPES.has(contentType)) return slots;
  if (!set.assets || set.assets.length === 0) return slots;

  if (contentType === 'wall_of_text') {
    const firstImage = set.assets.find((a) => a.assetType === 'image') || set.assets[0];
    if (!firstImage) return slots;
    return {
      ...slots,
      background: { url: firstImage.url, assetType: firstImage.assetType },
    };
  }

  // slideshow / carousel
  const templateSlides = slots.slides || [];
  const nextSlides = templateSlides.length > 0
    ? templateSlides.map((slide, i) => {
      const swap = set.assets[i];
      if (!swap) return slide;
      return { url: swap.url, assetType: 'image' as const };
    })
    : set.assets.map((a) => ({ url: a.url, assetType: 'image' as const }));

  return {
    ...slots,
    slides: nextSlides,
  };
}
