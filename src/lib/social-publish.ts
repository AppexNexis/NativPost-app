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
// LINKEDIN via API v2
// -----------------------------------------------------------

export async function publishToLinkedIn(
  accessToken: string,
  authorUrn: string,
  caption: string,
  imageUrl?: string,
): Promise<PublishResult> {
  try {
    // Format as URN if not already
    const author = authorUrn.startsWith('urn:li:')
      ? authorUrn
      : `urn:li:person:${authorUrn}`;

    const postBody: Record<string, unknown> = {
      author, // ← was authorUrn
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: caption },
          shareMediaCategory: imageUrl ? 'IMAGE' : 'NONE',
          ...(imageUrl && {
            media: [{
              status: 'READY',
              originalUrl: imageUrl,
            }],
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

    return { success: false, error: data.message || 'LinkedIn publish failed' };
  } catch (err) {
    return { success: false, error: `LinkedIn error: ${err}` };
  }
}

export async function publishToLinkedIn_v1(
  accessToken: string,
  authorUrn: string,
  caption: string,
  imageUrl?: string,
): Promise<PublishResult> {
  try {
    const postBody: Record<string, unknown> = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: caption },
          shareMediaCategory: imageUrl ? 'IMAGE' : 'NONE',
          ...(imageUrl && {
            media: [{
              status: 'READY',
              originalUrl: imageUrl,
            }],
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
      // OAuth 2.0 User Context — NOT App-Only Bearer
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
// TIKTOK — Video posts require upload flow, text posts via API
// -----------------------------------------------------------

export async function publishToTikTok(
  accessToken: string,
  caption: string,
): Promise<PublishResult> {
  // TikTok Content Posting API is primarily for video
  // Text-only / image posts have limited API support
  // For MVP: return manual posting instruction
  console.error({ accessToken, caption });
  return {
    success: false,
    error: 'TikTok publishing requires video upload. Manual posting recommended for MVP.',
  };
}

// -----------------------------------------------------------
// DISPATCHER — routes to the right publisher
// -----------------------------------------------------------

// Replace your existing publishToplatform dispatcher with this:

export async function publishToplatform(
  platform: string,
  accessToken: string,
  platformUserId: string,
  caption: string,
  imageUrl?: string,
  // New optional params for Twitter token refresh
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
