/**
 * NativPost Social Publishing Service
 *
 * Publishes content to connected social platforms.
 * Each platform has its own publish function.
 *
 * All functions return { success, platformPostId?, error? }
 */

interface PublishResult {
  success: boolean;
  platformPostId?: string;
  error?: string;
}

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
      body['url'] = imageUrl;
      body['caption'] = caption;
    } else {
      endpoint = `https://graph.facebook.com/v21.0/${pageId}/feed`;
      body['message'] = caption;
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
// X / TWITTER via API v2
// -----------------------------------------------------------

export async function publishToTwitter(
  accessToken: string,
  caption: string,
): Promise<PublishResult> {
  try {
    const res = await fetch('https://api.x.com/2/tweets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: caption }),
    });

    const data = await res.json();

    if (data.data?.id) {
      return { success: true, platformPostId: data.data.id };
    }

    return { success: false, error: data.detail || data.title || 'Twitter publish failed' };
  } catch (err) {
    return { success: false, error: `Twitter error: ${err}` };
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
  console.log({accessToken, caption});
  return {
    success: false,
    error: 'TikTok publishing requires video upload. Manual posting recommended for MVP.',
  };
}

// -----------------------------------------------------------
// DISPATCHER — routes to the right publisher
// -----------------------------------------------------------

export async function publishToplatform(
  platform: string,
  accessToken: string,
  platformUserId: string,
  caption: string,
  imageUrl?: string,
): Promise<PublishResult> {
  switch (platform) {
    case 'facebook':
      return publishToFacebook(accessToken, platformUserId, caption, imageUrl);
    case 'instagram':
      if (!imageUrl) return { success: false, error: 'Instagram requires an image' };
      return publishToInstagram(accessToken, platformUserId, caption, imageUrl);
    case 'linkedin':
      return publishToLinkedIn(accessToken, platformUserId, caption, imageUrl);
    case 'twitter':
      return publishToTwitter(accessToken, caption);
    case 'tiktok':
      return publishToTikTok(accessToken, caption);
    default:
      return { success: false, error: `Unsupported platform: ${platform}` };
  }
}
