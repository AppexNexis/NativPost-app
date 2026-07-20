/**
 * Cloudinary image enhancement — applies quality + sharpening transforms.
 *
 * Wraps any public image URL in a Cloudinary fetch + enhancement pipeline:
 *   e_enhance        → AI auto-enhance (color, lighting, detail)
 *   e_sharpen:80     → subtle sharpening
 *   q_auto:best      → auto quality, best setting
 *
 * This makes seed slides (TikTok, Pexels, Instagram) look crisp on
 * both the detail page and in published carousels.
 */

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME || 'nativpost';

/**
 * Wrap an image URL with Cloudinary fetch + enhancement transforms.
 *
 * Works for ANY public URL — Cloudinary downloads the image, applies
 * transforms, and serves the result. No pre-upload needed.
 *
 * For URLs already on Cloudinary, the upload path is used instead
 * (avoids redundant fetch).
 */
export function enhanceImage(url: string, opts?: { quality?: string; sharpen?: number }): string {
  if (!url) return url;

  const qual = opts?.quality ?? 'auto:best';
  const sharpen = opts?.sharpen ?? 80;

  // Detect if URL is already on Cloudinary (upload path)
  // e.g. https://res.cloudinary.com/nativpost/image/upload/v1234/...
  const cdnPattern = `res.cloudinary.com/${CLOUD_NAME}`;
  if (url.includes(cdnPattern)) {
    // Inject transforms after /image/upload/
    return url.replace(
      `/image/upload/`,
      `/image/upload/e_enhance/e_sharpen:${sharpen}/q_${qual}/`,
    );
  }

  // External URL — use fetch + transforms
  const encodedUrl = encodeURIComponent(url);
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/fetch/e_enhance/e_sharpen:${sharpen}/q_${qual}/${encodedUrl}`;
}
