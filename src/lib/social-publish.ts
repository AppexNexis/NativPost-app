/**
 * NativPost Social Publishing Service
 *
 * Supports: text, single image, carousel, and video posts.
 * Platforms: Facebook, Instagram, LinkedIn, LinkedIn Page,
 *            Twitter/X, TikTok, YouTube, Threads, Pinterest, WhatsApp.
 *
 * Changes vs previous version:
 *  - Facebook: long-lived token refresh on 190 (token expired) errors
 *  - Facebook/Instagram: robust image URL validation, not just Uploadcare
 *  - Instagram: unified polling helper, consistent retry across single/carousel
 *  - WhatsApp: full Channel publishing (text, image, video, document)
 */

import { Buffer } from 'node:buffer';
import { isVideoContentType } from '@/types/v2';
import { publishToTwitter } from './twitter-publisher';
import { publishToSnapchat } from './snapchat-publisher';

export type PublishResult = {
  success: boolean;
  platformPostId?: string;
  permalink?: string;
  error?: string;
};

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function fetchMediaBuffer(
  url: string,
): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    return { buffer, contentType };
  } catch {
    return null;
  }
}

/**
 * Apply Cloudinary content-aware crop to match platform's recommended ratio.
 * Only works on URLs already hosted on Cloudinary — external URLs pass through.
 */
function cropToAspect(url: string, targetW: number, targetH: number): string {
  if (!url) return url;
  // Only transform Cloudinary URLs
  const cdnMarker = 'res.cloudinary.com/';
  const idx = url.indexOf(cdnMarker);
  if (idx === -1) return url;
  const uploadMarker = '/image/upload/';
  const uploadIdx = url.indexOf(uploadMarker, idx);
  if (uploadIdx === -1) return url;
  // Insert crop transform after /image/upload/ but before any version
  const prefix = url.slice(0, uploadIdx + uploadMarker.length);
  const suffix = url.slice(uploadIdx + uploadMarker.length);
  return `${prefix}c_fill,g_auto,w_${targetW},h_${targetH}/${suffix}`;
}

/**
 * Ensure image URLs are publicly accessible with a clean content-type.
 * Handles Uploadcare CDN and bare CDN URLs without extension.
 */
function toPublicImageUrl(url: string): string {
  if (!url) return url;
  // Uploadcare: force JPEG output so Facebook/Instagram accept it
  if (url.includes('ucarecdn.com')) {
    const base = url.endsWith('/') ? url : `${url}/`;
    return `${base}-/format/jpeg/-/quality/smart/`;
  }
  return url;
}

/**
 * Poll a container status endpoint until FINISHED or ERROR.
 * Returns true if FINISHED within the allowed attempts.
 */
async function pollContainerStatus(
  statusUrl: string,
  maxAttempts = 20,
  intervalMs = 3000,
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs));
    try {
      const res = await fetch(statusUrl);
      const data = await res.json();
      const code: string = data.status_code || data.status || '';
      if (code === 'FINISHED' || code === 'succeeded') return true;
      if (code === 'ERROR' || code === 'failed') return false;
    } catch {
      // network blip — keep polling
    }
  }
  return false;
}

// ============================================================
// FACEBOOK
// ============================================================

/**
 * Exchange a short-lived or standard page token for a long-lived one.
 * Called automatically when a 190 (token expired) error is detected.
 */
