/**
 * NativPost Social Publishing Service
 *
 * Supports: text, single image, carousel, and video posts.
 * Platforms: Facebook, Instagram, LinkedIn, LinkedIn Page,
 *            Twitter/X, TikTok, YouTube, Threads, Pinterest.
 */

import { Buffer } from 'node:buffer';
import { publishToTwitter } from './twitter-publisher';
import { publishToSnapchat } from './snapchat-publisher';

export type PublishResult = {
  success: boolean;
  platformPostId?: string;
  error?: string;
};

async function fetchMediaBuffer(
  url: string,
): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return null;
    }
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    return { buffer, contentType };
  } catch {
    return null;
  }
}

// Add this helper at the top of social-publish.ts
function toPublicImageUrl(url: string): string {
  // Uploadcare URLs: append image transformation to ensure proper content-type
  // ucarecdn.com/UUID/ → ucarecdn.com/UUID/-/format/jpeg/
  if (url.includes('ucarecdn.com')) {
    const base = url.endsWith('/') ? url : `${url}/`;
    return `${base}-/format/jpeg/-/quality/smart/`;
  }
  return url;
}

// ============================================================
// FACEBOOK
// ============================================================

export async function publishToFacebook(
  accessToken: string,
  pageId: string,
  caption: string,
  imageUrls: string[] = [],
  videoUrl?: string,
): Promise<PublishResult> {
  try {
    if (videoUrl) {
      const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_url: videoUrl, description: caption, access_token: accessToken }),
      });
      const data = await res.json();
      if (data.id) {
        return { success: true, platformPostId: data.id };
      }
      return { success: false, error: data.error?.message || 'Facebook video post failed' };
    }

    if (imageUrls.length === 0) {
      const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: caption, access_token: accessToken }),
      });
      const data = await res.json();
      if (data.id) {
        return { success: true, platformPostId: data.id };
      }
      return { success: false, error: data.error?.message || 'Facebook text post failed' };
    }

    if (imageUrls.length === 1) {
      const imageUrl = imageUrls[0];
      if (!imageUrl) {
        return { success: false, error: 'Facebook: image URL is missing' };
      }
      const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: toPublicImageUrl(imageUrl), caption, access_token: accessToken }),
      });
      const data = await res.json();
      if (data.id) {
        return { success: true, platformPostId: data.id };
      }
      return { success: false, error: data.error?.message || 'Facebook image post failed' };
    }

    const photoIds: string[] = [];
    for (const url of imageUrls) {
      const transformedUrl = toPublicImageUrl(url);
      const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: transformedUrl, published: false, access_token: accessToken }),
      });
      const data = await res.json();
      console.log(`[Facebook] Photo upload for ${transformedUrl}:`, JSON.stringify(data));
      if (data.id) {
        photoIds.push(data.id);
      } else {
        console.error(`[Facebook] Failed to upload photo: ${data.error?.message}`);
      }
    }

    if (photoIds.length === 0) {
      return { success: false, error: 'Facebook carousel: all uploads failed' };
    }

    const feedRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: caption,
        attached_media: photoIds.map(id => ({ media_fbid: id })),
        access_token: accessToken,
      }),
    });
    const feedData = await feedRes.json();
    if (feedData.id) {
      return { success: true, platformPostId: feedData.id };
    }
    return { success: false, error: feedData.error?.message || 'Facebook carousel post failed' };
  } catch (err) {
    return { success: false, error: `Facebook error: ${err}` };
  }
}

// ============================================================
// INSTAGRAM
// ============================================================

