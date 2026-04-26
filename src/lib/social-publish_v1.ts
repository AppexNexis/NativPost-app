/**
 * NativPost Social Publishing Service
 *
 * Supports: text, single image, carousel, and video posts.
 * Platforms: Facebook, Instagram, LinkedIn, LinkedIn Page,
 *            Twitter/X, TikTok, YouTube, Threads, Pinterest.
 */

import { Buffer } from 'node:buffer';

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
      const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: imageUrls[0], caption, access_token: accessToken }),
      });
      const data = await res.json();
      if (data.id) {
        return { success: true, platformPostId: data.id };
      }
      return { success: false, error: data.error?.message || 'Facebook image post failed' };
    }

    const photoIds: string[] = [];
    for (const url of imageUrls) {
      const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, published: false, access_token: accessToken }),
      });
      const data = await res.json();
      if (data.id) {
        photoIds.push(data.id);
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
      const containerRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: imageUrls[0], caption, access_token: accessToken }),
      });
      const containerData = await containerRes.json();
      if (!containerData.id) {
        return { success: false, error: containerData.error?.message || 'IG container failed' };
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

    const childIds: string[] = [];
    for (const url of imageUrls.slice(0, 10)) {
      const childRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: url, is_carousel_item: true, access_token: accessToken }),
      });
      const childData = await childRes.json();
      if (childData.id) {
        childIds.push(childData.id);
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
    if (!carouselData.id) {
      return { success: false, error: carouselData.error?.message || 'IG carousel container failed' };
    }

    const publishRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: carouselData.id, access_token: accessToken }),
    });
    const publishData = await publishRes.json();
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
// TWITTER / X
// ============================================================

export async function publishToTwitter(
  accessToken: string,
  caption: string,
  imageUrls: string[] = [],
  videoUrl?: string,
  refreshToken?: string,
  onTokenRefresh?: (newAccessToken: string, newRefreshToken: string) => Promise<void>,
): Promise<PublishResult> {
  try {
    const result = await postTweet(accessToken, caption);

    if (!result.success && result.error === 'Unauthorized' && refreshToken) {
      const refreshed = await refreshTwitterToken(refreshToken);
      if (!refreshed) {
        return { success: false, error: 'Twitter token expired. Please reconnect.' };
      }
      if (onTokenRefresh) {
        await onTokenRefresh(refreshed.accessToken, refreshed.refreshToken);
      }
      return postTweet(refreshed.accessToken, caption);
    }

    if (result.success && (imageUrls.length > 0 || videoUrl)) {
      console.log('[Twitter] Published as text-only — media requires OAuth 1.0a');
    }

    return result;
  } catch (err) {
    return { success: false, error: `Twitter error: ${err}` };
  }
}

