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
  /** Rotate into the asset pool by this many positions so consecutive posts
   *  start on a different image. Defaults to 0 (original behaviour). */
  slideOffset: number = 0,
): SourceMediaSlots {
  if (!SAFE_SWAP_TYPES.has(contentType)) return slots;
  if (!set.assets || set.assets.length === 0) return slots;

  if (contentType === 'wall_of_text') {
    const images = set.assets.filter((a) => a.assetType === 'image');
    const pool = images.length > 0 ? images : set.assets;
    const picked = pool[slideOffset % pool.length] || pool[0]!;
    return {
      ...slots,
      background: { url: picked.url, assetType: picked.assetType },
    };
  }

  // slideshow / carousel — rotate through asset pool so each post leads with
  // a different image. Wraps around so the offset is always in bounds.
  const assets = set.assets;
  const n = assets.length;

  const templateSlides = slots.slides || [];
  const nextSlides = templateSlides.length > 0
    ? templateSlides.map((slide, i) => {
      const swap = assets[(i + slideOffset) % n];
      if (!swap) return slide;
      return { url: swap.url, assetType: 'image' as const };
    })
    : assets.map((_, i) => {
      const asset = assets[(i + slideOffset) % n]!;
      return { url: asset.url, assetType: 'image' as const };
    });

  return {
    ...slots,
    slides: nextSlides,
  };
}