export async function publishToInstagram(
  accessToken: string,
  igUserId: string,
  caption: string,
  imageUrls: string[] = [],
  videoUrl?: string,
): Promise<PublishResult> {
  try {
    if (videoUrl) {
      const containerRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'REELS',
          video_url: videoUrl,
          caption,
          share_to_feed: true,
          access_token: accessToken,
        }),
      });
      const containerData = await containerRes.json();
      if (!containerData.id) {
        return { success: false, error: containerData.error?.message || 'IG Reel container failed' };
      }

      const creationId = containerData.id;
      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const statusRes = await fetch(
          `https://graph.facebook.com/v21.0/${creationId}?fields=status_code&access_token=${accessToken}`,
        );
        const statusData = await statusRes.json();
        if (statusData.status_code === 'FINISHED') {
          break;
        }
        if (statusData.status_code === 'ERROR') {
          return { success: false, error: 'IG Reel processing failed' };
        }
      }

      const publishRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: creationId, access_token: accessToken }),
      });
      const publishData = await publishRes.json();
      if (publishData.id) {
        return { success: true, platformPostId: publishData.id };
      }
      return { success: false, error: publishData.error?.message || 'IG Reel publish failed' };
    }

    if (imageUrls.length === 0) {
      return { success: false, error: 'Instagram requires at least one image or a video' };
    }

    if (imageUrls.length === 1) {
      const imageUrl = imageUrls[0];
      if (!imageUrl) {
        return { success: false, error: 'Instagram: image URL is missing' };
      }
      const containerRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: toPublicImageUrl(imageUrl), caption, access_token: accessToken }),
      });
      const containerData = await containerRes.json();
      if (!containerData.id) {
        return { success: false, error: containerData.error?.message || 'IG container failed' };
      }

      // Wait for single image to finish processing
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const statusRes = await fetch(
          `https://graph.facebook.com/v21.0/${containerData.id}?fields=status_code&access_token=${accessToken}`,
        );
        const statusData = await statusRes.json();
        if (statusData.status_code === 'FINISHED') {
          break;
        }
        if (statusData.status_code === 'ERROR') {
          return { success: false, error: 'IG image processing failed' };
        }
      }

      const publishRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: containerData.id, access_token: accessToken }),
      });
      const publishData = await publishRes.json();
      if (publishData.id) {
        return { success: true, platformPostId: publishData.id };
      }
      return { success: false, error: publishData.error?.message || 'IG publish failed' };
    }

    // ── Carousel ──
    const childIds: string[] = [];
    for (const url of imageUrls.slice(0, 10)) {
      const childRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: toPublicImageUrl(url), is_carousel_item: true, access_token: accessToken }),
      });
      const childData = await childRes.json();
      console.log(`[Instagram] Child container for ${url}:`, JSON.stringify(childData));

      if (!childData.id) {
        console.error(`[Instagram] Child container failed:`, childData.error?.message);
        continue;
      }

      // Wait for Instagram to finish processing each image before adding to carousel
      let ready = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const statusRes = await fetch(
          `https://graph.facebook.com/v21.0/${childData.id}?fields=status_code&access_token=${accessToken}`,
        );
        const statusData = await statusRes.json();
        console.log(`[Instagram] Child ${childData.id} status attempt ${attempt + 1}:`, statusData.status_code);

        if (statusData.status_code === 'FINISHED') {
          ready = true;
          break;
        }
        if (statusData.status_code === 'ERROR') {
          console.error(`[Instagram] Child container errored: ${childData.id}`);
          break;
        }
      }

      if (ready) {
        childIds.push(childData.id);
      } else {
        console.error(`[Instagram] Child container not ready after polling: ${childData.id}`);
      }
    }

    if (childIds.length < 2) {
      return { success: false, error: `Instagram carousel needs at least 2 images. Got ${childIds.length}.` };
    }

    const carouselRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ media_type: 'CAROUSEL', children: childIds, caption, access_token: accessToken }),
    });
    const carouselData = await carouselRes.json();
    console.log(`[Instagram] Carousel container response:`, JSON.stringify(carouselData));

    if (!carouselData.id) {
      return { success: false, error: carouselData.error?.message || 'IG carousel container failed' };
    }

    // Wait for carousel container to be ready before publishing
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const statusRes = await fetch(
        `https://graph.facebook.com/v21.0/${carouselData.id}?fields=status_code&access_token=${accessToken}`,
      );
      const statusData = await statusRes.json();
      console.log(`[Instagram] Carousel container status attempt ${attempt + 1}:`, statusData.status_code);
      if (statusData.status_code === 'FINISHED') {
        break;
      }
      if (statusData.status_code === 'ERROR') {
        return { success: false, error: 'IG carousel container processing failed' };
      }
    }

    const publishRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: carouselData.id, access_token: accessToken }),
    });
    const publishData = await publishRes.json();
    console.log(`[Instagram] Publish response:`, JSON.stringify(publishData));

    if (publishData.id) {
      return { success: true, platformPostId: publishData.id };
    }
    return { success: false, error: publishData.error?.message || 'IG carousel publish failed' };
  } catch (err) {
    return { success: false, error: `Instagram error: ${err}` };
  }
}
// ============================================================
// LINKEDIN — personal profile
// ============================================================

async function uploadImageToLinkedIn(accessToken: string, authorUrn: string, imageUrl: string): Promise<string | null> {
  try {
    const registerRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: authorUrn,
          serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
        },
      }),
    });
    const registerData = await registerRes.json();
    const uploadUrl = registerData?.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
    const assetUrn = registerData?.value?.asset;
    if (!uploadUrl || !assetUrn) {
      return null;
    }

    const media = await fetchMediaBuffer(imageUrl);
    if (!media) {
      return null;
    }

    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': media.contentType },
      body: media.buffer,
    });
    return (uploadRes.ok || uploadRes.status === 201) ? assetUrn as string : null;
  } catch (err) {
    console.error('[LinkedIn] uploadImageToLinkedIn error:', err);
    return null;
  }
}

async function uploadVideoToLinkedIn(accessToken: string, authorUrn: string, videoUrl: string): Promise<string | null> {
  try {
    const registerRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-video'],
          owner: authorUrn,
          serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
        },
      }),
    });
    const registerData = await registerRes.json();
    const uploadUrl = registerData?.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
    const assetUrn = registerData?.value?.asset;
    if (!uploadUrl || !assetUrn) {
      return null;
    }

    const media = await fetchMediaBuffer(videoUrl);
    if (!media) {
      return null;
    }

    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'video/mp4' },
      body: media.buffer,
    });
    return (uploadRes.ok || uploadRes.status === 201) ? assetUrn as string : null;
  } catch (err) {
    console.error('[LinkedIn] uploadVideoToLinkedIn error:', err);
    return null;
  }
}

async function postToLinkedIn(
  accessToken: string,
  author: string,
  caption: string,
  assetUrns: string[],
  mediaCategory: 'NONE' | 'IMAGE' | 'VIDEO',
  videoAssetUrn?: string,
): Promise<PublishResult> {
  const postBody = {
    author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: caption },
        shareMediaCategory: mediaCategory,
        ...(mediaCategory === 'VIDEO' && videoAssetUrn && {
          media: [{ status: 'READY', media: videoAssetUrn }],
        }),
        ...(mediaCategory === 'IMAGE' && assetUrns.length > 0 && {
          media: assetUrns.map(urn => ({ status: 'READY', media: urn })),
        }),
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };

  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(postBody),
  });
  const data = await res.json();
  if (data.id) {
    return { success: true, platformPostId: data.id };
  }
  console.error('[LinkedIn] Post failed:', JSON.stringify(data));
  return { success: false, error: data.message || 'LinkedIn publish failed' };
}

