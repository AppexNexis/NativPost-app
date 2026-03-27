/**
 * NativPost Social Publishing Service
 *
 * Publishes content to connected social platforms.
 * Each platform has its own publish function.
 *
 * All functions return { success, platformPostId?, error? }
 */

import { Buffer } from 'node:buffer';

type PublishResult = {
  success: boolean;
  platformPostId?: string;
  error?: string;
};

// -----------------------------------------------------------
// META (Facebook + Instagram) via Graph API
// -----------------------------------------------------------

export async function publishToFacebook(
  accessToken: string,
  pageId: string,
  caption: string,
  imageUrl?: string,
): Promise<PublishResult> {
  try {
    let endpoint: string;
    const body: Record<string, string> = { access_token: accessToken };

    if (imageUrl) {
      endpoint = `https://graph.facebook.com/v21.0/${pageId}/photos`;
      body.url = imageUrl;
      body.caption = caption;
    } else {
      endpoint = `https://graph.facebook.com/v21.0/${pageId}/feed`;
      body.message = caption;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (data.id) {
      return { success: true, platformPostId: data.id };
    }

    return { success: false, error: data.error?.message || 'Facebook publish failed' };
  } catch (err) {
    return { success: false, error: `Facebook error: ${err}` };
  }
}

export async function publishToInstagram(
  accessToken: string,
  igUserId: string,
  caption: string,
  imageUrl: string,
): Promise<PublishResult> {
  try {
    // Step 1: Create media container
    const containerRes = await fetch(
      `https://graph.facebook.com/v21.0/${igUserId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: imageUrl,
          caption,
          access_token: accessToken,
        }),
      },
    );

    const containerData = await containerRes.json();
    if (!containerData.id) {
      return { success: false, error: containerData.error?.message || 'IG container creation failed' };
    }

    // Step 2: Publish the container
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
  } catch (err) {
    return { success: false, error: `Instagram error: ${err}` };
  }
}

// -----------------------------------------------------------
// LINKEDIN via UGC Posts API
//
// LinkedIn DOES NOT accept external image URLs directly.
// Images must be:
//   1. Registered with LinkedIn → get an upload URL + asset URN
//   2. Uploaded as binary to that URL
//   3. Referenced by asset URN in the post body
// -----------------------------------------------------------

async function uploadImageToLinkedIn(
  accessToken: string,
  authorUrn: string,
  imageUrl: string,
): Promise<string | null> {
  try {
    // Step 1: Register the image upload with LinkedIn
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
      console.error('[LinkedIn] Failed to register upload:', JSON.stringify(registerData));
      return null;
    }

    // Step 2: Download the image from Uploadcare (or any CDN)
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      console.error('[LinkedIn] Failed to fetch image from URL:', imageUrl);
      return null;
    }

    const imageBuffer = await imageRes.arrayBuffer();
    const contentType = imageRes.headers.get('content-type') || 'image/jpeg';

    // Step 3: Upload the binary to LinkedIn's upload URL
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': contentType,
      },
      body: imageBuffer,
    });

    // LinkedIn returns 201 or 200 on success — no JSON body
    if (uploadRes.ok || uploadRes.status === 201) {
      // eslint-disable-next-line no-console
      console.log('[LinkedIn] Image uploaded successfully, asset URN:', assetUrn);
      return assetUrn as string;
    }

    console.error('[LinkedIn] Image upload failed, status:', uploadRes.status);
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
  imageUrl?: string,
): Promise<PublishResult> {
  try {
    // Format author URN correctly
    const author = authorUrn.startsWith('urn:li:')
      ? authorUrn
      : `urn:li:person:${authorUrn}`;

    let assetUrn: string | null = null;

    // If there's an image, upload it to LinkedIn first to get an asset URN
    if (imageUrl) {
      assetUrn = await uploadImageToLinkedIn(accessToken, author, imageUrl);

      if (!assetUrn) {
        // Fall back to text-only post if image upload fails
        console.warn('[LinkedIn] Image upload failed — falling back to text-only post');
      }
    }

    const postBody: Record<string, unknown> = {
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: caption },
          shareMediaCategory: assetUrn ? 'IMAGE' : 'NONE',
          ...(assetUrn && {
            media: [
              {
                status: 'READY',
                media: assetUrn, // LinkedIn asset URN — NOT an external URL
              },
            ],
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

// -----------------------------------------------------------
// X / TWITTER via API v2 — OAuth 2.0 User Context
// -----------------------------------------------------------

export async function publishToTwitter(
  accessToken: string,
  caption: string,
  refreshToken?: string,
  onTokenRefresh?: (newAccessToken: string, newRefreshToken: string) => Promise<void>,
): Promise<PublishResult> {
  try {
    const result = await postTweet(accessToken, caption);

    // If unauthorized and we have a refresh token, try refreshing first
    if (!result.success && result.error === 'Unauthorized' && refreshToken) {
      const refreshed = await refreshTwitterToken(refreshToken);
      if (!refreshed) {
        return {
          success: false,
          error: 'Twitter token expired. Please reconnect your Twitter account.',
        };
      }

      // Persist the new tokens if caller provided a handler
      if (onTokenRefresh) {
        await onTokenRefresh(refreshed.accessToken, refreshed.refreshToken);
      }

      // Retry with new token
      return postTweet(refreshed.accessToken, caption);
    }

    return result;
  } catch (err) {
    return { success: false, error: `Twitter error: ${err}` };
  }
}

async function postTweet(accessToken: string, caption: string): Promise<PublishResult> {
  const res = await fetch('https://api.x.com/2/tweets', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: caption }),
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

// -----------------------------------------------------------
// TIKTOK
// -----------------------------------------------------------

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

// -----------------------------------------------------------
// DISPATCHER
// -----------------------------------------------------------

export async function publishToplatform(
  platform: string,
  accessToken: string,
  platformUserId: string,
  caption: string,
  imageUrl?: string,
  refreshToken?: string,
  onTokenRefresh?: (newAccessToken: string, newRefreshToken: string) => Promise<void>,
): Promise<PublishResult> {
  switch (platform) {
    case 'facebook':
      return publishToFacebook(accessToken, platformUserId, caption, imageUrl);
    case 'instagram':
      if (!imageUrl) {
        return { success: false, error: 'Instagram requires an image' };
      }
      return publishToInstagram(accessToken, platformUserId, caption, imageUrl);
    case 'linkedin':
      return publishToLinkedIn(accessToken, platformUserId, caption, imageUrl);
    case 'twitter':
      return publishToTwitter(accessToken, caption, refreshToken, onTokenRefresh);
    case 'tiktok':
      return publishToTikTok(accessToken, caption);
    default:
      return { success: false, error: `Unsupported platform: ${platform}` };
  }
}
