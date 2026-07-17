/**
 * applySetToSlots
 *
 * Swap template-derived media in a `sourceMediaSlots` shape with a user's
 * Media Set assets. Only invoked by Blitz for the safe-swap content types
 * (slideshow / carousel / wall_of_text, and the video types). Text overlays /
 * composition logic are untouched — only the raw source URLs change.
 *
 * Returns `{ slots, consumedPublicIds }`. `consumedPublicIds` MUST be logged
 * to `blitz_media_usage` after the post insert succeeds so the same asset is
 * not reused within the 90-day dedup window.
 *
 * Slideshow 4-slide invariant (per Blitz spec):
 *   - Every slideshow post has exactly 4 slides.
 *   - If the caller passes >=4 user images, use 4 user images and consume
 *     them (they will be excluded from future batches).
 *   - If the caller passes 3 user images AND a template with slides, use
 *     the 3 user images + 1 template slide to complete slot 4. Consume
 *     only the 3 user publicIds.
 *   - If the caller passes 0 user images but a template with slides, pad
 *     the template's slides to 4 (cycle its own thumbnails if fewer).
 *   - If neither user images nor template slides are available → throw
 *     InsufficientAssetsError; caller must skip slideshow.
 */

import type { SourceMediaSlots } from './build-source-media-slots';
import type { ResolvedSet } from './pick-default-set';

const SLIDESHOW_SWAP_TYPES = new Set(['slideshow', 'carousel', 'wall_of_text']);
const VIDEO_SWAP_TYPES = new Set([
  'talking_head',
  'video_hook',
  'video_hook_demo',
  'ugc',
  'green_screen',
  'scene',
  'reel',
]);

export const SLIDESHOW_TARGET_SLIDES = 4;

export type ApplyResult = {
  slots: SourceMediaSlots;
  consumedPublicIds: string[];
};

/**
 * Thrown by applySetToSlots when neither user media nor template media can
 * fill the required slot count. Callers (Phase 1 / Phase 2 loops in
 * campaign utils) MUST catch this and skip to the next template so users
 * never see duplicated slides or empty compositions.
 */
export class InsufficientAssetsError extends Error {
  readonly have: number;
  readonly need: number;
  readonly setId: string;

  constructor(setId: string, have: number, need: number) {
    super(`Set ${setId} has ${have} assets but ${need} slides needed`);
    this.name = 'InsufficientAssetsError';
    this.have = have;
    this.need = need;
    this.setId = setId;
  }
}

/**
 * Normalize a slides array to exactly SLIDESHOW_TARGET_SLIDES entries.
 * Truncates if longer, cycles if shorter, no-op if exactly the target.
 * Never returns duplicates when the source has >= target distinct entries.
 */
function normalizeSlideCount<T>(source: T[], target = SLIDESHOW_TARGET_SLIDES): T[] {
  if (source.length === 0) {
    return [];
  }
  if (source.length >= target) {
    return source.slice(0, target);
  }
  // pad by cycling
  const out: T[] = [];
  for (let i = 0; i < target; i += 1) {
    out.push(source[i % source.length]!);
  }
  return out;
}