async function refreshFacebookToken(
  expiredToken: string,
): Promise<string | null> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return null;

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${expiredToken}`,
    );
    const data = await res.json();
    return data.access_token || null;
  } catch {
    return null;
  }
}

/**
 * Attempt a Facebook Graph API call, auto-refreshing the token once on error 190.
 */
async function fbFetch(
  url: string,
  options: RequestInit,
  onTokenRefresh?: (newToken: string) => Promise<void>,
): Promise<Response> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const cloned = res.clone();
    try {
      const err = await cloned.json();
      // Error 190: token expired or invalid
      if (err?.error?.code === 190 || err?.error?.code === 102) {
        // Extract current token from body or URL
        let currentToken: string | null = null;
        if (options.body) {
          try {
            const body = JSON.parse(options.body as string);
            currentToken = body.access_token || null;
          } catch { /* not JSON */ }
        }
        if (!currentToken) {
          const urlObj = new URL(url);
          currentToken = urlObj.searchParams.get('access_token');
        }
        if (currentToken) {
          const newToken = await refreshFacebookToken(currentToken);
          if (newToken) {
            if (onTokenRefresh) await onTokenRefresh(newToken);
            // Rebuild request with new token
            let newBody = options.body;
            if (newBody && typeof newBody === 'string') {
              try {
                const parsed = JSON.parse(newBody);
                parsed.access_token = newToken;
                newBody = JSON.stringify(parsed);
              } catch { /* not JSON */ }
            }
            return fetch(url, { ...options, body: newBody });
          }
        }
      }
    } catch { /* parse failed */ }
  }
  return res;
}

export async function publishToFacebook(
  accessToken: string,
  pageId: string,
  caption: string,
  imageUrls: string[] = [],
  videoUrl?: string,
  onTokenRefresh?: (newToken: string) => Promise<void>,
): Promise<PublishResult> {
  // Build FB post URL from returned id:
  //   - feed/video/carousel post ids look like "{pageId}_{suffix}" → /{pageId}/posts/{suffix}
  //   - single photo ids are bare numeric        → /{pageId}/photos/{id}
  const fbPermalink = (id: string, kind: 'post' | 'photo'): string => {
    if (kind === 'photo') return `https://www.facebook.com/${pageId}/photos/${id}`;
    const idx = id.indexOf('_');
    const suffix = idx >= 0 ? id.slice(idx + 1) : id;
    return `https://www.facebook.com/${pageId}/posts/${suffix}`;
  };
  try {
    // ── Video ──
    if (videoUrl) {
      const res = await fbFetch(
        `https://graph.facebook.com/v21.0/${pageId}/videos`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_url: videoUrl, description: caption, access_token: accessToken }),
        },
        onTokenRefresh,
      );
      const data = await res.json();
      if (data.id) return { success: true, platformPostId: data.id, permalink: fbPermalink(data.id, 'post') };
      return { success: false, error: data.error?.message || 'Facebook video post failed' };
    }

    // ── Text only ──
    if (imageUrls.length === 0) {
      const res = await fbFetch(
        `https://graph.facebook.com/v21.0/${pageId}/feed`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: caption, access_token: accessToken }),
        },
        onTokenRefresh,
      );
      const data = await res.json();
      if (data.id) return { success: true, platformPostId: data.id, permalink: fbPermalink(data.id, 'post') };
      return { success: false, error: data.error?.message || 'Facebook text post failed' };
    }

    // ── Single image ──
    if (imageUrls.length === 1) {
      const imageUrl = imageUrls[0];
      if (!imageUrl) return { success: false, error: 'Facebook: image URL is missing' };
      const res = await fbFetch(
        `https://graph.facebook.com/v21.0/${pageId}/photos`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: toPublicImageUrl(imageUrl), caption, access_token: accessToken }),
        },
        onTokenRefresh,
      );
      const data = await res.json();
      if (data.id) return { success: true, platformPostId: data.id, permalink: fbPermalink(data.id, 'photo') };
      return { success: false, error: data.error?.message || 'Facebook image post failed' };
    }

    // ── Carousel ──
    const photoIds: string[] = [];
    for (const url of imageUrls) {
      const transformedUrl = toPublicImageUrl(url);
      const res = await fbFetch(
        `https://graph.facebook.com/v21.0/${pageId}/photos`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: transformedUrl, published: false, access_token: accessToken }),
        },
        onTokenRefresh,
      );
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

    const feedRes = await fbFetch(
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
      onTokenRefresh,
    );
    const feedData = await feedRes.json();
    if (feedData.id) return { success: true, platformPostId: feedData.id, permalink: fbPermalink(feedData.id, 'post') };
    return { success: false, error: feedData.error?.message || 'Facebook carousel post failed' };
  } catch (err) {
    return { success: false, error: `Facebook error: ${err}` };
  }
}

// ============================================================
// INSTAGRAM
// ============================================================

// Fetches the shareable permalink for an IG media ID. Best-effort — on
// failure we return undefined and let the read-side fallback kick in.
async function fetchIgPermalink(mediaId: string, accessToken: string): Promise<string | undefined> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${mediaId}?fields=permalink&access_token=${accessToken}`,
    );
    const data = await res.json();
    if (typeof data.permalink === 'string' && data.permalink.length > 0) return data.permalink;
  } catch (err) {
    console.error('[Instagram] permalink fetch failed:', err);
  }
  return undefined;
}

export async function publishToInstagram(
  accessToken: string,
  igUserId: string,
  caption: string,
  imageUrls: string[] = [],
  videoUrl?: string,
): Promise<PublishResult> {
  try {
    // ── Reel (video) ──
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

      const ready = await pollContainerStatus(
        `https://graph.facebook.com/v21.0/${containerData.id}?fields=status_code&access_token=${accessToken}`,
        30, 3000,
      );
      if (!ready) return { success: false, error: 'IG Reel processing failed or timed out' };

      const publishRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: containerData.id, access_token: accessToken }),
      });
      const publishData = await publishRes.json();
      if (publishData.id) {
        const permalink = await fetchIgPermalink(publishData.id, accessToken);
        return { success: true, platformPostId: publishData.id, permalink };
      }
      return { success: false, error: publishData.error?.message || 'IG Reel publish failed' };
    }

    if (imageUrls.length === 0) {
      return { success: false, error: 'Instagram requires at least one image or a video' };
    }

    // ── Single image ──
    if (imageUrls.length === 1) {
      const imageUrl = imageUrls[0];
      if (!imageUrl) return { success: false, error: 'Instagram: image URL is missing' };

      const containerRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: toPublicImageUrl(imageUrl), caption, access_token: accessToken }),
      });
      const containerData = await containerRes.json();
      if (!containerData.id) {
        return { success: false, error: containerData.error?.message || 'IG container failed' };
      }

      const ready = await pollContainerStatus(
        `https://graph.facebook.com/v21.0/${containerData.id}?fields=status_code&access_token=${accessToken}`,
        20, 2000,
      );
      if (!ready) return { success: false, error: 'IG image processing failed or timed out' };

      const publishRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: containerData.id, access_token: accessToken }),
      });
      const publishData = await publishRes.json();
      if (publishData.id) {
        const permalink = await fetchIgPermalink(publishData.id, accessToken);
        return { success: true, platformPostId: publishData.id, permalink };
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

      const ready = await pollContainerStatus(
        `https://graph.facebook.com/v21.0/${childData.id}?fields=status_code&access_token=${accessToken}`,
        15, 2000,
      );
      if (ready) {
        childIds.push(childData.id);
      } else {
        console.error(`[Instagram] Child container not ready: ${childData.id}`);
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

    const carouselReady = await pollContainerStatus(
      `https://graph.facebook.com/v21.0/${carouselData.id}?fields=status_code&access_token=${accessToken}`,
      15, 2000,
    );
    if (!carouselReady) return { success: false, error: 'IG carousel container processing failed' };

    const publishRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: carouselData.id, access_token: accessToken }),
    });
    const publishData = await publishRes.json();
    console.log(`[Instagram] Publish response:`, JSON.stringify(publishData));
    if (publishData.id) {
      const permalink = await fetchIgPermalink(publishData.id, accessToken);
      return { success: true, platformPostId: publishData.id, permalink };
    }
    return { success: false, error: publishData.error?.message || 'IG carousel publish failed' };
  } catch (err) {
    return { success: false, error: `Instagram error: ${err}` };
  }
}