export async function publishToLinkedIn(
  accessToken: string,
  authorUrn: string,
  caption: string,
  imageUrls: string[] = [],
  videoUrl?: string,
): Promise<PublishResult> {
  try {
    const author = authorUrn.startsWith('urn:li:') ? authorUrn : `urn:li:person:${authorUrn}`;

    if (videoUrl) {
      const assetUrn = await uploadVideoToLinkedIn(accessToken, author, videoUrl);
      if (!assetUrn) {
        console.warn('[LinkedIn] Video upload failed — falling back to text-only');
      } else {
        return postToLinkedIn(accessToken, author, caption, [], 'VIDEO', assetUrn);
      }
    }

    const assetUrns: string[] = [];
    for (const url of imageUrls) {
      const urn = await uploadImageToLinkedIn(accessToken, author, url);
      if (urn) {
        assetUrns.push(urn);
      }
    }

    return postToLinkedIn(accessToken, author, caption, assetUrns, assetUrns.length > 0 ? 'IMAGE' : 'NONE');
  } catch (err) {
    return { success: false, error: `LinkedIn error: ${err}` };
  }
}

// ============================================================
// LINKEDIN PAGE — organization account
// ============================================================

export async function publishToLinkedInPage(
  accessToken: string,
  orgUrn: string,
  caption: string,
  imageUrls: string[] = [],
  videoUrl?: string,
): Promise<PublishResult> {
  try {
    const author = orgUrn.startsWith('urn:li:') ? orgUrn : `urn:li:organization:${orgUrn}`;

    if (videoUrl) {
      const assetUrn = await uploadVideoToLinkedIn(accessToken, author, videoUrl);
      if (assetUrn) {
        return postToLinkedIn(accessToken, author, caption, [], 'VIDEO', assetUrn);
      }
      console.warn('[LinkedIn Page] Video upload failed — falling back to text-only');
    }

    const assetUrns: string[] = [];
    for (const url of imageUrls) {
      const urn = await uploadImageToLinkedIn(accessToken, author, url);
      if (urn) {
        assetUrns.push(urn);
      }
    }

    return postToLinkedIn(accessToken, author, caption, assetUrns, assetUrns.length > 0 ? 'IMAGE' : 'NONE');
  } catch (err) {
    return { success: false, error: `LinkedIn Page error: ${err}` };
  }
}


// ============================================================
// TWITTER / X  — OAuth 2.0 for tweets, OAuth 1.0a for media
// ============================================================



// ============================================================
// TIKTOK
// ============================================================

/**
 * Refresh a TikTok access token using the stored refresh token.
 * TikTok access tokens expire after 24 hours (unaudited) or up to
 * 30 days (audited apps). Refresh tokens are valid for 365 days.
 */
async function refreshTikTokToken(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    console.error('[TikTok] Missing TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET for token refresh');
    return null;
  }

  try {
    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.access_token) {
      console.error('[TikTok] Token refresh failed:', JSON.stringify(data));
      return null;
    }

    console.log('[TikTok] Token refreshed successfully');
    return {
      accessToken: data.access_token,
      // TikTok may rotate the refresh token — keep the old one if absent
      refreshToken: data.refresh_token || refreshToken,
    };
  } catch (err) {
    console.error('[TikTok] Token refresh error:', err);
    return null;
  }
}

/**
 * Fetch TikTok creator info — required by Direct Post API guidelines before
 * every publish attempt. Returns null on failure, or 'auth_error' string
 * when the token is expired so the caller can attempt a refresh.
 */
async function getTikTokCreatorInfo(accessToken: string): Promise<{
  creatorAvatarUrl: string;
  creatorNickname: string;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number;
} | 'auth_error' | null> {
  try {
    const res = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({}),
    });

    // 401 = token expired — signal the caller to attempt refresh
    if (res.status === 401) {
      console.log('[TikTok] creator_info returned 401 — token expired');
      return 'auth_error';
    }

    const data = await res.json();

    // TikTok sometimes returns 200 with an auth error in the body
    const errCode = data.error?.code || '';
    if (errCode === 'access_token_invalid' || errCode === 'ok' === false) {
      console.log('[TikTok] creator_info auth error in body:', errCode);
      return 'auth_error';
    }

    if (!data.data) {
      console.error('[TikTok] creator_info failed:', JSON.stringify(data));
      return null;
    }

    return {
      creatorAvatarUrl: data.data.creator_avatar_url || '',
      creatorNickname: data.data.creator_nickname || '',
      privacyLevelOptions: data.data.privacy_level_options || ['SELF_ONLY'],
      commentDisabled: data.data.comment_disabled || false,
      duetDisabled: data.data.duet_disabled || false,
      stitchDisabled: data.data.stitch_disabled || false,
      maxVideoPostDurationSec: data.data.max_video_post_duration_sec || 300,
    };
  } catch (err) {
    console.error('[TikTok] creator_info error:', err);
    return null;
  }
}

