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
// The platformUserId stored for linkedin_page is the org URN
// (e.g. urn:li:organization:12345). Publishing uses ugcPosts
// with the org URN as author.
// ============================================================

export async function publishToLinkedInPage(
  accessToken: string,
  orgUrn: string,
  caption: string,
  imageUrls: string[] = [],
  videoUrl?: string,
): Promise<PublishResult> {
  try {
    // Org URN is already in urn:li:organization:xxx format from the callback
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
    // Step 1: Initialize upload
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
// ============================================================

export async function publishToYouTube(
  accessToken: string,
  caption: string,
  videoUrl?: string,
): Promise<PublishResult> {
  if (!videoUrl) {
    return { success: false, error: 'YouTube requires a video. Create a video post first.' };
  }

  try {
    // Fetch the video binary from Uploadcare
    const media = await fetchMediaBuffer(videoUrl);
    if (!media) {
      return { success: false, error: 'Failed to fetch video for YouTube upload.' };
    }

    // Step 1: Insert metadata to get resumable upload URL
    const metaRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': 'video/mp4',
          'X-Upload-Content-Length': String(media.buffer.byteLength),
        },
        body: JSON.stringify({
          snippet: {
            title: caption.slice(0, 100),
            description: caption,
            categoryId: '22', // People & Blogs — safe default
          },
          status: { privacyStatus: 'public' },
        }),
      },
    );

    if (!metaRes.ok) {
      const errText = await metaRes.text();
      console.error('[YouTube] Metadata upload failed:', errText);
      return { success: false, error: 'YouTube metadata upload failed.' };
    }

    const resumableUrl = metaRes.headers.get('location');
    if (!resumableUrl) {
      return { success: false, error: 'YouTube did not return resumable upload URL.' };
    }

    // Step 2: Upload the video bytes
    const uploadRes = await fetch(resumableUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(media.buffer.byteLength) },
      body: media.buffer,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error('[YouTube] Video upload failed:', errText);
      return { success: false, error: 'YouTube video upload failed.' };
    }

    const uploadData = await uploadRes.json();
    if (uploadData.id) {
      return { success: true, platformPostId: uploadData.id };
    }
    return { success: false, error: 'YouTube upload succeeded but no video ID returned.' };
  } catch (err) {
    return { success: false, error: `YouTube error: ${err}` };
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
      // Threads carousel: create a container per image, then a carousel container
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

    // Single media or text post
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
    // First fetch the user's boards to get a default board ID
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
      // Pinterest video pins require a different upload flow — use image fallback
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
      return publishToYouTube(accessToken, caption, squareVideo ?? verticalVideo);

    case 'threads':
      return publishToThreads(accessToken, platformUserId, caption, imageUrls, verticalVideo);

    case 'pinterest':
      return publishToPinterest(accessToken, caption, imageUrls, squareVideo ?? verticalVideo);

    default:
      return { success: false, error: `Unsupported platform: ${platform}` };
  }
}