// ============================================================
// WHATSAPP — Channel Publishing
//
// NativPost clients connect their WhatsApp Business Account.
// Content is published to a WhatsApp Channel they own.
//
// Flow:
//  1. Client connects via OAuth → we store their WABA ID + phone number ID
//  2. publishToWhatsApp() sends a message to their Channel using
//     the Cloud API /messages endpoint
//
// Supported content types:
//  - Text-only
//  - Single image (jpeg/png)
//  - Video (mp4)
//  - Document (pdf)
//
// Note: WhatsApp does not support carousels in Channel messages.
//       Multiple images will be sent as separate messages.
//
// Permissions required (already active on your app):
//  - whatsapp_business_messaging  (Standard → needs Advanced via App Review)
//  - whatsapp_business_management
// ============================================================

type WhatsAppMediaType = 'image' | 'video' | 'document';

/**
 * Upload media to the WhatsApp Cloud API media endpoint.
 * Returns the media_id for use in message objects.
 */
async function uploadWhatsAppMedia(
  accessToken: string,
  phoneNumberId: string,
  mediaUrl: string,
  mediaType: WhatsAppMediaType,
): Promise<string | null> {
  try {
    // Resolve playable URL for video (Uploadcare bare URLs need /video.mp4)
    let resolvedUrl = mediaUrl;
    if (mediaType === 'video' && !/\.(?:mp4|mov|webm)(?:[/?#]|$)/i.test(mediaUrl)) {
      resolvedUrl = `${mediaUrl.endsWith('/') ? mediaUrl : `${mediaUrl}/`}video.mp4`;
    }

    // Fetch the media buffer
    const mediaRes = await fetch(resolvedUrl);
    if (!mediaRes.ok) {
      console.error(`[WhatsApp] Could not fetch media from ${resolvedUrl}: ${mediaRes.status}`);
      return null;
    }
    const mediaBuffer = await mediaRes.arrayBuffer();
    const contentType = mediaRes.headers.get('content-type')
      || (mediaType === 'video' ? 'video/mp4' : mediaType === 'document' ? 'application/pdf' : 'image/jpeg');

    // Upload to WhatsApp Cloud API
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', new Blob([mediaBuffer], { type: contentType }),
      mediaType === 'video' ? 'video.mp4' : mediaType === 'document' ? 'document.pdf' : 'image.jpg',
    );
    form.append('type', contentType);

    const uploadRes = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/media`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      },
    );
    const uploadData = await uploadRes.json();
    console.log('[WhatsApp] Media upload response:', JSON.stringify(uploadData));

    if (uploadData.id) return uploadData.id as string;
    console.error('[WhatsApp] Media upload failed:', uploadData.error?.message);
    return null;
  } catch (err) {
    console.error('[WhatsApp] Media upload error:', err);
    return null;
  }
}

/**
 * Send a single WhatsApp Cloud API message (text or media).
 * `to` is the Channel ID or recipient phone number in E.164 format.
 */
async function sendWhatsAppMessage(
  accessToken: string,
  phoneNumberId: string,
  to: string,
  messageObject: Record<string, unknown>,
): Promise<{ messageId: string } | null> {
  try {
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      ...messageObject,
    };

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    const data = await res.json();
    console.log('[WhatsApp] Message send response:', JSON.stringify(data));

    if (data.messages?.[0]?.id) {
      return { messageId: data.messages[0].id as string };
    }
    console.error('[WhatsApp] Message send failed:', data.error?.message || JSON.stringify(data));
    return null;
  } catch (err) {
    console.error('[WhatsApp] Message send error:', err);
    return null;
  }
}

/**
 * Publish content to a WhatsApp Channel.
 *
 * @param accessToken   - WhatsApp Cloud API access token (system user or WABA token)
 * @param phoneNumberId - The phone number ID associated with the WABA
 * @param channelId     - The WhatsApp Channel ID to publish to (platformUserId)
 * @param caption       - Text content / caption
 * @param imageUrls     - Optional image URLs (each sent as a separate image message)
 * @param videoUrl      - Optional video URL
 */
export async function publishToWhatsApp(
  accessToken: string,
  phoneNumberId: string,
  channelId: string,
  caption: string,
  imageUrls: string[] = [],
  videoUrl?: string,
): Promise<PublishResult> {
  try {
    const isVideo = !!videoUrl;
    const hasImages = imageUrls.length > 0;

    // ── Video message ──
    if (isVideo) {
      const mediaId = await uploadWhatsAppMedia(accessToken, phoneNumberId, videoUrl!, 'video');
      if (!mediaId) {
        return { success: false, error: 'WhatsApp: video upload failed. Check the file format (MP4 required).' };
      }

      const result = await sendWhatsAppMessage(accessToken, phoneNumberId, channelId, {
        type: 'video',
        video: {
          id: mediaId,
          caption: caption.slice(0, 1024), // WhatsApp caption limit
        },
      });

      if (!result) return { success: false, error: 'WhatsApp: video message send failed.' };
      return { success: true, platformPostId: result.messageId };
    }

    // ── Image message(s) ──
    if (hasImages) {
      let firstMessageId: string | undefined;

      for (const [index, imageUrl] of imageUrls.entries()) {
        const mediaId = await uploadWhatsAppMedia(accessToken, phoneNumberId, imageUrl, 'image');
        if (!mediaId) {
          console.error(`[WhatsApp] Image ${index + 1} upload failed — skipping`);
          continue;
        }

        // Only the first image gets the caption; subsequent images are captionless
        const result = await sendWhatsAppMessage(accessToken, phoneNumberId, channelId, {
          type: 'image',
          image: {
            id: mediaId,
            ...(index === 0 && caption ? { caption: caption.slice(0, 1024) } : {}),
          },
        });

        if (result && !firstMessageId) firstMessageId = result.messageId;
        // Small delay between messages to preserve order
        if (imageUrls.length > 1 && index < imageUrls.length - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      if (!firstMessageId) {
        return { success: false, error: 'WhatsApp: all image uploads failed.' };
      }
      return { success: true, platformPostId: firstMessageId };
    }

    // ── Text-only message ──
    if (!caption.trim()) {
      return { success: false, error: 'WhatsApp: message content is empty.' };
    }

    const result = await sendWhatsAppMessage(accessToken, phoneNumberId, channelId, {
      type: 'text',
      text: {
        body: caption.slice(0, 4096), // WhatsApp text message limit
        preview_url: false,
      },
    });

    if (!result) return { success: false, error: 'WhatsApp: text message send failed.' };
    return { success: true, platformPostId: result.messageId };
  } catch (err) {
    return { success: false, error: `WhatsApp error: ${err}` };
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
    if (!uploadUrl || !assetUrn) return null;

    const media = await fetchMediaBuffer(imageUrl);
    if (!media) return null;

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
    if (!uploadUrl || !assetUrn) return null;

    const media = await fetchMediaBuffer(videoUrl);
    if (!media) return null;

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
  if (data.id) return { success: true, platformPostId: data.id };
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
      if (urn) assetUrns.push(urn);
    }

    return postToLinkedIn(accessToken, author, caption, assetUrns, assetUrns.length > 0 ? 'IMAGE' : 'NONE');
  } catch (err) {
    return { success: false, error: `LinkedIn error: ${err}` };
  }
}

// ============================================================
// LINKEDIN PAGE
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
      if (assetUrn) return postToLinkedIn(accessToken, author, caption, [], 'VIDEO', assetUrn);
      console.warn('[LinkedIn Page] Video upload failed — falling back to text-only');
    }

    const assetUrns: string[] = [];
    for (const url of imageUrls) {
      const urn = await uploadImageToLinkedIn(accessToken, author, url);
      if (urn) assetUrns.push(urn);
    }

    return postToLinkedIn(accessToken, author, caption, assetUrns, assetUrns.length > 0 ? 'IMAGE' : 'NONE');
  } catch (err) {
    return { success: false, error: `LinkedIn Page error: ${err}` };
  }
}

// ============================================================
// TIKTOK
// ============================================================

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
    return { accessToken: data.access_token, refreshToken: data.refresh_token || refreshToken };
  } catch (err) {
    console.error('[TikTok] Token refresh error:', err);
    return null;
  }
}

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

    if (res.status === 401) return 'auth_error';

    const data = await res.json();
    const errCode = data.error?.code || '';
    if (errCode === 'access_token_invalid') return 'auth_error';
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
  tiktokSettings?: {
    title?: string;
    privacyLevel?: string;
    allowComment?: boolean;
    allowDuet?: boolean;
    allowStitch?: boolean;
    brandOrganicToggle?: boolean;
    brandContentToggle?: boolean;
    isAIGC?: boolean;
    caption?: string;
    publishMethod?: string;
  },
): Promise<PublishResult> {
  if (!videoUrl) {
    return { success: false, error: 'TikTok requires a video. Create a video post first.' };
  }

  try {
    let token = accessToken;
    let creatorInfoResult = await getTikTokCreatorInfo(token);

    if (creatorInfoResult === 'auth_error') {
      if (!refreshToken) {
        return { success: false, error: 'TikTok session expired. Please reconnect your TikTok account in Connections.' };
      }
      const refreshed = await refreshTikTokToken(refreshToken);
      if (!refreshed) {
        return { success: false, error: 'TikTok session expired and could not be refreshed. Please reconnect your TikTok account in Connections.' };
      }
      if (onTokenRefresh) await onTokenRefresh(refreshed.accessToken, refreshed.refreshToken);
      token = refreshed.accessToken;
      creatorInfoResult = await getTikTokCreatorInfo(token);
    }

    if (!creatorInfoResult || creatorInfoResult === 'auth_error') {
      return { success: false, error: 'Could not verify TikTok account. Please reconnect your TikTok account in Connections.' };
    }

    const creatorInfo = creatorInfoResult;
    const playableUrl = /\.(?:mp4|mov|webm)(?:[/?#]|$)/i.test(videoUrl)
      ? videoUrl
      : `${videoUrl.endsWith('/') ? videoUrl : `${videoUrl}/`}video.mp4`;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.nativpost.com';
    const tiktokVideoUrl = `${appUrl}/api/media/proxy?url=${encodeURIComponent(playableUrl)}`;

    const isInbox = tiktokSettings?.publishMethod === 'INBOX';
    const privacyLevel = (!isInbox && tiktokSettings?.privacyLevel)
      ? tiktokSettings.privacyLevel
      : 'PUBLIC';

    const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: ((tiktokSettings as any)?.caption || tiktokSettings?.title || caption).slice(0, 2200),
          privacy_level: privacyLevel,
          disable_comment: isInbox ? false : (tiktokSettings?.allowComment === true ? false : creatorInfo.commentDisabled),
          disable_duet: isInbox ? false : (tiktokSettings?.allowDuet === true ? false : creatorInfo.duetDisabled),
          disable_stitch: isInbox ? false : (tiktokSettings?.allowStitch === true ? false : creatorInfo.stitchDisabled),
          brand_organic_toggle: tiktokSettings?.brandOrganicToggle ?? false,
          brand_content_toggle: tiktokSettings?.brandContentToggle ?? false,
          is_aigc: tiktokSettings?.isAIGC ?? false,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: tiktokVideoUrl,
        },
      }),
    });

    const initData = await initRes.json() as {
      data?: { publish_id?: string };
      error?: { code?: string; message?: string };
    };

    const publishId = initData.data?.publish_id;
    const errCode = initData.error?.code || '';
    const errMsg = initData.error?.message || '';
    const isUnauditedWarning = errCode === 'unaudited_client_can_only_post_to_private_accounts';

    if (!publishId && !isUnauditedWarning) {
      console.error('[TikTok] Init failed:', JSON.stringify(initData));
      if (errCode === 'spam_risk_too_many_posts' || errMsg.includes('cap')) {
        return { success: false, error: 'TikTok posting limit reached for today. Please try again tomorrow.' };
      }
      if (errCode === 'access_token_invalid' || initRes.status === 401) {
        return { success: false, error: 'TikTok session expired. Please reconnect your TikTok account in Connections.' };
      }
      return { success: false, error: errMsg || errCode || 'TikTok upload failed. Please try again.' };
    }

    return { success: true, platformPostId: publishId || 'tiktok-pending' };
  } catch (err) {
    return { success: false, error: `TikTok error: ${err}` };
  }
}

// ============================================================
// YOUTUBE
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
      console.error('[YouTube] Token refresh failed:', await res.text());
      return null;
    }
    const data = await res.json() as { access_token: string; refresh_token?: string };
    return { accessToken: data.access_token, refreshToken: data.refresh_token || refreshToken };
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
  if (!videoUrl) return { success: false, error: 'YouTube requires a video. Create a video post first.' };

  const result = await _uploadToYouTube(accessToken, caption, videoUrl, title, thumbnailUrl);

  if (!result.success && result.error?.includes('authentication') && refreshToken) {
    const refreshed = await refreshGoogleToken(refreshToken);
    if (!refreshed) {
      return { success: false, error: 'YouTube token expired and could not be refreshed. Please reconnect your YouTube account.' };
    }
    if (onTokenRefresh) await onTokenRefresh(refreshed.accessToken, refreshed.refreshToken);
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
    const playableUrl = /\.(?:mp4|mov|webm)(?:[/?#]|$)/i.test(videoUrl)
      ? videoUrl
      : `${videoUrl.endsWith('/') ? videoUrl : `${videoUrl}/`}video.mp4`;

    const headRes = await fetch(playableUrl, { method: 'HEAD' });
    const contentLength = headRes.headers.get('content-length');
    const contentType = headRes.headers.get('content-type') || 'video/mp4';
    if (!headRes.ok) return { success: false, error: 'Could not access video file for YouTube upload.' };

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
            title: (title ?? caption.split('\n')[0] ?? caption).slice(0, 100),
            description: caption,
            categoryId: '22',
          },
          status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
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
        if (reason === 'forbidden') return { success: false, error: 'YouTube upload forbidden. Ensure the channel is verified and has upload permissions.' };
        if (reason === 'uploadLimitExceeded') return { success: false, error: 'YouTube daily upload limit reached. Try again tomorrow.' };
        if (message?.includes('authentication') || metaRes.status === 401) return { success: false, error: `YouTube: ${message || 'Request had invalid authentication credentials.'}` };
        if (message) return { success: false, error: `YouTube: ${message}` };
      } catch { /* JSON parse failed */ }
      return { success: false, error: `YouTube metadata upload failed (${metaRes.status}).` };
    }

    const resumableUrl = metaRes.headers.get('location');
    if (!resumableUrl) return { success: false, error: 'YouTube did not return a resumable upload URL.' };

    const videoRes = await fetch(playableUrl);
    if (!videoRes.ok || !videoRes.body) return { success: false, error: 'Failed to fetch video from CDN for upload.' };

    const uploadRes = await fetch(resumableUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': contentType,
        ...(contentLength ? { 'Content-Length': contentLength } : {}),
      },
      body: videoRes.body,
      // @ts-expect-error — Required for streaming in Node fetch
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

      if (thumbnailUrl) {
        const uploadThumbnail = async (attempt: number): Promise<void> => {
          try {
            const thumbRes = await fetch(thumbnailUrl);
            if (!thumbRes.ok) { console.warn(`[YouTube] Could not fetch thumbnail`); return; }
            const thumbBuffer = await thumbRes.arrayBuffer();
            const thumbContentType = thumbRes.headers.get('content-type') || 'image/jpeg';
            const setRes = await fetch(
              `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}&uploadType=media`,
              {
                method: 'POST',
                headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': thumbContentType },
                body: thumbBuffer,
              },
            );
            if (setRes.ok) {
              console.log(`[YouTube] Thumbnail set for ${videoId}`);
            } else {
              const errBody = await setRes.text();
              if (attempt <= 3 && (setRes.status === 400 || setRes.status === 503 || errBody.includes('processing'))) {
                const delayMs = attempt * 15_000;
                console.warn(`[YouTube] Thumbnail attempt ${attempt} failed — retrying in ${delayMs / 1000}s...`);
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

      return {
        success: true,
        platformPostId: videoId,
        permalink: `https://www.youtube.com/watch?v=${videoId}`,
      };
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
          body: JSON.stringify({ media_type: 'IMAGE', image_url: url, is_carousel_item: true, access_token: accessToken }),
        });
        const childData = await childRes.json();
        if (childData.id) childIds.push(childData.id);
      }
      if (childIds.length < 2) return { success: false, error: 'Threads carousel needs at least 2 images.' };

      const carouselRes = await fetch(`https://graph.threads.net/v1.0/${userId}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_type: 'CAROUSEL', children: childIds, text: caption, access_token: accessToken }),
      });
      const carouselData = await carouselRes.json();
      if (!carouselData.id) return { success: false, error: carouselData.error?.message || 'Threads carousel failed' };

      const publishRes = await fetch(`https://graph.threads.net/v1.0/${userId}/threads_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: carouselData.id, access_token: accessToken }),
      });
      const publishData = await publishRes.json();
      if (publishData.id) return { success: true, platformPostId: publishData.id };
      return { success: false, error: publishData.error?.message || 'Threads carousel publish failed' };
    }

    const containerBody: Record<string, string> = { media_type: mediaType, text: caption, access_token: accessToken };
    if (mediaUrl && mediaType === 'IMAGE') containerBody.image_url = mediaUrl;
    if (mediaUrl && mediaType === 'VIDEO') containerBody.video_url = mediaUrl;

    const containerRes = await fetch(`https://graph.threads.net/v1.0/${userId}/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(containerBody),
    });
    const containerData = await containerRes.json();
    if (!containerData.id) return { success: false, error: containerData.error?.message || 'Threads container failed' };

    const publishRes = await fetch(`https://graph.threads.net/v1.0/${userId}/threads_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: containerData.id, access_token: accessToken }),
    });
    const publishData = await publishRes.json();
    if (publishData.id) return { success: true, platformPostId: publishData.id };
    return { success: false, error: publishData.error?.message || 'Threads publish failed' };
  } catch (err) {
    return { success: false, error: `Threads error: ${err}` };
  }
}

