/**
 * Cloudinary delivery helpers for NativPost.
 *
 * These functions operate on full Cloudinary URLs (as stored in the DB)
 * and inject on-the-fly transformations for performance and quality.
 */

const CLOUDINARY_HOSTS = ['res.cloudinary.com', 'cloudinary.com'];

export type CloudinaryTransformOptions = {
  /** Crop mode, e.g. 'fill', 'limit', 'scale' */
  crop?: string;
  /** Target width */
  width?: number;
  /** Target height */
  height?: number;
  /** Apply automatic quality */
  qualityAuto?: boolean;
  /** Apply automatic format (WebM/MP4) */
  formatAuto?: boolean;
  /** Apply automatic video codec. Only valid for video resources. */
  codecAuto?: boolean;
  /** Poster frame offset in seconds. Only for video URLs. */
  startOffset?: number;
  /** Additional transformation string segments */
  extra?: string[];
};

/**
 * Returns true if the URL is a Cloudinary delivery URL.
 */
export function isCloudinaryUrl(url?: string | null): boolean {
  if (!url) {
    return false;
  }
  try {
    const host = new URL(url).hostname.toLowerCase();
    return CLOUDINARY_HOSTS.some(h => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/**
 * Returns true if the URL points to a Cloudinary video resource.
 */
export function isCloudinaryVideoUrl(url?: string | null): boolean {
  if (!isCloudinaryUrl(url)) {
    return false;
  }
  return url!.includes('/video/');
}

/**
 * Parse a Cloudinary URL into its base parts so we can inject transformations.
 *
 * Supported formats:
 *   https://res.cloudinary.com/<cloud>/video/upload/<version>/<public_id>.mp4
 *   https://res.cloudinary.com/<cloud>/image/upload/<version>/<public_id>.jpg
 *
 * Returns null for non-Cloudinary URLs.
 */
function parseCloudinaryUrl(
  url: string,
):
  | {
    protocol: string;
    host: string;
    cloudName: string;
    resourceType: 'video' | 'image';
    uploadSegment: string;
    versionAndPath: string;
  }
  | null {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 4) {
      return null;
    }

    const [cloudName, resourceType, uploadSegment, ...rest] = parts;
    if (!cloudName || !resourceType || uploadSegment !== 'upload') {
      return null;
    }
    if (resourceType !== 'video' && resourceType !== 'image') {
      return null;
    }

    return {
      protocol: parsed.protocol,
      host: parsed.host,
      cloudName,
      resourceType,
      uploadSegment,
      versionAndPath: rest.join('/'),
    };
  } catch {
    return null;
  }
}

function buildTransformString(
  options: CloudinaryTransformOptions,
  resourceType: 'video' | 'image',
): string {
  const segments: string[] = [];

  if (options.crop || options.width || options.height) {
    const crop = options.crop || 'limit';
    const dims: string[] = [`c_${crop}`];
    if (options.width) {
      dims.push(`w_${options.width}`);
    }
    if (options.height) {
      dims.push(`h_${options.height}`);
    }
    segments.push(dims.join(','));
  }

  if (resourceType === 'video' && options.startOffset !== undefined && options.startOffset >= 0) {
    segments.push(`so_${options.startOffset}`);
  }

  if (options.qualityAuto !== false) {
    segments.push('q_auto');
  }
  if (options.formatAuto !== false) {
    segments.push('f_auto');
  }
  if (resourceType === 'video' && options.codecAuto !== false) {
    segments.push('vc_auto');
  }

  if (options.extra?.length) {
    segments.push(...options.extra);
  }

  return segments.join(',');
}

/**
 * Build an optimized Cloudinary delivery URL from a full URL.
 *
 * Non-Cloudinary URLs are returned unchanged.
 */
export function getOptimizedUrl(
  url: string | null | undefined,
  options: CloudinaryTransformOptions = {},
): string {
  if (!url) {
    return '';
  }
  if (!isCloudinaryUrl(url)) {
    return url;
  }

  const parsed = parseCloudinaryUrl(url);
  if (!parsed) {
    return url;
  }

  const transform = buildTransformString(options, parsed.resourceType);
  const base = `${parsed.protocol}//${parsed.host}/${parsed.cloudName}/${parsed.resourceType}/${parsed.uploadSegment}`;
  if (!transform) {
    return `${base}/${parsed.versionAndPath}`;
  }
  return `${base}/${transform}/${parsed.versionAndPath}`;
}

/**
 * Build an optimized video URL suitable for inline preview playback.
 * Defaults: auto quality, auto format, auto codec.
 */
export function getOptimizedVideoUrl(
  url: string | null | undefined,
  options: Omit<CloudinaryTransformOptions, 'startOffset'> = {},
): string {
  if (!url) {
    return '';
  }
  if (!isCloudinaryUrl(url)) {
    return url;
  }
  return getOptimizedUrl(url, {
    qualityAuto: true,
    formatAuto: true,
    codecAuto: true,
    ...options,
  });
}

/**
 * Build an HD/4K optimized video URL for the detail/preview modal.
 * Crops to 9:16 vertical format at 1080 height by default.
 */
export function getHdVideoUrl(
  url: string | null | undefined,
  options: Omit<CloudinaryTransformOptions, 'startOffset' | 'crop'> = {},
): string {
  if (!url) {
    return '';
  }
  if (!isCloudinaryUrl(url)) {
    return url;
  }
  return getOptimizedUrl(url, {
    crop: 'fill',
    width: 608,
    height: 1080,
    qualityAuto: true,
    formatAuto: true,
    codecAuto: true,
    ...options,
  });
}

/**
 * Build a high-quality poster frame URL from a Cloudinary video URL.
 *
 * For video URLs, this extracts a single frame as a JPG image so it can be
 * used as an <img> src or <video> poster. For image URLs, it just optimizes.
 */
export function getVideoPosterUrl(
  url: string | null | undefined,
  options: Omit<CloudinaryTransformOptions, 'startOffset'> & { startOffset?: number } = {},
): string {
  if (!url) {
    return '';
  }
  if (!isCloudinaryUrl(url)) {
    return url;
  }

  // If the URL is already an image resource, optimize it directly.
  if (url.includes('/image/')) {
    return getOptimizedUrl(url, {
      qualityAuto: true,
      formatAuto: true,
      ...options,
    });
  }

  // For video URLs, force a JPG frame extraction so the result is an image,
  // not a one-frame video. f_auto on a video URL returns a video codec.
  return getOptimizedUrl(url, {
    crop: 'fill',
    width: options.width || 608,
    height: options.height || 1080,
    startOffset: options.startOffset ?? 0,
    qualityAuto: true,
    formatAuto: false,
    codecAuto: false,
    ...options,
    extra: [...(options.extra ?? []), 'f_jpg'],
  });
}

/**
 * Returns a playable media URL.
 * For Cloudinary videos, applies light optimization without cropping.
 * For external sources (YouTube, etc.), returns the original URL.
 */
export function getPlayableMediaUrl(url: string | null | undefined): string {
  return getOptimizedVideoUrl(url);
}
