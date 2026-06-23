/**
 * libs/cloudinaryHelpers.ts
 *
 * Central URL builder for all Cloudinary delivery URLs used across
 * MediaLibraryPage, MediaPicker, MediaUploader, and any future components.
 *
 * Replaces:
 *   ucThumbnail()    → cldThumbnail()
 *   ucVideoSrc()     → cldVideoSrc()
 *   toPlayableVideoSrc() → cldVideoSrc()
 *   toThumbnailSrc() → cldThumbnail()
 *
 * All functions are pure URL builders — no network calls.
 */

const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;

// ---------------------------------------------------------------------------
// Image URLs
// ---------------------------------------------------------------------------

/**
 * AI-enhanced full delivery URL for images.
 * Applies: e_enhance (AI color/contrast fix), q_auto, f_auto, c_limit w_2000
 */
export function cldImageUrl(publicId: string): string {
  return `https://res.cloudinary.com/${CLOUD}/image/upload/e_enhance,q_auto,f_auto,c_limit,w_2000/${publicId}`;
}

/**
 * Square thumbnail for grid cards.
 * No AI enhancement — fast grid rendering.
 */
export function cldThumbnail(publicId: string, size = 400): string {
  return `https://res.cloudinary.com/${CLOUD}/image/upload/c_fill,w_${size},h_${size},q_auto,f_webp/${publicId}`;
}

/**
 * Aspect-ratio-preserving preview for the asset detail modal.
 */
export function cldPreview(publicId: string, width = 800): string {
  return `https://res.cloudinary.com/${CLOUD}/image/upload/c_limit,w_${width},q_auto,f_webp/${publicId}`;
}

// ---------------------------------------------------------------------------
// Video URLs
// ---------------------------------------------------------------------------

/**
 * Streamable video URL with auto quality and format.
 */
export function cldVideoSrc(publicId: string): string {
  return `https://res.cloudinary.com/${CLOUD}/video/upload/q_auto,f_auto/${publicId}`;
}

/**
 * Video poster/thumbnail — grabs frame at 1 second, crops to square.
 */
export function cldVideoThumbnail(publicId: string, size = 400): string {
  return `https://res.cloudinary.com/${CLOUD}/video/upload/so_1,c_fill,w_${size},h_${size},q_auto,f_jpg/${publicId}`;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isCloudinaryVideoPublicId(publicId: string): boolean {
  // Cloudinary video public_ids don't have image extensions.
  // We rely on the resourceType stored alongside the asset.
  // This helper is a fallback for cases where only publicId is available.
  return /\.(mp4|mov|webm|avi|mkv)$/i.test(publicId);
}

// ---------------------------------------------------------------------------
// Unsplash → Cloudinary ingestion URL
// Used when a user picks an Unsplash image to save permanently to their library.
// We upload it to Cloudinary by URL so it becomes a proper org asset.
// ---------------------------------------------------------------------------
export function buildUnsplashIngestUrl(unsplashRawUrl: string, width = 2000): string {
  return `${unsplashRawUrl}&w=${width}&fit=crop&q=90&auto=format`;
}