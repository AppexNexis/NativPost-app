/**
 * social-post-url — read-side helper for building/looking up the public
 * permalink to a post that NativPost published on a supported platform.
 *
 * Prefers the stored `permalink` (set inline at publish time). If missing,
 * reconstructs from `platformPostId` + platform-specific identifiers.
 *
 * Handles: x, youtube, facebook, instagram, tiktok, linkedin, linkedin_page.
 */

export type SupportedPlatform = 'twitter' | 'youtube' | 'facebook' | 'instagram';

export type PostUrlInput = {
  platform: string;
  platformPostId?: string | null;
  permalink?: string | null;
  platformUsername?: string | null;
  platformUserId?: string | null;
};

export type PostUrlResult = {
  url: string | null;
  isFallback: boolean;
};

/**
 * Return the best available URL to open the post.
 *   - `url: null` means no viable URL could be built.
 *   - `isFallback: true` means we could not build a permalink to the exact
 *     post and are opening a related surface instead (e.g. an IG profile page).
 */
export function getPostUrl(input: PostUrlInput): PostUrlResult {
  if (input.permalink && input.permalink.startsWith('http')) {
    return { url: input.permalink, isFallback: false };
  }

  const { platform, platformPostId, platformUsername } = input;
  const handle = platformUsername?.replace(/^@/, '').trim() || undefined;

  switch (platform) {
    case 'twitter': {
      if (!platformPostId || !handle) return { url: null, isFallback: false };
      return {
        url: `https://x.com/${handle}/status/${platformPostId}`,
        isFallback: false,
      };
    }

    case 'youtube': {
      if (!platformPostId) return { url: null, isFallback: false };
      return {
        url: `https://www.youtube.com/watch?v=${platformPostId}`,
        isFallback: false,
      };
    }

    case 'facebook': {
      if (!platformPostId) return { url: null, isFallback: false };
      const underscoreIdx = platformPostId.indexOf('_');
      if (underscoreIdx === -1) {
        // Bare numeric — photo post. Requires the page id, which is
        // stored in platformUserId for FB accounts.
        if (!input.platformUserId) return { url: null, isFallback: false };
        return {
          url: `https://www.facebook.com/${input.platformUserId}/photos/${platformPostId}`,
          isFallback: false,
        };
      }
      const pageId = platformPostId.slice(0, underscoreIdx);
      const suffix = platformPostId.slice(underscoreIdx + 1);
      return {
        url: `https://www.facebook.com/${pageId}/posts/${suffix}`,
        isFallback: false,
      };
    }

    case 'instagram': {
      // No permalink available and no way to reconstruct one from just the
      // media id without a Graph call. Fall back to the connected profile.
      if (handle) {
        return {
          url: `https://www.instagram.com/${handle}/`,
          isFallback: true,
        };
      }
      return { url: null, isFallback: false };
    }

    case 'tiktok': {
      // TikTok API returns a publish_id, not the actual video ID.
      // Fall back to the creator profile when username is available.
      if (handle) {
        return {
          url: `https://www.tiktok.com/@${handle}`,
          isFallback: true,
        };
      }
      return { url: null, isFallback: false };
    }

    case 'linkedin':
    case 'linkedin_page': {
      // LinkedIn post URLs use the activity ID (platformPostId).
      // Format: https://www.linkedin.com/feed/update/urn:li:activity:{activityId}
      if (!platformPostId) return { url: null, isFallback: false };
      const activityId = platformPostId.replace('urn:li:activity:', '');
      return {
        url: `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}`,
        isFallback: false,
      };
    }

    default:
      return { url: null, isFallback: false };
  }
}

/**
 * Per-platform display metadata used by the "Published to" panel.
 */
export const PLATFORM_META: Record<
  string,
  { label: string; brandColor: string }
> = {
  twitter: { label: 'X', brandColor: '#000000' },
  youtube: { label: 'YouTube', brandColor: '#FF0000' },
  facebook: { label: 'Facebook', brandColor: '#1877F2' },
  instagram: { label: 'Instagram', brandColor: '#E4405F' },
  linkedin: { label: 'LinkedIn', brandColor: '#0A66C2' },
  linkedin_page: { label: 'LinkedIn Page', brandColor: '#0A66C2' },
  tiktok: { label: 'TikTok', brandColor: '#000000' },
  threads: { label: 'Threads', brandColor: '#000000' },
  pinterest: { label: 'Pinterest', brandColor: '#BD081C' },
  snapchat: { label: 'Snapchat', brandColor: '#FFFC00' },
  whatsapp: { label: 'WhatsApp', brandColor: '#25D366' },
};