export async function publishToTikTok(
  accessToken: string,
  caption: string,
  videoUrl?: string,
  refreshToken?: string,
  onTokenRefresh?: (newAccessToken: string, newRefreshToken: string) => Promise<void>,
  // User-confirmed settings from the TikTok publish modal
  tiktokSettings?: {
    title?: string;
    privacyLevel?: string;
    allowComment?: boolean;
    allowDuet?: boolean;
    allowStitch?: boolean;
    brandOrganicToggle?: boolean;
    brandContentToggle?: boolean;
  },
): Promise<PublishResult> {
  if (!videoUrl) {
    return { success: false, error: 'TikTok requires a video. Create a video post first.' };
  }

  try {
    // Step 1: Fetch creator info — required before every publish attempt.
    // If the token is expired and we have a refresh token, refresh and retry once.
    let token = accessToken;
    let creatorInfoResult = await getTikTokCreatorInfo(token);

    if (creatorInfoResult === 'auth_error') {
      if (!refreshToken) {
        return {
          success: false,
          error: 'TikTok session expired. Please reconnect your TikTok account in Connections.',
        };
      }

      console.log('[TikTok] Access token expired, refreshing...');
      const refreshed = await refreshTikTokToken(refreshToken);

      if (!refreshed) {
        return {
          success: false,
          error: 'TikTok session expired and could not be refreshed. Please reconnect your TikTok account in Connections.',
        };
      }

      // Persist the new tokens in the database
      if (onTokenRefresh) {
        await onTokenRefresh(refreshed.accessToken, refreshed.refreshToken);
      }

      token = refreshed.accessToken;
      console.log('[TikTok] Token refreshed, retrying creator_info...');
      creatorInfoResult = await getTikTokCreatorInfo(token);
    }

    if (!creatorInfoResult || creatorInfoResult === 'auth_error') {
      return {
        success: false,
        error: 'Could not verify TikTok account. Please reconnect your TikTok account in Connections.',
      };
    }

    const creatorInfo = creatorInfoResult;

    // Step 2: Resolve playable video URL (Uploadcare CDN URLs need /video.mp4 suffix)
    const playableUrl = /\.(?:mp4|mov|webm)(?:[/?#]|$)/i.test(videoUrl)
      ? videoUrl
      : `${videoUrl.endsWith('/') ? videoUrl : `${videoUrl}/`}video.mp4`;

    // Step 3: Proxy through app.nativpost.com — TikTok PULL_FROM_URL requires the
    // video URL to belong to a domain verified in TikTok's developer portal.
    // Uploadcare's CDN (ucarecdn.com) is not our domain and cannot be verified.
    // nativpost.com IS verified, and as a verified base domain it covers all
    // subdomains including app.nativpost.com per TikTok's ownership rules.
    // The proxy route streams the file directly without any redirect (required).
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.nativpost.com';
    const tiktokVideoUrl = `${appUrl}/api/media/proxy?url=${encodeURIComponent(playableUrl)}`;

    // Step 4: Resolve privacy level — use user selection from modal if provided,
    // otherwise fall back to SELF_ONLY (unaudited apps only get SELF_ONLY anyway).
    const privacyLevel = tiktokSettings?.privacyLevel
      || (creatorInfo.privacyLevelOptions.includes('SELF_ONLY')
        ? 'SELF_ONLY'
        : (creatorInfo.privacyLevelOptions[0] ?? 'SELF_ONLY'));

    // Step 5: Initiate the Direct Post upload.
    // All fields below are required by TikTok's integration guidelines.
    const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title:                (tiktokSettings?.title || caption).slice(0, 2200),
          privacy_level:        privacyLevel,
          disable_comment:      tiktokSettings?.allowComment === true ? false : creatorInfo.commentDisabled,
          disable_duet:         tiktokSettings?.allowDuet    === true ? false : creatorInfo.duetDisabled,
          disable_stitch:       tiktokSettings?.allowStitch  === true ? false : creatorInfo.stitchDisabled,
          brand_organic_toggle: tiktokSettings?.brandOrganicToggle ?? false,
          brand_content_toggle: tiktokSettings?.brandContentToggle ?? false,
        },
        source_info: {
          source:    'PULL_FROM_URL',
          video_url: tiktokVideoUrl,
        },
      }),
    });

    const initData = await initRes.json() as {
      data?: { publish_id?: string };
      error?: { code?: string; message?: string };
    };

    // TikTok returns unaudited_client_can_only_post_to_private_accounts when the
    // app hasn't been audited yet. The post still goes through as SELF_ONLY (private).
    // Treat this as a success — check for publish_id even when there's an error code.
    const publishId = initData.data?.publish_id;
    const errCode   = initData.error?.code   || '';
    const errMsg    = initData.error?.message || '';

    const isUnauditedWarning = errCode === 'unaudited_client_can_only_post_to_private_accounts';

    if (!publishId && !isUnauditedWarning) {
      console.error('[TikTok] Init failed:', JSON.stringify(initData));

      if (errCode === 'spam_risk_too_many_posts' || errMsg.includes('cap')) {
        return { success: false, error: 'TikTok posting limit reached for today. Please try again tomorrow.' };
      }
      if (errCode === 'access_token_invalid' || initRes.status === 401) {
        return { success: false, error: 'TikTok session expired. Please reconnect your TikTok account in Connections.' };
      }

      return {
        success: false,
        error: errMsg || errCode || 'TikTok upload failed. Please try again.',
      };
    }

    if (isUnauditedWarning) {
      console.log('[TikTok] Unaudited app — post submitted as private (SELF_ONLY). publish_id:', publishId || 'pending');
    } else {
      console.log(`[TikTok] Published (privacy: ${privacyLevel}), publish_id: ${publishId}`);
    }

    if (privacyLevel === 'SELF_ONLY') {
      console.log('[TikTok] Post is private (SELF_ONLY) — user can change visibility on TikTok manually.');
    }

    return { success: true, platformPostId: publishId || 'tiktok-pending' };
  } catch (err) {
    return { success: false, error: `TikTok error: ${err}` };
  }
}

// ============================================================
// YOUTUBE — video only
//
// Google OAuth tokens expire after 1 hour. When a 401/auth error
// is received, the token is refreshed automatically using the
// stored refresh token and the upload is retried once.
// Google only sends a new refresh_token occasionally — the old
// one is kept as fallback if absent from the refresh response.
// ============================================================

