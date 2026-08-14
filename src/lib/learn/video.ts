/**
 * Resolves a guide's `video.src` to a playable URL.
 *
 * Guide videos are 20-30 MB each. They are deliberately NOT committed to the
 * repo — they live in Cloudinary, which the app already uses for all other
 * media. A guide therefore stores a Cloudinary **public id**
 * (`nativpost/learn/guide-01-get-started`) and this resolves it at render time,
 * so the same content files work against any cloud.
 *
 * An absolute URL is passed through untouched, so a guide can point at an
 * external host without a code change.
 *
 * Upload the videos with `scripts/upload-learn-videos.ts`.
 */

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

function isAbsolute(src: string): boolean {
  return /^https?:\/\//i.test(src) || src.startsWith('/');
}

/** Playable video URL, or null when Cloudinary isn't configured. */
export function resolveVideoSrc(src: string | undefined): string | null {
  if (!src) {
    return null;
  }
  if (isAbsolute(src)) {
    return src;
  }
  if (!CLOUD_NAME) {
    return null;
  }
  // f_auto/q_auto lets Cloudinary pick the codec and quality per client.
  return `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/f_auto,q_auto/${src}.mp4`;
}

/**
 * Poster frame. Falls back to Cloudinary's generated first frame of the video
 * itself, so a guide doesn't need a separate poster asset to look right.
 */
export function resolveVideoPoster(video: { src: string; poster?: string } | undefined): string | null {
  if (!video) {
    return null;
  }
  if (video.poster) {
    return isAbsolute(video.poster)
      ? video.poster
      : CLOUD_NAME
        ? `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/f_auto,q_auto/${video.poster}.jpg`
        : null;
  }
  if (isAbsolute(video.src) || !CLOUD_NAME) {
    return null;
  }
  // so_2 = seek two seconds in; frame zero of these guides is a title fade.
  return `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/so_2,f_auto,q_auto,w_800/${video.src}.jpg`;
}
