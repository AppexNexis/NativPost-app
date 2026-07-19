/**
 * media-detect
 *
 * Shared URL classifier used by every Remotion composition that renders a
 * user-provided or template-provided background/hook/face slot.
 *
 * Rationale: Remotion `<Video>` silently renders a black frame when given an
 * image URL (no error, no console warning). Prior to centralizing this, each
 * composition had its own inconsistent regex — some checked only for
 * `.mp4|.mov|.webm`, missing Cloudinary URLs like
 * `.../video/upload/v123/asset` (no extension). The result: image URLs
 * getting fed to `<Video>` and video URLs (Cloudinary, no ext) getting fed
 * to `<Img>` — both render as broken/black frames.
 *
 * Detection rules (in order):
 *   1. Cloudinary transformer path — `/video/upload/` → video,
 *      `/image/upload/` → image. Highest signal available.
 *   2. File extension — `.mp4|.mov|.webm|.m4v` → video;
 *      `.jpg|.jpeg|.png|.webp|.gif|.avif` → image.
 *   3. Fallback → 'unknown'. Compositions should default to `<Img>` when
 *      unknown because Img gracefully handles most static formats and does
 *      not silently render black.
 */

export type MediaKind = 'image' | 'video' | 'unknown';

const VIDEO_URL_PATH_RE = /\/video\/upload\//i;
const IMAGE_URL_PATH_RE = /\/image\/upload\//i;
const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|mkv)(\?|#|$)/i;
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|avif|bmp|svg)(\?|#|$)/i;

export function detectMediaKind(url: string | undefined | null): MediaKind {
  if (!url) {
    return 'unknown';
  }
  // File extension is checked BEFORE the Cloudinary transformer path because
  // Cloudinary can serve extracted video frames via `/video/upload/.../foo.jpg`
  // — the path says "video" but the asset is a still image. Feeding that URL
  // to Remotion `<Video>` causes a silent black frame AND a memory-leak retry
  // storm (browser keeps trying to decode a jpg as video every loop cycle).
  // Extension is the stronger signal: a `.jpg` is always an image regardless
  // of transformer path.
  if (VIDEO_EXT_RE.test(url)) {
    return 'video';
  }
  if (IMAGE_EXT_RE.test(url)) {
    return 'image';
  }
  if (VIDEO_URL_PATH_RE.test(url)) {
    return 'video';
  }
  if (IMAGE_URL_PATH_RE.test(url)) {
    return 'image';
  }
  return 'unknown';
}

export function isVideoUrl(url: string | undefined | null): boolean {
  return detectMediaKind(url) === 'video';
}

export function isImageUrl(url: string | undefined | null): boolean {
  const kind = detectMediaKind(url);
  return kind === 'image' || kind === 'unknown';
}