async function refreshGoogleToken(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[YouTube] Token refresh failed:', err);
      return null;
    }

    const data = await res.json() as { access_token: string; refresh_token?: string };
    return {
      accessToken: data.access_token,
      // Google only returns a new refresh_token occasionally — keep the old one if absent
      refreshToken: data.refresh_token || refreshToken,
    };
  } catch (err) {
    console.error('[YouTube] Token refresh error:', err);
    return null;
  }
}

export async function publishToYouTube(
  accessToken: string,
  caption: string,
  videoUrl?: string,
  refreshToken?: string,
  onTokenRefresh?: (newAccessToken: string, newRefreshToken: string) => Promise<void>,
  title?: string,
  thumbnailUrl?: string,
): Promise<PublishResult> {
  if (!videoUrl) {
    return { success: false, error: 'YouTube requires a video. Create a video post first.' };
  }

  const result = await _uploadToYouTube(accessToken, caption, videoUrl, title, thumbnailUrl);

  // Auth error — refresh token and retry once
  if (!result.success && result.error?.includes('authentication') && refreshToken) {
    console.log('[YouTube] Access token expired, refreshing...');
    const refreshed = await refreshGoogleToken(refreshToken);

    if (!refreshed) {
      return {
        success: false,
        error: 'YouTube token expired and could not be refreshed. Please reconnect your YouTube account.',
      };
    }

    if (onTokenRefresh) {
      await onTokenRefresh(refreshed.accessToken, refreshed.refreshToken);
    }

    console.log('[YouTube] Token refreshed, retrying upload...');
    return _uploadToYouTube(refreshed.accessToken, caption, videoUrl, title, thumbnailUrl);
  }

  return result;
}

async function _uploadToYouTube(
  accessToken: string,
  caption: string,
  videoUrl: string,
  title?: string,
  thumbnailUrl?: string,
): Promise<PublishResult> {
  try {
    // Resolve playable URL — bare Uploadcare CDN URLs need /video.mp4 appended
    const playableUrl = /\.(?:mp4|mov|webm)(?:[/?#]|$)/i.test(videoUrl)
      ? videoUrl
      : `${videoUrl.endsWith('/') ? videoUrl : `${videoUrl}/`}video.mp4`;

    // HEAD request to get content metadata without downloading the file
    const headRes = await fetch(playableUrl, { method: 'HEAD' });
    const contentLength = headRes.headers.get('content-length');
    const contentType = headRes.headers.get('content-type') || 'video/mp4';

    if (!headRes.ok) {
      return { success: false, error: 'Could not access video file for YouTube upload.' };
    }

    // Step 1: Initiate a resumable upload session
    const metaRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': contentType,
          ...(contentLength ? { 'X-Upload-Content-Length': contentLength } : {}),
        },
        body: JSON.stringify({
          snippet: {
            // Use the explicit title if set by the user; fall back to first line of caption
            title: (title ?? caption.split('\n')[0] ?? caption).slice(0, 100),
            description: caption,
            categoryId: '22', // People & Blogs
          },
          status: {
            privacyStatus: 'public',
            selfDeclaredMadeForKids: false,
          },
        }),
      },
    );

    if (!metaRes.ok) {
      const errText = await metaRes.text();
      console.error('[YouTube] Resumable session failed:', errText);

      try {
        const errJson = JSON.parse(errText);
        const reason = errJson?.error?.errors?.[0]?.reason;
        const message = errJson?.error?.message;

        if (reason === 'forbidden') {
          return { success: false, error: 'YouTube upload forbidden. Ensure the channel is verified and has upload permissions.' };
        }
        if (reason === 'uploadLimitExceeded') {
          return { success: false, error: 'YouTube daily upload limit reached. Try again tomorrow.' };
        }
        // Surface auth errors so the caller can attempt a token refresh
        if (message?.includes('authentication') || message?.includes('credentials') || metaRes.status === 401) {
          return { success: false, error: `YouTube: ${message || 'Request had invalid authentication credentials.'}` };
        }
        if (message) {
          return { success: false, error: `YouTube: ${message}` };
        }
      } catch {
        // JSON parse failed — fall through
      }

      return { success: false, error: `YouTube metadata upload failed (${metaRes.status}).` };
    }

    const resumableUrl = metaRes.headers.get('location');
    if (!resumableUrl) {
      return { success: false, error: 'YouTube did not return a resumable upload URL.' };
    }

    // Step 2: Stream video from CDN directly to YouTube — avoids buffering in memory
    const videoRes = await fetch(playableUrl);
    if (!videoRes.ok || !videoRes.body) {
      return { success: false, error: 'Failed to fetch video from CDN for upload.' };
    }

    const uploadRes = await fetch(resumableUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': contentType,
        ...(contentLength ? { 'Content-Length': contentLength } : {}),
      },
      // // @ts-expect-error — Node 18+ supports ReadableStream as body
      body: videoRes.body,
      // @ts-expect-error — Required to enable streaming in Node fetch
      duplex: 'half',
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error('[YouTube] Video upload failed:', errText);
      return { success: false, error: `YouTube video upload failed (${uploadRes.status}).` };
    }

    const uploadData = await uploadRes.json() as { id?: string };
    if (uploadData.id) {
      const videoId = uploadData.id;
      console.log(`[YouTube] Uploaded: https://www.youtube.com/watch?v=${videoId}`);

      // Upload thumbnail if provided — fire-and-forget, never blocks the publish result
      if (thumbnailUrl) {
        const uploadThumbnail = async (attempt: number): Promise<void> => {
          try {
            const thumbRes = await fetch(thumbnailUrl);
            if (!thumbRes.ok) {
              console.warn(`[YouTube] Could not fetch thumbnail (${thumbRes.status})`);
              return;
            }
            const thumbBuffer = await thumbRes.arrayBuffer();
            const thumbContentType = thumbRes.headers.get('content-type') || 'image/jpeg';

            const setRes = await fetch(
              `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}&uploadType=media`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': thumbContentType,
                },
                body: thumbBuffer,
              },
            );

            if (setRes.ok) {
              console.log(`[YouTube] Thumbnail set for ${videoId}`);
            } else {
              const errBody = await setRes.text();
              // Video may still be processing — retry with increasing delays
              if (attempt <= 3 && (setRes.status === 400 || setRes.status === 503 || errBody.includes('processing') || errBody.includes('not yet'))) {
                const delayMs = attempt * 15_000; // 15s, 30s, 45s
                console.warn(`[YouTube] Thumbnail attempt ${attempt} failed (video processing) — retrying in ${delayMs / 1000}s...`);
                await new Promise(r => setTimeout(r, delayMs));
                return uploadThumbnail(attempt + 1);
              }
              console.warn(`[YouTube] Thumbnail failed (${setRes.status}):`, errBody);
            }
          } catch (thumbErr) {
            console.warn('[YouTube] Thumbnail error (non-fatal):', thumbErr);
          }
        };
        uploadThumbnail(1).catch(() => null);
      }

      return { success: true, platformPostId: videoId };
    }

    return { success: false, error: 'YouTube upload completed but no video ID was returned.' };
  } catch (err) {
    console.error('[YouTube] Upload error:', err);
    return { success: false, error: `YouTube error: ${String(err)}` };
  }
}

