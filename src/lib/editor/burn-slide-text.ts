/**
 * Burn text overlays onto slide images for carousel publishing.
 *
 * Slideshow images from templates don't have baked-in text. The
 * GalleryPreview component renders text overlays via CSS in the browser,
 * but when publishing to social platforms (IG carousel, FB album, etc.)
 * the images arrive raw. This helper uses Cloudinary fetch + text overlay
 * transformations to burn the slide copy onto each image server-side.
 *
 * Cloudinary text overlay URL format (applied via fetch):
 *   /image/fetch/l_text:{font}_{size}:{encoded_text},{options}/{src_url}
 *
 * This works for ANY public image URL — Cloudinary fetches it, transforms
 * it, and serves the result. No pre-upload needed.
 */

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'nativpost';

/**
 * Cloudinary-safe text: encode, truncate, strip characters Cloudinary
 * can't handle in URL text overlays.
 */
function sanitizeCloudinaryText(text: string, maxLen = 120): string {
  return encodeURIComponent(
    text
      .replace(/[<>"']/g, '')      // strip XML/quote chars
      .replace(/\s+/g, ' ')         // collapse whitespace
      .trim()
      .slice(0, maxLen),
  );
}

/**
 * Build a Cloudinary fetch URL with a centered bottom text overlay.
 *
 * @param imageUrl - Any public image URL (Cloudinary will fetch it).
 * @param text     - The text to overlay on the image (max 120 chars).
 * @param opts     - Optional styling overrides.
 * @returns A Cloudinary URL with the text burned into the image.
 */
export function burnTextOnSlide(
  imageUrl: string,
  text: string | null | undefined,
  opts?: {
    fontSize?: number;
    color?: string;
    background?: string;
    fontWeight?: 'bold' | 'normal';
  },
): string {
  if (!text) return imageUrl;

  const fontSize = opts?.fontSize ?? 42;
  const color = opts?.color ?? 'FFFFFF';
  const fontWeight = opts?.fontWeight === 'bold' ? 'bold_' : '';

  // Cloudinary l_text: font_size:encoded_text
  // Using Arial as a universally-available font
  const encoded = sanitizeCloudinaryText(text);
  const textOverlay = `l_text:Arial_${fontWeight}${fontSize}:${encoded},co_rgb:${color},g_south,y_40`;

  // Also add a semi-transparent background strip for readability
  const bgOverlay = `bo_5px_solid_rgb:00000080,g_south,y_40`;

  return `https://res.cloudinary.com/${CLOUD_NAME}/image/fetch/${textOverlay}/${bgOverlay}/${encodeURIComponent(imageUrl)}`;
}

/**
 * Apply text burning to an array of slide URLs with their matching captions.
 *
 * @param slideUrls  - The raw slide image URLs.
 * @param slideCopy  - Per-slide caption text (same length as slideUrls, or shorter).
 * @param styleOpts  - Optional styling overrides.
 * @returns Array of Cloudinary URLs each with text burned in.
 */
export function burnTextOnSlides(
  slideUrls: string[],
  slideCopy: (string | null | undefined)[],
  styleOpts?: { fontSize?: number; color?: string; background?: string; fontWeight?: 'bold' | 'normal' },
): string[] {
  return slideUrls.map((url, i) => burnTextOnSlide(url, slideCopy[i], styleOpts));
}

/**
 * Extract slides from a slideshow content item's enrichment data.
 */
export function extractSlideUrls(
  enrichmentData: Record<string, unknown> | null | undefined,
): string[] {
  if (!enrichmentData) return [];

  const mediaSlots = enrichmentData.sourceMediaSlots as Record<string, unknown> | undefined;
  if (!mediaSlots?.slides || !Array.isArray(mediaSlots.slides)) return [];

  return mediaSlots.slides
    .map((s: unknown) => {
      if (typeof s === 'string') return s;
      if (s && typeof s === 'object') return (s as { url?: string }).url ?? null;
      return null;
    })
    .filter((u: string | null): u is string => typeof u === 'string' && u.length > 0);
}

/**
 * Extract per-slide captions from enrichment data for a slideshow.
 */
export function extractSlideCopy(
  enrichmentData: Record<string, unknown> | null | undefined,
): (string | null | undefined)[] {
  if (!enrichmentData) return [];

  // Try editorScript.slideCopy first (AI-generated per-slide text)
  const editorScript = enrichmentData.editorScript as Record<string, unknown> | undefined;
  if (editorScript?.slideCopy && Array.isArray(editorScript.slideCopy)) {
    return editorScript.slideCopy as (string | null | undefined)[];
  }

  // Fall back to sourceMediaSlots.slides[].caption (original platform captions)
  const mediaSlots = enrichmentData.sourceMediaSlots as Record<string, unknown> | undefined;
  if (mediaSlots?.slides && Array.isArray(mediaSlots.slides)) {
    return mediaSlots.slides.map((s: unknown) => {
      if (s && typeof s === 'object') return (s as { caption?: string }).caption ?? null;
      return null;
    });
  }

  return [];
}
