import {  randomBytes, createCipheriv } from 'node:crypto';
import type { PublishResult } from './social-publish';

export async function publishToSnapchat(
  accessToken: string,
  imageUrls: string[] = [],
  videoUrl?: string,
  platformUserId?: string,
): Promise<PublishResult> {
  try {
    if (imageUrls.length === 0 && !videoUrl) {
      return { success: false, error: 'Snapchat requires an image or video.' };
    }

    if (!platformUserId) {
      return { success: false, error: 'Snapchat: no public profile ID found. Please reconnect your Snapchat account.' };
    }

    const mediaUrl = videoUrl || imageUrls[0];
    const isVideo = !!videoUrl;

    // Step 1: Fetch the media
    const mediaRes = await fetch(mediaUrl!);
    if (!mediaRes.ok) {
      return { success: false, error: 'Snapchat: could not fetch media file' };
    }
    const mediaBuffer = Buffer.from(await mediaRes.arrayBuffer());

    // Step 2: Encrypt the media (required by Snapchat)
    const key = randomBytes(32);
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', key, iv);
    const encryptedBuffer = Buffer.concat([cipher.update(mediaBuffer), cipher.final()]);
    const key64 = key.toString('base64');
    const iv64 = iv.toString('base64');

    // Step 3: Create media container
    const createRes = await fetch(
      `https://businessapi.snapchat.com/v1/public_profiles/${platformUserId}/media`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: isVideo ? 'VIDEO' : 'IMAGE',
          name: `nativpost-${Date.now()}`,
          key: key64,
          iv: iv64,
        }),
      },
    );

    if (!createRes.ok) {
      const err = await createRes.text();
      console.error('[Snapchat] Media container creation failed:', err);
      return { success: false, error: `Snapchat media creation failed (${createRes.status})` };
    }

    const createData = await createRes.json();
    const mediaId = createData.media_id;
    const addPath = createData.add_path;

    if (!mediaId || !addPath) {
      console.error('[Snapchat] No media_id returned:', JSON.stringify(createData));
      return { success: false, error: 'Snapchat: media container returned no ID' };
    }

    // Step 4: Upload encrypted media via multipart
    const formData = new FormData();
    formData.append('action', 'ADD');
    formData.append('part_number', '1');
    formData.append('file', new Blob([encryptedBuffer]), isVideo ? 'video.enc.mp4' : 'image.enc.jpg');

    const uploadRes = await fetch(`https://businessapi.snapchat.com${addPath}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      console.error('[Snapchat] Media upload failed:', err);
      return { success: false, error: `Snapchat upload failed (${uploadRes.status})` };
    }

    // Step 5: Finalize the upload
    const finalizeForm = new FormData();
    finalizeForm.append('action', 'FINALIZE');

    const finalizeRes = await fetch(`https://businessapi.snapchat.com${addPath}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: finalizeForm,
    });

    if (!finalizeRes.ok) {
      const err = await finalizeRes.text();
      console.error('[Snapchat] Finalize failed:', err);
      return { success: false, error: `Snapchat finalize failed (${finalizeRes.status})` };
    }

    // Step 6: Post as story
    const storyRes = await fetch(
      `https://businessapi.snapchat.com/v1/public_profiles/${platformUserId}/stories`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ media_id: mediaId }),
      },
    );

    if (!storyRes.ok) {
      const err = await storyRes.text();
      console.error('[Snapchat] Story post failed:', err);
      return { success: false, error: `Snapchat story post failed (${storyRes.status})` };
    }

    // const storyData = await storyRes.json();
    console.log('[Snapchat] Story published successfully');
    return { success: true, platformPostId: mediaId };

  } catch (err) {
    return { success: false, error: `Snapchat error: ${err}` };
  }
}