// ============================================================
// THREADS
// ============================================================

export async function publishToThreads(
  accessToken: string,
  userId: string,
  caption: string,
  imageUrls: string[] = [],
  videoUrl?: string,
): Promise<PublishResult> {
  try {
    let mediaType = 'TEXT';
    let mediaUrl: string | undefined;

    if (videoUrl) {
      mediaType = 'VIDEO';
      mediaUrl = videoUrl;
    } else if (imageUrls.length === 1) {
      mediaType = 'IMAGE';
      mediaUrl = imageUrls[0];
    } else if (imageUrls.length > 1) {
      const childIds: string[] = [];
      for (const url of imageUrls.slice(0, 10)) {
        const childRes = await fetch(`https://graph.threads.net/v1.0/${userId}/threads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            media_type: 'IMAGE',
            image_url: url,
            is_carousel_item: true,
            access_token: accessToken,
          }),
        });
        const childData = await childRes.json();
        if (childData.id) {
          childIds.push(childData.id);
        }
      }

      if (childIds.length < 2) {
        return { success: false, error: 'Threads carousel needs at least 2 images.' };
      }

      const carouselRes = await fetch(`https://graph.threads.net/v1.0/${userId}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'CAROUSEL',
          children: childIds,
          text: caption,
          access_token: accessToken,
        }),
      });
      const carouselData = await carouselRes.json();
      if (!carouselData.id) {
        return { success: false, error: carouselData.error?.message || 'Threads carousel failed' };
      }

      const publishRes = await fetch(`https://graph.threads.net/v1.0/${userId}/threads_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: carouselData.id, access_token: accessToken }),
      });
      const publishData = await publishRes.json();
      if (publishData.id) {
        return { success: true, platformPostId: publishData.id };
      }
      return { success: false, error: publishData.error?.message || 'Threads carousel publish failed' };
    }

    const containerBody: Record<string, string> = {
      media_type: mediaType,
      text: caption,
      access_token: accessToken,
    };
    if (mediaUrl && mediaType === 'IMAGE') {
      containerBody.image_url = mediaUrl;
    }
    if (mediaUrl && mediaType === 'VIDEO') {
      containerBody.video_url = mediaUrl;
    }

    const containerRes = await fetch(`https://graph.threads.net/v1.0/${userId}/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(containerBody),
    });
    const containerData = await containerRes.json();
    if (!containerData.id) {
      return { success: false, error: containerData.error?.message || 'Threads container failed' };
    }

    const publishRes = await fetch(`https://graph.threads.net/v1.0/${userId}/threads_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: containerData.id, access_token: accessToken }),
    });
    const publishData = await publishRes.json();
    if (publishData.id) {
      return { success: true, platformPostId: publishData.id };
    }
    return { success: false, error: publishData.error?.message || 'Threads publish failed' };
  } catch (err) {
    return { success: false, error: `Threads error: ${err}` };
  }
}

// ============================================================
// SNAPCHAT
// ============================================================



// export async function publishToSnapchat(
//   accessToken: string,
//   imageUrls: string[] = [],
//   videoUrl?: string,
// ): Promise<PublishResult> {
//   try {
//     if (imageUrls.length === 0 && !videoUrl) {
//       return {
//         success: false,
//         error: 'Snapchat requires an image or video.',
//       };
//     }

//     const isVideo = !!videoUrl;
//     const mediaUrl = videoUrl || imageUrls[0];

//     // Step 1: Fetch the media as a buffer
//     const mediaRes = await fetch(mediaUrl!);
//     if (!mediaRes.ok) {
//       return { success: false, error: 'Snapchat: could not fetch media file' };
//     }
//     const mediaBuffer = await mediaRes.arrayBuffer();
//     const contentType = mediaRes.headers.get('content-type')
//       || (isVideo ? 'video/mp4' : 'image/jpeg');

//     // Step 2: Upload media to Story Studio
//     const uploadRes = await fetch('https://storage.snapchat.com/v1/media', {
//       method: 'POST',
//       headers: {
//         Authorization: `Bearer ${accessToken}`,
//         'Content-Type': contentType,
//       },
//       body: mediaBuffer,
//     });

//     if (!uploadRes.ok) {
//       const errText = await uploadRes.text();
//       console.error('[Snapchat] Media upload failed:', errText);
//       return { success: false, error: `Snapchat media upload failed (${uploadRes.status})` };
//     }

//     const uploadData = await uploadRes.json();
//     const mediaId = uploadData.media_id || uploadData.id;

//     if (!mediaId) {
//       console.error('[Snapchat] No media ID returned:', JSON.stringify(uploadData));
//       return { success: false, error: 'Snapchat: media upload returned no ID' };
//     }

//     console.log('[Snapchat] Media uploaded, media_id:', mediaId);

//     // Step 3: Publish as a Story Snap
//     const storyRes = await fetch('https://kit.snapchat.com/v1/story/snaps', {
//       method: 'POST',
//       headers: {
//         Authorization: `Bearer ${accessToken}`,
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify({
//         media: {
//           media_id: mediaId,
//           media_type: isVideo ? 'VIDEO' : 'IMAGE',
//         },
//         caption: '',   // Story Studio API doesn't support captions on Snaps
//       }),
//     });

//     if (!storyRes.ok) {
//       const errText = await storyRes.text();
//       console.error('[Snapchat] Story publish failed:', errText);
//       return { success: false, error: `Snapchat story publish failed (${storyRes.status})` };
//     }

//     const storyData = await storyRes.json();
//     const snapId = storyData.snap_id || storyData.id;

//     console.log('[Snapchat] Story published, snap_id:', snapId);
//     return { success: true, platformPostId: snapId || 'snapchat-published' };

//   } catch (err) {
//     return { success: false, error: `Snapchat error: ${err}` };
//   }
// }


// ============================================================
// PINTEREST
// ============================================================

export async function publishToPinterest(
  accessToken: string,
  caption: string,
  imageUrls: string[] = [],
  videoUrl?: string,
  refreshToken?: string,
  onTokenRefresh?: (newAccessToken: string, newRefreshToken: string) => Promise<void>,
): Promise<PublishResult> {
  try {
    // Pinterest does not support text-only pins
    if (imageUrls.length === 0 && !videoUrl) {
      return {
        success: false,
        error: 'Pinterest requires an image or video. Text-only posts cannot be published to Pinterest.',
      };
    }

    let token = accessToken;

    // Step 1: Fetch boards — if 401, refresh token and retry once
    let boardsRes = await fetch('https://api.pinterest.com/v5/boards?page_size=25', {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Handle expired token
    if (boardsRes.status === 401 && refreshToken) {
      console.log('[Pinterest] Token expired, refreshing...');
      const refreshed = await refreshPinterestToken(refreshToken);
      if (refreshed) {
        token = refreshed.accessToken;
        if (onTokenRefresh) {
          await onTokenRefresh(refreshed.accessToken, refreshed.refreshToken);
        }
        // Retry with new token
        boardsRes = await fetch('https://api.pinterest.com/v5/boards?page_size=25', {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    }

    if (!boardsRes.ok) {
      const errText = await boardsRes.text();
      console.error('[Pinterest] Boards fetch failed:', boardsRes.status, errText);
      if (boardsRes.status === 401) {
        return { success: false, error: 'Pinterest session expired. Please reconnect your Pinterest account in Connections.' };
      }
      return { success: false, error: `Pinterest API error (${boardsRes.status}). Please try again.` };
    }

    const boardsData = await boardsRes.json();
    console.log('[Pinterest] Boards response:', JSON.stringify(boardsData).slice(0, 400));

    const boards = boardsData.items ?? boardsData.data ?? [];
    const boardId = boards[0]?.id;

    if (!boardId) {
      return {
        success: false,
        error: 'No Pinterest boards found. Please create a board on Pinterest first, then try again.',
      };
    }

    return publishPinToBoard(token, boardId, caption, imageUrls, videoUrl);
  } catch (err) {
    console.error('[Pinterest] Publish error:', err);
    return { success: false, error: `Pinterest error: ${err}` };
  }
}

async function refreshPinterestToken(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const clientId = process.env.PINTEREST_CLIENT_ID;
  const clientSecret = process.env.PINTEREST_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return null;
  }

  try {
    const res = await fetch('https://api.pinterest.com/v5/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    });

    if (!res.ok) {
      console.error('[Pinterest] Token refresh failed:', res.status, await res.text());
      return null;
    }

    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
    };
  } catch (err) {
    console.error('[Pinterest] Token refresh error:', err);
    return null;
  }
}

// async function publishPinToBoard(
//   accessToken: string,
//   boardId: string,
//   caption: string,
//   imageUrls: string[],
//   videoUrl?: string,
// ): Promise<PublishResult> {
//   const pinBody: Record<string, unknown> = {
//     title: caption.slice(0, 100),
//     // description: caption,
//     description: caption.slice(0, 800),  // ← add this truncation
//     board_id: boardId,
//   };

//   if (imageUrls.length > 0) {
//     pinBody.media_source = { source_type: 'image_url', url: imageUrls[0] };
//   } else if (videoUrl) {
//     pinBody.media_source = { source_type: 'image_url', url: videoUrl };
//   }

//   const pinRes = await fetch('https://api.pinterest.com/v5/pins', {
//     method: 'POST',
//     headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
//     body: JSON.stringify(pinBody),
//   });
//   const pinData = await pinRes.json();

//   console.log('[Pinterest] Create pin response:', JSON.stringify(pinData).slice(0, 300));

//   if (pinData.id) {
//     return { success: true, platformPostId: pinData.id };
//   }
//   return {
//     success: false,
//     error: pinData.message || pinData.code?.toString() || 'Pinterest pin creation failed',
//   };
// }

async function publishPinToBoard(
  accessToken: string,
  boardId: string,
  caption: string,
  imageUrls: string[],
  videoUrl?: string,
): Promise<PublishResult> {
  const urls = imageUrls.length > 0 ? imageUrls : videoUrl ? [videoUrl] : [];
  
  if (urls.length === 0) {
    return { success: false, error: 'Pinterest requires at least one image.' };
  }

  // Publish each slide as a separate pin
  let firstPinId: string | undefined;
  for (const [index, url] of urls.entries()) {
    const pinBody: Record<string, unknown> = {
      title: caption.slice(0, 100),
      description: caption.slice(0, 800),
      board_id: boardId,
      media_source: { source_type: 'image_url', url },
    };

    const pinRes = await fetch('https://api.pinterest.com/v5/pins', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${accessToken}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify(pinBody),
    });
    const pinData = await pinRes.json();
    console.log(`[Pinterest] Pin ${index + 1} response:`, JSON.stringify(pinData).slice(0, 300));
    
    if (index === 0) firstPinId = pinData.id;
  }

  if (firstPinId) {
    return { success: true, platformPostId: firstPinId };
  }
  return { success: false, error: 'Pinterest: all pin creations failed' };
}

// ============================================================
// DISPATCHER
// ============================================================

export async function publishToplatform(
  platform: string,
  accessToken: string,
  platformUserId: string,
  caption: string,
  graphicUrls: string[] = [],
  refreshToken?: string,
  onTokenRefresh?: (newAccessToken: string, newRefreshToken: string) => Promise<void>,
  contentType?: string,
  oauthToken?: string,           // ← add
  oauthTokenSecret?: string,     // ← add
  platformSpecific?: Record<string, unknown>, // ← v5: YouTube title + thumbnail
): Promise<PublishResult> {
  // ugc_ad and data_story also produce video content stored in graphicUrls
  const isVideo = contentType === 'reel' || contentType === 'ugc_ad' || contentType === 'data_story';
  const verticalVideo = isVideo ? graphicUrls[0] : undefined;
  const squareVideo = isVideo ? (graphicUrls[1] || graphicUrls[0]) : undefined;
  const imageUrls = isVideo ? [] : graphicUrls;

  // Extract YouTube-specific overrides — set by user via YouTube settings panel.
  // The title is stored at platformSpecific.title (root) by the saveTitle function,
  // and at platformSpecific.youtube.title by the saveYoutubeSettings function.
  // Check both — nested takes priority if present.
  const ps = platformSpecific as Record<string, unknown> | undefined;
  const youtubeObj = ps?.youtube as Record<string, string> | undefined;
  const youtubeTitle: string | undefined =
    youtubeObj?.title
    || (typeof ps?.title === 'string' ? ps.title : undefined)
    || undefined;
  const youtubeThumbnail: string | undefined = youtubeObj?.thumbnailUrl || undefined;

  switch (platform) {
    case 'facebook':
      return publishToFacebook(accessToken, platformUserId, caption, imageUrls, squareVideo);

    case 'instagram':
      return publishToInstagram(accessToken, platformUserId, caption, imageUrls, verticalVideo);

    case 'linkedin':
      return publishToLinkedIn(accessToken, platformUserId, caption, imageUrls, squareVideo);

    case 'linkedin_page':
      return publishToLinkedInPage(accessToken, platformUserId, caption, imageUrls, squareVideo);

    case 'twitter':
      return publishToTwitter(
        accessToken,
        caption,
        imageUrls,
        verticalVideo,
        refreshToken,
        onTokenRefresh,
        oauthToken,         // ← new
        oauthTokenSecret,   // ← new
      );

    case 'tiktok': {
      const tiktokSettings = ps?.tiktok as {
        title?: string;
        privacyLevel?: string;
        allowComment?: boolean;
        allowDuet?: boolean;
        allowStitch?: boolean;
        brandOrganicToggle?: boolean;
        brandContentToggle?: boolean;
      } | undefined;
      return publishToTikTok(
        accessToken,
        caption,
        squareVideo ?? verticalVideo,
        refreshToken,
        onTokenRefresh,
        tiktokSettings,
      );
    }

    case 'youtube':
      return publishToYouTube(
        accessToken,
        caption,
        squareVideo ?? verticalVideo,
        refreshToken,
        onTokenRefresh,
        youtubeTitle,
        youtubeThumbnail,
      );

    case 'threads':
      return publishToThreads(accessToken, platformUserId, caption, imageUrls, verticalVideo);

    case 'snapchat':
  return publishToSnapchat(
    accessToken,
    // caption,
    imageUrls,
    squareVideo ?? verticalVideo,
     platformUserId,
  );
  // case 'snapchat':
  // // Snapchat uses Creative Kit — client-side share only
  // return {
  //   success: false,
  //   error: 'Snapchat content is shared via the Share to Snapchat button, not scheduled publishing.',
  // };
    case 'pinterest':
      return publishToPinterest(
        accessToken,
        caption,
        imageUrls,
        squareVideo ?? verticalVideo,
        refreshToken,
        onTokenRefresh,
      );

    default:
      return { success: false, error: `Unsupported platform: ${platform}` };
  }
}