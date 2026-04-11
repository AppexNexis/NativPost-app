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

export async function publishToTikTok(
  accessToken: string,
  caption: string,
  videoUrl?: string,
): Promise<PublishResult> {
  if (!videoUrl) {
    return { success: false, error: 'TikTok requires a video. Create a video post first.' };
  }

  try {
    // Resolve the playable video URL — bare Uploadcare URLs need /video.mp4 appended
    const playableUrl = /\.(?:mp4|mov|webm)(?:[/?#]|$)/i.test(videoUrl)
      ? videoUrl
      : `${videoUrl.endsWith('/') ? videoUrl : `${videoUrl}/`}video.mp4`;

    // TikTok requires pull_by_url sources to come from a domain verified in the
    // developer portal. Uploadcare's CDN cannot be verified (we don't control their DNS),
    // so we proxy the video through our own verified app.nativpost.com domain.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.nativpost.com';
    const proxiedUrl = `${appUrl}/api/media/proxy?url=${encodeURIComponent(playableUrl)}`;

    const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({
        post_info: { title: caption.slice(0, 2200), privacy_level: 'PUBLIC_TO_EVERYONE', disable_duet: false, disable_comment: false, disable_stitch: false },
        source_info: { source: 'PULL_FROM_URL', video_url: proxiedUrl },
      }),
    });
    const initData = await initRes.json();

    if (!initData.data?.publish_id) {
      return { success: false, error: initData.error?.message || 'TikTok upload init failed' };
    }

    return { success: true, platformPostId: initData.data.publish_id };
  } catch (err) {
    return { success: false, error: `TikTok error: ${err}` };
  }
}

export async function publishToTikTok_(
  accessToken: string,
  caption: string,
  videoUrl?: string,
): Promise<PublishResult> {
  if (!videoUrl) {
    return { success: false, error: 'TikTok requires a video. Create a video post first.' };
  }

  try {
    const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({
        post_info: { title: caption.slice(0, 2200), privacy_level: 'PUBLIC_TO_EVERYONE', disable_duet: false, disable_comment: false, disable_stitch: false },
        source_info: { source: 'PULL_FROM_URL', video_url: videoUrl },
      }),
    });
    const initData = await initRes.json();

    if (!initData.data?.publish_id) {
      return { success: false, error: initData.error?.message || 'TikTok upload init failed' };
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
): Promise<PublishResult> {
  try {
    const boardsRes = await fetch('https://api.pinterest.com/v5/boards?page_size=1', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const boardsData = await boardsRes.json();
    const boardId = boardsData.items?.[0]?.id;

    if (!boardId) {
      return { success: false, error: 'No Pinterest boards found. Create a board first.' };
    }

    const pinBody: Record<string, unknown> = {
      title: caption.slice(0, 100),
      description: caption,
      board_id: boardId,
    };

    if (imageUrls.length > 0) {
      pinBody.media_source = { source_type: 'image_url', url: imageUrls[0] };
    } else if (videoUrl) {
      pinBody.media_source = { source_type: 'image_url', url: videoUrl };
    } else {
      return { success: false, error: 'Pinterest requires at least one image.' };
    }

    const pinRes = await fetch('https://api.pinterest.com/v5/pins', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(pinBody),
    });
    const pinData = await pinRes.json();

    if (pinData.id) {
      return { success: true, platformPostId: pinData.id };
    }
    return { success: false, error: pinData.message || pinData.code || 'Pinterest pin creation failed' };
  } catch (err) {
    return { success: false, error: `Pinterest error: ${err}` };
  }
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
  const isVideo = contentType === 'reel';
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
      return publishToTikTok(accessToken, caption, verticalVideo);

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
      return publishToPinterest(accessToken, caption, imageUrls, squareVideo ?? verticalVideo);

    default:
      return { success: false, error: `Unsupported platform: ${platform}` };
  }
}
