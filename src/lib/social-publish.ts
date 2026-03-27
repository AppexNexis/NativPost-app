/**
 * NativPost Social Publishing Service
 *
 * Supports: text, single image, carousel, and video (reel) posts.
 * All functions return { success, platformPostId?, error? }
 */

import { Buffer } from 'node:buffer';

export type PublishResult = {
  success: boolean;
  platformPostId?: string;
  error?: string;
};

// ============================================================
// SHARED UTILITIES
// ============================================================

/** Fetch a remote file and return its buffer + content-type */
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
    // --- Video post ---
    if (videoUrl) {
      // Facebook accepts external video URLs via /videos endpoint
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${pageId}/videos`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_url: videoUrl,
            description: caption,
            access_token: accessToken,
          }),
        },
      );
      const data = await res.json();
      if (data.id) {
        return { success: true, platformPostId: data.id };
      }
      return { success: false, error: data.error?.message || 'Facebook video post failed' };
    }

    // --- No images: text post ---
    if (imageUrls.length === 0) {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${pageId}/feed`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: caption, access_token: accessToken }),
        },
      );
      const data = await res.json();
      if (data.id) {
        return { success: true, platformPostId: data.id };
      }
      return { success: false, error: data.error?.message || 'Facebook text post failed' };
    }

    // --- Single image ---
    if (imageUrls.length === 1) {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${pageId}/photos`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: imageUrls[0],
            caption,
            access_token: accessToken,
          }),
        },
      );
      const data = await res.json();
      if (data.id) {
        return { success: true, platformPostId: data.id };
      }
      return { success: false, error: data.error?.message || 'Facebook image post failed' };
    }

    // --- Carousel: upload each photo unpublished then attach ---
    const photoIds: string[] = [];
    for (const url of imageUrls) {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${pageId}/photos`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, published: false, access_token: accessToken }),
        },
      );
      const data = await res.json();
      if (data.id) {
        photoIds.push(data.id);
      }
    }

    if (photoIds.length === 0) {
      return { success: false, error: 'Facebook carousel: all image uploads failed' };
    }

    const feedRes = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/feed`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: caption,
          attached_media: photoIds.map(id => ({ media_fbid: id })),
          access_token: accessToken,
        }),
      },
    );
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
    // --- Reel (video) ---
    if (videoUrl) {
      // Step 1: Create reel container
      const containerRes = await fetch(
        `https://graph.facebook.com/v21.0/${igUserId}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            media_type: 'REELS',
            video_url: videoUrl,
            caption,
            share_to_feed: true,
            access_token: accessToken,
          }),
        },
      );
      const containerData = await containerRes.json();
      if (!containerData.id) {
        return {
          success: false,
          error: containerData.error?.message || 'IG Reel container creation failed',
        };
      }

      // Step 2: Poll until status = FINISHED (max 30 attempts, 3s apart)
      const creationId = containerData.id;
      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const statusRes = await fetch(
          `https://graph.facebook.com/v21.0/${creationId}?fields=status_code&access_token=${accessToken}`,
        );
        const statusData = await statusRes.json();
        // eslint-disable-next-line no-console
        console.log(`[Instagram] Reel status: ${statusData.status_code} (attempt ${attempt + 1})`);

        if (statusData.status_code === 'FINISHED') {
          break;
        }
        if (statusData.status_code === 'ERROR') {
          return { success: false, error: 'IG Reel processing failed on Instagram servers' };
        }
      }

      // Step 3: Publish
      const publishRes = await fetch(
        `https://graph.facebook.com/v21.0/${igUserId}/media_publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ creation_id: creationId, access_token: accessToken }),
        },
      );
      const publishData = await publishRes.json();
      if (publishData.id) {
        return { success: true, platformPostId: publishData.id };
      }
      return { success: false, error: publishData.error?.message || 'IG Reel publish failed' };
    }

    if (imageUrls.length === 0) {
      return { success: false, error: 'Instagram requires at least one image or a video' };
    }

    // --- Single image ---
    if (imageUrls.length === 1) {
      const containerRes = await fetch(
        `https://graph.facebook.com/v21.0/${igUserId}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url: imageUrls[0],
            caption,
            access_token: accessToken,
          }),
        },
      );
      const containerData = await containerRes.json();
      if (!containerData.id) {
        return { success: false, error: containerData.error?.message || 'IG container creation failed' };
      }
      const publishRes = await fetch(
        `https://graph.facebook.com/v21.0/${igUserId}/media_publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ creation_id: containerData.id, access_token: accessToken }),
        },
      );
      const publishData = await publishRes.json();
      if (publishData.id) {
        return { success: true, platformPostId: publishData.id };
      }
      return { success: false, error: publishData.error?.message || 'IG publish failed' };
    }

    // --- Carousel (2-10 images) ---
    const childIds: string[] = [];
    for (const url of imageUrls.slice(0, 10)) {
      const childRes = await fetch(
        `https://graph.facebook.com/v21.0/${igUserId}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url: url,
            is_carousel_item: true,
            access_token: accessToken,
          }),
        },
      );
      const childData = await childRes.json();
      if (childData.id) {
        childIds.push(childData.id);
      }
    }

    if (childIds.length < 2) {
      return { success: false, error: `Instagram carousel needs at least 2 images. Got ${childIds.length}.` };
    }

    const carouselRes = await fetch(
      `https://graph.facebook.com/v21.0/${igUserId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'CAROUSEL',
          children: childIds,
          caption,
          access_token: accessToken,
        }),
      },
    );
    const carouselData = await carouselRes.json();
    if (!carouselData.id) {
      return { success: false, error: carouselData.error?.message || 'IG carousel container failed' };
    }

    const publishRes = await fetch(
      `https://graph.facebook.com/v21.0/${igUserId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: carouselData.id, access_token: accessToken }),
      },
    );
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
// LINKEDIN
// ============================================================