// ============================================================
// PINTEREST
// ============================================================

async function refreshPinterestToken(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const clientId = process.env.PINTEREST_CLIENT_ID;
  const clientSecret = process.env.PINTEREST_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch('https://api.pinterest.com/v5/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
    });
    if (!res.ok) { console.error('[Pinterest] Token refresh failed:', res.status, await res.text()); return null; }
    const data = await res.json();
    return { accessToken: data.access_token, refreshToken: data.refresh_token || refreshToken };
  } catch (err) {
    console.error('[Pinterest] Token refresh error:', err);
    return null;
  }
}

async function uploadVideoToPinterest(accessToken: string, videoUrl: string): Promise<string | null> {
  const registerRes = await fetch('https://api.pinterest.com/v5/media', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_type: 'video' }),
  });
  if (!registerRes.ok) { console.error('[Pinterest] Video register failed:', registerRes.status, await registerRes.text()); return null; }

  const registerData = await registerRes.json();
  const mediaId: string | undefined = registerData.media_id;
  const uploadUrl: string | undefined = registerData.upload_url;
  const uploadParameters: Record<string, string> | undefined = registerData.upload_parameters;
  if (!mediaId || !uploadUrl) { console.error('[Pinterest] Video register missing media_id/upload_url:', registerData); return null; }

  const playableUrl = /\.(?:mp4|mov|webm)(?:[/?#]|$)/i.test(videoUrl)
    ? videoUrl
    : `${videoUrl.endsWith('/') ? videoUrl : `${videoUrl}/`}video.mp4`;

  const videoRes = await fetch(playableUrl);
  if (!videoRes.ok) { console.error('[Pinterest] Could not fetch video for upload:', videoRes.status); return null; }
  const videoBuffer = await videoRes.arrayBuffer();
  const contentType = videoRes.headers.get('content-type') || 'video/mp4';

  let uploadRes: Response;
  if (uploadParameters && Object.keys(uploadParameters).length > 0) {
    const form = new FormData();
    for (const [key, value] of Object.entries(uploadParameters)) form.append(key, value);
    form.append('file', new Blob([videoBuffer], { type: contentType }), 'video.mp4');
    uploadRes = await fetch(uploadUrl, { method: 'POST', body: form });
  } else {
    uploadRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: videoBuffer });
  }
  if (!uploadRes.ok) { console.error('[Pinterest] Video PUT failed:', uploadRes.status, (await uploadRes.text()).slice(0, 300)); return null; }

  for (let attempt = 1; attempt <= 30; attempt++) {
    await new Promise(r => setTimeout(r, 3000));
    const statusRes = await fetch(`https://api.pinterest.com/v5/media/${mediaId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!statusRes.ok) continue;
    const statusData = await statusRes.json();
    const status: string = statusData.status || '';
    if (status === 'succeeded') return mediaId;
    if (status === 'failed') { console.error('[Pinterest] Video processing failed:', JSON.stringify(statusData)); return null; }
  }
  console.error('[Pinterest] Video processing timed out');
  return null;
}

async function publishPinToBoard(
  accessToken: string,
  boardId: string,
  caption: string,
  imageUrls: string[],
  videoUrl?: string,
): Promise<PublishResult> {
  if (videoUrl && imageUrls.length === 0) {
    const mediaId = await uploadVideoToPinterest(accessToken, videoUrl);
    if (!mediaId) return { success: false, error: 'Pinterest: video upload or processing failed.' };
    const pinRes = await fetch('https://api.pinterest.com/v5/pins', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: caption.slice(0, 100),
        description: caption.slice(0, 800),
        board_id: boardId,
        media_source: { source_type: 'video_id', media_id: mediaId, cover_image_key_frame_time: '00:00:01.000' },
      }),
    });
    const pinData = await pinRes.json();
    if (pinData.id) return { success: true, platformPostId: pinData.id };
    return { success: false, error: pinData.message || 'Pinterest video pin creation failed' };
  }

  if (imageUrls.length === 0) return { success: false, error: 'Pinterest requires at least one image or a video.' };

  let firstPinId: string | undefined;
  for (const [index, url] of imageUrls.entries()) {
    const pinRes = await fetch('https://api.pinterest.com/v5/pins', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: caption.slice(0, 100),
        description: caption.slice(0, 800),
        board_id: boardId,
        media_source: { source_type: 'image_url', url },
      }),
    });
    const pinData = await pinRes.json();
    if (index === 0) firstPinId = pinData.id;
  }

  if (firstPinId) return { success: true, platformPostId: firstPinId };
  return { success: false, error: 'Pinterest: all pin creations failed' };
}

export async function publishToPinterest(
  accessToken: string,
  caption: string,
  imageUrls: string[] = [],
  videoUrl?: string,
  refreshToken?: string,
  onTokenRefresh?: (newAccessToken: string, newRefreshToken: string) => Promise<void>,
): Promise<PublishResult> {
  try {
    if (imageUrls.length === 0 && !videoUrl) {
      return { success: false, error: 'Pinterest requires an image or video. Text-only posts cannot be published to Pinterest.' };
    }

    let token = accessToken;
    let boardsRes = await fetch('https://api.pinterest.com/v5/boards?page_size=25', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (boardsRes.status === 401 && refreshToken) {
      const refreshed = await refreshPinterestToken(refreshToken);
      if (refreshed) {
        token = refreshed.accessToken;
        if (onTokenRefresh) await onTokenRefresh(refreshed.accessToken, refreshed.refreshToken);
        boardsRes = await fetch('https://api.pinterest.com/v5/boards?page_size=25', { headers: { Authorization: `Bearer ${token}` } });
      }
    }

    if (!boardsRes.ok) {
      if (boardsRes.status === 401) return { success: false, error: 'Pinterest session expired. Please reconnect your Pinterest account in Connections.' };
      return { success: false, error: `Pinterest API error (${boardsRes.status}). Please try again.` };
    }

    const boardsData = await boardsRes.json();
    const boards = boardsData.items ?? boardsData.data ?? [];
    const boardId = boards[0]?.id;
    if (!boardId) return { success: false, error: 'No Pinterest boards found. Please create a board on Pinterest first, then try again.' };

    return publishPinToBoard(token, boardId, caption, imageUrls, videoUrl);
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
  oauthToken?: string,
  oauthTokenSecret?: string,
  platformSpecific?: Record<string, unknown>,
  platformUsername?: string,
): Promise<PublishResult> {
  // Slideshow is a multi-image carousel, not a video — route to images path.
  const isVideo = isVideoContentType(contentType) && contentType !== 'slideshow';
  const verticalVideo = isVideo ? graphicUrls[0] : undefined;
  const squareVideo = isVideo ? (graphicUrls[1] || graphicUrls[0]) : undefined;
  let imageUrls = isVideo ? [] : graphicUrls;

  // ── Platform-aware aspect-ratio cropping ──────────────────────────────
  // Feed platforms show tall images cropped to fit the timeline. We smart-
  // crop slides to the recommended ratio using Cloudinary's g_auto (content-
  // aware crop) so the main subject is preserved. Stories / Reels / TikTok
  // use the original 9:16 ratio.
  //  - IG/FB/LinkedIn feed → 4:5 (1080×1350)
  //  - X/Twitter          → 2:3 (1080×1620)
  //  - TikTok/YT          → 9:16 (as-is, no crop)
  if (!isVideo && imageUrls.length > 0) {
    const aspectTargets: Record<string, { w: number; h: number }> = {
      instagram:   { w: 1080, h: 1350 },
      facebook:    { w: 1080, h: 1350 },
      linkedin:    { w: 1080, h: 1350 },
      linkedin_page: { w: 1080, h: 1350 },
      twitter:     { w: 1080, h: 1620 },
    };
    const target = aspectTargets[platform as string];
    if (target) {
      imageUrls = imageUrls.map(url => cropToAspect(url, target.w, target.h));
    }
  }

  const ps = platformSpecific as Record<string, unknown> | undefined;
  const youtubeObj = ps?.youtube as Record<string, string> | undefined;
  const youtubeTitle: string | undefined = youtubeObj?.title || (typeof ps?.title === 'string' ? ps.title : undefined) || undefined;
  const youtubeThumbnail: string | undefined = youtubeObj?.thumbnailUrl || undefined;

  // WhatsApp requires an extra field: phoneNumberId stored in platformSpecific
  const whatsappPhoneNumberId = (ps?.whatsapp as Record<string, string> | undefined)?.phoneNumberId
    || (typeof ps?.phoneNumberId === 'string' ? ps.phoneNumberId : undefined);

  switch (platform) {
    case 'facebook':
      return publishToFacebook(
        accessToken,
        platformUserId,
        caption,
        imageUrls,
        squareVideo,
        onTokenRefresh ? (newToken: string) => onTokenRefresh(newToken, refreshToken || '') : undefined,
      );

    case 'instagram':
      return publishToInstagram(accessToken, platformUserId, caption, imageUrls, verticalVideo);

    case 'linkedin':
      return publishToLinkedIn(accessToken, platformUserId, caption, imageUrls, squareVideo);

    case 'linkedin_page':
      return publishToLinkedInPage(accessToken, platformUserId, caption, imageUrls, squareVideo);

    case 'twitter':
      return publishToTwitter(accessToken, caption, imageUrls, verticalVideo, refreshToken, onTokenRefresh, oauthToken, oauthTokenSecret, platformUsername);

    case 'tiktok': {
      const tiktokSettings = ps?.tiktok as {
        title?: string; privacyLevel?: string; allowComment?: boolean;
        allowDuet?: boolean; allowStitch?: boolean;
        brandOrganicToggle?: boolean; brandContentToggle?: boolean;
        isAIGC?: boolean; caption?: string; publishMethod?: string;
      } | undefined;
      return publishToTikTok(accessToken, caption, squareVideo ?? verticalVideo, refreshToken, onTokenRefresh, tiktokSettings);
    }

    case 'youtube':
      return publishToYouTube(accessToken, caption, squareVideo ?? verticalVideo, refreshToken, onTokenRefresh, youtubeTitle, youtubeThumbnail);

    case 'threads':
      return publishToThreads(accessToken, platformUserId, caption, imageUrls, verticalVideo);

    case 'snapchat':
      return publishToSnapchat(accessToken, imageUrls, squareVideo ?? verticalVideo, platformUserId);

    case 'pinterest':
      return publishToPinterest(accessToken, caption, imageUrls, squareVideo ?? verticalVideo, refreshToken, onTokenRefresh);

    case 'whatsapp': {
      if (!whatsappPhoneNumberId) {
        return {
          success: false,
          error: 'WhatsApp: phone number ID is missing. Please reconnect your WhatsApp account.',
        };
      }
      return publishToWhatsApp(
        accessToken,
        whatsappPhoneNumberId,
        platformUserId, // channelId stored as platformUserId
        caption,
        imageUrls,
        squareVideo ?? verticalVideo,
      );
    }

    default:
      return { success: false, error: `Unsupported platform: ${platform}` };
  }
}