import { describe, expect, it } from 'vitest';

import type { FetchLike } from './tiktok-content';
import { fetchPublishStatus, initVideoPublish, probeTikTok } from './tiktok-content';

function oneResponse(body: any, ok = true, status = 200): FetchLike {
  return async () => ({ ok, status, json: async () => body });
}

const input = { accessToken: 'tok', caption: 'hi', videoUrl: 'https://app/proxy?url=v.mp4' };

describe('initVideoPublish', () => {
  it('returns the publish_id', async () => {
    const id = await initVideoPublish(input, oneResponse({ data: { publish_id: 'pub-1' } }));
    expect(id).toBe('pub-1');
  });

  it('throws a descriptive error when init has no publish_id', async () => {
    const fetchImpl = oneResponse(
      { error: { code: 'spam_risk_too_many_posts', message: 'daily cap reached' } },
      false,
      400,
    );
    await expect(initVideoPublish(input, fetchImpl)).rejects.toThrow(
      /TikTok init failed \(400\): daily cap reached/,
    );
  });
});

describe('fetchPublishStatus', () => {
  it('returns COMPLETE with the aweme post id', async () => {
    const res = await fetchPublishStatus(
      'pub-1',
      'tok',
      oneResponse({ data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: ['aweme-9'] } }),
    );
    expect(res).toEqual({ status: 'COMPLETE', postId: 'aweme-9' });
  });

  it('returns PROCESSING while still uploading', async () => {
    const res = await fetchPublishStatus(
      'pub-1',
      'tok',
      oneResponse({ data: { status: 'PROCESSING_UPLOAD' } }),
    );
    expect(res).toEqual({ status: 'PROCESSING' });
  });

  it('throws when the status is FAILED (never billed as false success)', async () => {
    await expect(
      fetchPublishStatus(
        'pub-1',
        'tok',
        oneResponse({ data: { status: 'FAILED', fail_reason: 'bad video' } }),
      ),
    ).rejects.toThrow(/TikTok publish failed: bad video/);
  });

  it('returns a null post id when COMPLETE omits the aweme id', async () => {
    const res = await fetchPublishStatus(
      'pub-1',
      'tok',
      oneResponse({ data: { status: 'PUBLISH_COMPLETE' } }),
    );
    expect(res).toEqual({ status: 'COMPLETE', postId: null });
  });
});

describe('probeTikTok', () => {
  it('valid token → identity', async () => {
    const res = await probeTikTok(
      'tok',
      oneResponse({ data: { user: { open_id: 'o1', display_name: 'Brand' } } }),
    );
    expect(res.tokenValid).toBe(true);
    expect(res.identity).toBe('Brand');
  });

  it('invalid token', async () => {
    const res = await probeTikTok('bad', oneResponse({ error: { message: 'invalid' } }, false, 401));
    expect(res.tokenValid).toBe(false);
  });
});
