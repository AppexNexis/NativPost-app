/**
 * NativPost Social Publishing Service
 *
 * Publishes content to connected social platforms.
 * Supports: text, single image, and carousel (multi-image) posts.
 *
 * All functions return { success, platformPostId?, error? }
 */

import { Buffer } from 'node:buffer';

export type PublishResult = {
  success: boolean;
  platformPostId?: string;
  error?: string;
};

// ============================================================
// FACEBOOK
// ============================================================

export async function publishToFacebook(
  accessToken: string,
  pageId: string,
  caption: string,
  imageUrls: string[] = [],
): Promise<PublishResult> {
  try {
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
      return { success: false, error: data.error?.message || 'Facebook single image post failed' };
    }

    // --- Carousel: upload each photo as unpublished, then post with attached_media ---
    const photoIds: string[] = [];

    for (const url of imageUrls) {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${pageId}/photos`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            published: false,
            access_token: accessToken,
          }),
        },
      );
      const data = await res.json();
      if (!data.id) {
        console.error('[Facebook] Failed to upload photo for carousel:', JSON.stringify(data));
        continue;
      }
      photoIds.push(data.id);
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
): Promise<PublishResult> {
  try {
    if (imageUrls.length === 0) {
      return { success: false, error: 'Instagram requires at least one image' };
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
          body: JSON.stringify({
            creation_id: containerData.id,
            access_token: accessToken,
          }),
        },
      );
      const publishData = await publishRes.json();
      if (publishData.id) {
        return { success: true, platformPostId: publishData.id };
      }
      return { success: false, error: publishData.error?.message || 'IG publish failed' };
    }

    // --- Carousel (2–10 images) ---
    // Step 1: Create a child container per image
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
      if (!childData.id) {
        console.error('[Instagram] Failed to create child container:', JSON.stringify(childData));
        continue;
      }
      childIds.push(childData.id);
    }

    if (childIds.length < 2) {
      return {
        success: false,
        error: `Instagram carousel requires at least 2 images. Only ${childIds.length} uploaded successfully.`,
      };
    }

    // Step 2: Create the parent carousel container
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

    // Step 3: Publish the carousel
    const publishRes = await fetch(
      `https://graph.facebook.com/v21.0/${igUserId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: carouselData.id,
          access_token: accessToken,
        }),
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
//
// LinkedIn does NOT accept external image URLs.
// Every image must be registered + uploaded to LinkedIn CDN first
// to get an asset URN, then referenced in the post.
// Works for both single image and carousel (array of URNs).
// ============================================================

async function uploadImageToLinkedIn(
  accessToken: string,
  authorUrn: string,
  imageUrl: string,
): Promise<string | null> {
  try {
    // 1. Register the upload with LinkedIn
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
              {
                relationshipType: 'OWNER',
                identifier: 'urn:li:userGeneratedContent',
              },
            ],
          },
        }),
      },
    );

    const registerData = await registerRes.json();
    const uploadUrl
      = registerData?.value?.uploadMechanism?.[
        'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
      ]?.uploadUrl;
    const assetUrn = registerData?.value?.asset;

    if (!uploadUrl || !assetUrn) {
      console.error('[LinkedIn] Register upload failed:', JSON.stringify(registerData));
      return null;
    }

    // 2. Fetch the image bytes from Uploadcare/CDN
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      console.error('[LinkedIn] Failed to fetch image:', imageUrl);
      return null;
    }
    const imageBuffer = await imageRes.arrayBuffer();
    const contentType = imageRes.headers.get('content-type') || 'image/jpeg';

    // 3. PUT the bytes to LinkedIn's upload URL
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': contentType,
      },
      body: imageBuffer,
    });

    if (uploadRes.ok || uploadRes.status === 201) {
      // eslint-disable-next-line no-console
      console.log('[LinkedIn] Image uploaded, URN:', assetUrn);
      return assetUrn as string;
    }

    console.error('[LinkedIn] Binary upload failed, status:', uploadRes.status);
    return null;
  } catch (err) {
    console.error('[LinkedIn] uploadImageToLinkedIn error:', err);
    return null;
  }
}

export async function publishToLinkedIn(
  accessToken: string,
  authorUrn: string,
  caption: string,
  imageUrls: string[] = [],
): Promise<PublishResult> {
  try {
    const author = authorUrn.startsWith('urn:li:')
      ? authorUrn
      : `urn:li:person:${authorUrn}`;

    // Upload all images sequentially and collect their URNs
    const assetUrns: string[] = [];
    for (const url of imageUrls) {
      const urn = await uploadImageToLinkedIn(accessToken, author, url);
      if (urn) {
        assetUrns.push(urn);
      }
    }

    if (imageUrls.length > 0 && assetUrns.length === 0) {
      console.warn('[LinkedIn] All image uploads failed — falling back to text-only post');
    }

    const postBody: Record<string, unknown> = {
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: caption },
          // IMAGE category works for both single and carousel (array of URNs)
          shareMediaCategory: assetUrns.length > 0 ? 'IMAGE' : 'NONE',
          ...(assetUrns.length > 0 && {
            media: assetUrns.map(urn => ({
              status: 'READY',
              media: urn,
            })),
          }),
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
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
//
// Twitter v2 API (OAuth 2.0 user tokens) only supports text tweets.
// Attaching images requires v1.1 media/upload with OAuth 1.0a
// app-level credentials — a separate auth flow not currently stored.
//
// Carousel posts publish as text-only for now.
// Full image support requires storing OAuth 1.0a tokens at connect time.
// ============================================================

export async function publishToTwitter(
  accessToken: string,
  caption: string,
  imageUrls: string[] = [],
  refreshToken?: string,
  onTokenRefresh?: (newAccessToken: string, newRefreshToken: string) => Promise<void>,
): Promise<PublishResult> {
  try {
    const result = await postTweet(accessToken, caption);

    if (!result.success && result.error === 'Unauthorized' && refreshToken) {
      const refreshed = await refreshTwitterToken(refreshToken);
      if (!refreshed) {
        return {
          success: false,
          error: 'Twitter token expired. Please reconnect your Twitter account.',
        };
      }
      if (onTokenRefresh) {
        await onTokenRefresh(refreshed.accessToken, refreshed.refreshToken);
      }
      return postTweet(refreshed.accessToken, caption);
    }

    if (result.success && imageUrls.length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[Twitter] Published as text-only. ${imageUrls.length} image(s) skipped — requires OAuth 1.0a for media upload.`,
      );
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
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
      };
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
// imageUrls is now a string array instead of a single optional string.
// The publish route must pass the full graphicUrls array here.
// ============================================================

export async function publishToplatform(
  platform: string,
  accessToken: string,
  platformUserId: string,
  caption: string,
  imageUrls: string[] = [],
  refreshToken?: string,
  onTokenRefresh?: (newAccessToken: string, newRefreshToken: string) => Promise<void>,
): Promise<PublishResult> {
  switch (platform) {
    case 'facebook':
      return publishToFacebook(accessToken, platformUserId, caption, imageUrls);

    case 'instagram':
      return publishToInstagram(accessToken, platformUserId, caption, imageUrls);

    case 'linkedin':
      return publishToLinkedIn(accessToken, platformUserId, caption, imageUrls);

    case 'twitter':
      return publishToTwitter(accessToken, caption, imageUrls, refreshToken, onTokenRefresh);

    case 'tiktok':
      return publishToTikTok(accessToken, caption);

    default:
      return { success: false, error: `Unsupported platform: ${platform}` };
  }
}