async function uploadImageToLinkedIn(
  accessToken: string,
  authorUrn: string,
  imageUrl: string,
): Promise<string | null> {
  try {
    const registerRes = await fetch(
      'https://api.linkedin.com/v2/assets?action=registerUpload',
      {
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
            serviceRelationships: [
              { relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' },
            ],
          },
        }),
      },
    );

    const registerData = await registerRes.json();
    const uploadUrl = registerData?.value?.uploadMechanism?.[
      'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
    ]?.uploadUrl;
    const assetUrn = registerData?.value?.asset;

    if (!uploadUrl || !assetUrn) {
      console.error('[LinkedIn] Register image upload failed:', JSON.stringify(registerData));
      return null;
    }

    const media = await fetchMediaBuffer(imageUrl);
    if (!media) {
      return null;
    }

    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': media.contentType,
      },
      body: media.buffer,
    });

    if (uploadRes.ok || uploadRes.status === 201) {
      return assetUrn as string;
    }
    console.error('[LinkedIn] Image binary upload failed:', uploadRes.status);
    return null;
  } catch (err) {
    console.error('[LinkedIn] uploadImageToLinkedIn error:', err);
    return null;
  }
}

async function uploadVideoToLinkedIn(
  accessToken: string,
  authorUrn: string,
  videoUrl: string,
): Promise<string | null> {
  try {
    // Step 1: Register video upload — uses feedshare-video recipe
    const registerRes = await fetch(
      'https://api.linkedin.com/v2/assets?action=registerUpload',
      {
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
            serviceRelationships: [
              { relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' },
            ],
          },
        }),
      },
    );

    const registerData = await registerRes.json();
    const uploadUrl = registerData?.value?.uploadMechanism?.[
      'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
    ]?.uploadUrl;
    const assetUrn = registerData?.value?.asset;

    if (!uploadUrl || !assetUrn) {
      console.error('[LinkedIn] Register video upload failed:', JSON.stringify(registerData));
      return null;
    }

    // Step 2: Fetch video bytes from Uploadcare CDN
    // eslint-disable-next-line no-console
    console.log('[LinkedIn] Fetching video for upload...');
    const media = await fetchMediaBuffer(videoUrl);
    if (!media) {
      console.error('[LinkedIn] Failed to fetch video from URL:', videoUrl);
      return null;
    }

    // Step 3: Upload binary to LinkedIn
    // eslint-disable-next-line no-console
    console.log(`[LinkedIn] Uploading video (${(media.buffer.byteLength / 1024 / 1024).toFixed(1)} MB)...`);
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'video/mp4',
      },
      body: media.buffer,
    });

    if (uploadRes.ok || uploadRes.status === 201) {
      // eslint-disable-next-line no-console
      console.log('[LinkedIn] Video uploaded, URN:', assetUrn);
      return assetUrn as string;
    }

    console.error('[LinkedIn] Video upload failed, status:', uploadRes.status);
    return null;
  } catch (err) {
    console.error('[LinkedIn] uploadVideoToLinkedIn error:', err);
    return null;
  }
}