export function applySetToSlots(
  slots: SourceMediaSlots,
  set: ResolvedSet | null,
  contentType: string,
  /**
   * Rotate into the asset pool by this many positions so consecutive posts
   * start on a different asset. Defaults to 0.
   */
  slideOffset: number = 0,
): ApplyResult {
  const consumedPublicIds: string[] = [];

  // No set (or empty) → normalize template-only slideshows to 4 slides,
  // otherwise return unchanged.
  if (!set || !set.assets || set.assets.length === 0) {
    if (contentType === 'slideshow' || contentType === 'carousel') {
      const templateSlides = slots.slides ?? [];
      if (templateSlides.length === 0) {
        throw new InsufficientAssetsError('no-set', 0, SLIDESHOW_TARGET_SLIDES);
      }
      return {
        slots: { ...slots, slides: normalizeSlideCount(templateSlides) },
        consumedPublicIds,
      };
    }
    return { slots, consumedPublicIds };
  }

  // ── Video content types (talking_head, video_hook, ugc, etc.) ──────────
  if (VIDEO_SWAP_TYPES.has(contentType)) {
    const videos = set.assets.filter(a => a.assetType === 'video');
    if (videos.length === 0) {
      // No user videos — leave template media in place.
      return { slots, consumedPublicIds };
    }
    const n = videos.length;
    const pick = (i: number) => videos[(i + slideOffset) % n]!;

    const next: SourceMediaSlots = { ...slots };
    let idx = 0;
    const remember = (a: { publicId: string }) => {
      if (!consumedPublicIds.includes(a.publicId)) {
        consumedPublicIds.push(a.publicId);
      }
    };

    if (slots.hookVideo !== undefined || contentType === 'video_hook' || contentType === 'video_hook_demo') {
      const asset = pick(idx++);
      next.hookVideo = { url: asset.url, assetType: 'video' as const };
      remember(asset);
    }
    if (slots.demoVideo !== undefined || contentType === 'video_hook_demo' || contentType === 'ugc' || contentType === 'talking_head') {
      const asset = pick(idx++);
      next.demoVideo = { url: asset.url, assetType: 'video' as const };
      remember(asset);
    }
    if (slots.background?.assetType === 'video' || contentType === 'green_screen' || contentType === 'scene' || contentType === 'reel') {
      const asset = pick(idx++);
      next.background = { url: asset.url, assetType: 'video' as const };
      remember(asset);
    }
    // talking_head extras: mirror hookVideo into faceVideo so the face
    // slot renders when no influencer is enabled. Do NOT count as a
    // second consumption — the asset is only "used" once.
    if (contentType === 'talking_head' && next.hookVideo) {
      next.faceVideo = { url: next.hookVideo.url, assetType: 'video' as const };
    }
    return { slots: next, consumedPublicIds };
  }

  if (!SLIDESHOW_SWAP_TYPES.has(contentType)) {
    return { slots, consumedPublicIds };
  }

  if (contentType === 'wall_of_text') {
    const images = set.assets.filter(a => a.assetType === 'image');
    const pool = images.length > 0 ? images : set.assets;
    const picked = pool[slideOffset % pool.length] || pool[0]!;
    consumedPublicIds.push(picked.publicId);
    return {
      slots: {
        ...slots,
        background: { url: picked.url, assetType: picked.assetType },
      },
      consumedPublicIds,
    };
  }

  // ── slideshow / carousel — enforce 4-slide invariant ─────────────────
  const imageAssets = set.assets.filter(a => a.assetType === 'image');
  const assets = imageAssets.length > 0 ? imageAssets : set.assets;
  const templateSlides = slots.slides ?? [];
  const target = SLIDESHOW_TARGET_SLIDES;

  // Case A: enough user images to fill all 4 slots.
  if (assets.length >= target) {
    const chosen = assets.slice(0, target); // consume first 4 (ordered)
    const nextSlides = chosen.map(a => ({ url: a.url, assetType: 'image' as const }));
    chosen.forEach(a => consumedPublicIds.push(a.publicId));
    return {
      slots: { ...slots, slides: nextSlides },
      consumedPublicIds,
    };
  }

  // Case B: partial user images — need template slides to complete.
  if (assets.length > 0 && templateSlides.length > 0) {
    const userSlides = assets.map(a => ({ url: a.url, assetType: 'image' as const }));
    assets.forEach(a => consumedPublicIds.push(a.publicId));
    // Fill remaining from template thumbnails, cycling if template has fewer.
    const remaining = target - userSlides.length;
    const templateFill: SourceMediaSlots['slides'] = [];
    for (let i = 0; i < remaining; i += 1) {
      const src = templateSlides[i % templateSlides.length]!;
      templateFill.push({ url: src.url, assetType: 'image' as const });
    }
    return {
      slots: { ...slots, slides: [...userSlides, ...templateFill] },
      consumedPublicIds,
    };
  }

  // Case C: no user images but template has slides → pad template to 4.
  if (templateSlides.length > 0) {
    return {
      slots: { ...slots, slides: normalizeSlideCount(templateSlides, target) },
      consumedPublicIds,
    };
  }

  // Case D: nothing to fill with → the batch planner must skip this type.
  throw new InsufficientAssetsError(set.id, assets.length, target);
}