async function postTweet(accessToken: string, text: string): Promise<PublishResult> {
  const res = await fetch('https://api.x.com/2/tweets', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  if (res.status === 401) {
    return { success: false, error: 'Unauthorized' };
  }
  if (data.data?.id) {
    return { success: true, platformPostId: data.data.id };
  }
  return { success: false, error: data.detail || data.title || 'Twitter publish failed' };
}

async function refreshTwitterToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string } | null> {
  try {
    const clientId = process.env.TWITTER_CLIENT_ID!;
    const clientSecret = process.env.TWITTER_CLIENT_SECRET!;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch('https://api.x.com/2/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${credentials}` },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId }),
    });
    const data = await res.json();
    if (data.access_token) {
      return { accessToken: data.access_token, refreshToken: data.refresh_token || refreshToken };
    }
    return null;
  } catch {
    return null;
  }
}

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

    // Step 3: Pick privacy level — unaudited apps are restricted to SELF_ONLY.
    // After audit approval, PUBLIC_TO_EVERYONE will appear in privacy_level_options.
    const privacyLevel = creatorInfo.privacyLevelOptions.includes('SELF_ONLY')
      ? 'SELF_ONLY'
      : (creatorInfo.privacyLevelOptions[0] ?? 'SELF_ONLY');

    // Step 4: Initiate the Direct Post upload.
    // All fields below are required by TikTok's integration guidelines.
    const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: caption.slice(0, 2200),
          privacy_level: privacyLevel,
          disable_comment: creatorInfo.commentDisabled,
          disable_duet: creatorInfo.duetDisabled,
          disable_stitch: creatorInfo.stitchDisabled,
          brand_content_toggle: false,
          brand_organic_toggle: false,
        },
        source_info: {
          // PULL_FROM_URL: Uploadcare CDN URLs are publicly accessible — no proxy needed.
          source: 'PULL_FROM_URL',
          video_url: playableUrl,
        },
      }),
    });

    const initData = await initRes.json();

    if (!initData.data?.publish_id) {
      console.error('[TikTok] Init failed:', JSON.stringify(initData));
      const errCode = initData.error?.code || '';
      const errMsg = initData.error?.message || '';

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

    console.log(`[TikTok] Published (privacy: ${privacyLevel}), publish_id: ${initData.data.publish_id}`);
    if (privacyLevel === 'SELF_ONLY') {
      console.log('[TikTok] Post is private (SELF_ONLY) — app not yet audited. User can change visibility on TikTok manually.');
    }

    return { success: true, platformPostId: initData.data.publish_id };
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
): Promise<PublishResult> {
  if (!videoUrl) {
    return { success: false, error: 'YouTube requires a video. Create a video post first.' };
  }

  const result = await _uploadToYouTube(accessToken, caption, videoUrl);

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
    return _uploadToYouTube(refreshed.accessToken, caption, videoUrl);
  }

  return result;
}

async function _uploadToYouTube(
  accessToken: string,
  caption: string,
  videoUrl: string,
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
            title: caption.slice(0, 100),
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
      console.log(`[YouTube] Uploaded: https://www.youtube.com/watch?v=${uploadData.id}`);
      return { success: true, platformPostId: uploadData.id };
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

async function publishPinToBoard(
  accessToken: string,
  boardId: string,
  caption: string,
  imageUrls: string[],
  videoUrl?: string,
): Promise<PublishResult> {
  const pinBody: Record<string, unknown> = {
    title: caption.slice(0, 100),
    description: caption,
    board_id: boardId,
  };

  if (imageUrls.length > 0) {
    pinBody.media_source = { source_type: 'image_url', url: imageUrls[0] };
  } else if (videoUrl) {
    pinBody.media_source = { source_type: 'image_url', url: videoUrl };
  }

  const pinRes = await fetch('https://api.pinterest.com/v5/pins', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(pinBody),
  });
  const pinData = await pinRes.json();

  console.log('[Pinterest] Create pin response:', JSON.stringify(pinData).slice(0, 300));

  if (pinData.id) {
    return { success: true, platformPostId: pinData.id };
  }
  return {
    success: false,
    error: pinData.message || pinData.code?.toString() || 'Pinterest pin creation failed',
  };
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
): Promise<PublishResult> {
  // ugc_ad and data_story also produce video content stored in graphicUrls
  const isVideo = contentType === 'reel' || contentType === 'ugc_ad' || contentType === 'data_story';
  const verticalVideo = isVideo ? graphicUrls[0] : undefined;
  const squareVideo = isVideo ? (graphicUrls[1] || graphicUrls[0]) : undefined;
  const imageUrls = isVideo ? [] : graphicUrls;

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
      return publishToTwitter(accessToken, caption, imageUrls, verticalVideo, refreshToken, onTokenRefresh);

    case 'tiktok':
      return publishToTikTok(accessToken, caption, verticalVideo, refreshToken, onTokenRefresh);

    case 'youtube':
      return publishToYouTube(
        accessToken,
        caption,
        squareVideo ?? verticalVideo,
        refreshToken,
        onTokenRefresh,
      );

    case 'threads':
      return publishToThreads(accessToken, platformUserId, caption, imageUrls, verticalVideo);

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