export async function publishToLinkedIn(
  accessToken: string,
  authorUrn: string,
  caption: string,
  imageUrls: string[] = [],
  videoUrl?: string,
): Promise<PublishResult> {
  try {
    const author = authorUrn.startsWith('urn:li:')
      ? authorUrn
      : `urn:li:person:${authorUrn}`;

    // --- Video post ---
    if (videoUrl) {
      const assetUrn = await uploadVideoToLinkedIn(accessToken, author, videoUrl);

      if (!assetUrn) {
        console.warn('[LinkedIn] Video upload failed — falling back to text-only post');
        // Fall through to text-only
      } else {
        const postBody = {
          author,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: { text: caption },
              shareMediaCategory: 'VIDEO',
              media: [{ status: 'READY', media: assetUrn }],
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
        console.error('[LinkedIn] Video post failed:', JSON.stringify(data));
        return { success: false, error: data.message || 'LinkedIn video post failed' };
      }
    }

    // --- Image / carousel / text post ---
    const assetUrns: string[] = [];
    for (const url of imageUrls) {
      const urn = await uploadImageToLinkedIn(accessToken, author, url);
      if (urn) {
        assetUrns.push(urn);
      }
    }

    const postBody = {
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: caption },
          shareMediaCategory: assetUrns.length > 0 ? 'IMAGE' : 'NONE',
          ...(assetUrns.length > 0 && {
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
  } catch (err) {
    return { success: false, error: `LinkedIn error: ${err}` };
  }
}

// ============================================================
// TWITTER / X
// (OAuth 2.0 — text only. Media requires OAuth 1.0a, out of scope)
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
        return { success: false, error: 'Twitter token expired. Please reconnect your Twitter account.' };
      }
      if (onTokenRefresh) {
        await onTokenRefresh(refreshed.accessToken, refreshed.refreshToken);
      }
      return postTweet(refreshed.accessToken, caption);
    }

    if (result.success && (imageUrls.length > 0 || videoUrl)) {
      // eslint-disable-next-line no-console
      console.log('[Twitter] Published as text-only — media upload requires OAuth 1.0a (future implementation)');
    }

    return result;
  } catch (err) {
    return { success: false, error: `Twitter error: ${err}` };
  }
}

async function postTweet(accessToken: string, text: string): Promise<PublishResult> {
  const res = await fetch('https://api.x.com/2/tweets', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
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

async function refreshTwitterToken(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  try {
    const clientId = process.env.TWITTER_CLIENT_ID!;
    const clientSecret = process.env.TWITTER_CLIENT_SECRET!;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch('https://api.x.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
      }),
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
// TIKTOK — skipped for MVP
// ============================================================

export async function publishToTikTok(
  accessToken: string,
  caption: string,
): Promise<PublishResult> {
  console.error({ accessToken, caption });
  return {
    success: false,
    error: 'TikTok publishing requires video upload. Manual posting recommended for MVP.',
  };
}

// ============================================================
// DISPATCHER
//
// graphicUrls convention for reel posts:
//   [0] = 9:16 vertical MP4  → used for Instagram
//   [1] = 1:1 square MP4     → used for LinkedIn, Facebook
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

  // For video posts: pick the right version per platform
  // graphicUrls[0] = 9:16 vertical, graphicUrls[1] = 1:1 square
  const verticalVideo = isVideo ? graphicUrls[0] : undefined; // Instagram
  const squareVideo = isVideo ? (graphicUrls[1] || graphicUrls[0]) : undefined; // LinkedIn/Facebook
  const imageUrls = isVideo ? [] : graphicUrls;

  switch (platform) {
    case 'facebook':
      return publishToFacebook(accessToken, platformUserId, caption, imageUrls, squareVideo);

    case 'instagram':
      return publishToInstagram(accessToken, platformUserId, caption, imageUrls, verticalVideo);

    case 'linkedin':
      return publishToLinkedIn(accessToken, platformUserId, caption, imageUrls, squareVideo);

    case 'twitter':
      return publishToTwitter(
        accessToken,
        caption,
        imageUrls,
        verticalVideo,
        refreshToken,
        onTokenRefresh,
      );

    case 'tiktok':
      return publishToTikTok(accessToken, caption);

    default:
      return { success: false, error: `Unsupported platform: ${platform}` };
  }
}
