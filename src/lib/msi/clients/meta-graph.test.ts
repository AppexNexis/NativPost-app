import { describe, expect, it } from 'vitest';

import type { FetchLike } from './meta-graph';
import { publishInstagramMedia } from './meta-graph';

// A scripted fake fetch: matches by URL substring, returns queued responses.
function fakeFetch(
  routes: Array<{ match: string; ok?: boolean; status?: number; body: any }>,
): { fetchImpl: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const queue = [...routes];
  const fetchImpl: FetchLike = async (url) => {
    calls.push(url);
    const idx = queue.findIndex(r => url.includes(r.match));
    if (idx === -1) {
      throw new Error(`unexpected fetch: ${url}`);
    }
    const [route] = queue.splice(idx, 1);
    return {
      ok: route!.ok ?? true,
      status: route!.status ?? 200,
      json: async () => route!.body,
    };
  };
  return { fetchImpl, calls };
}

const noSleep = async () => {};

describe('publishInstagramMedia', () => {
  it('publishes an image: container → publish → permalink', async () => {
    const { fetchImpl, calls } = fakeFetch([
      { match: '/ig-1/media', body: { id: 'container-1' } },
      { match: 'status_code', body: { status_code: 'FINISHED' } },
      { match: '/ig-1/media_publish', body: { id: 'media-99' } },
      { match: 'fields=permalink', body: { permalink: 'https://instagram.com/p/abc' } },
    ]);

    const res = await publishInstagramMedia(
      {
        igUserId: 'ig-1',
        accessToken: 'tok',
        caption: 'hi',
        mediaUrl: 'https://cdn/img.jpg',
        isVideo: false,
      },
      fetchImpl,
      { attempts: 3, delayMs: 0, sleep: noSleep },
    );

    expect(res).toEqual({ mediaId: 'media-99', permalink: 'https://instagram.com/p/abc' });
    // Container creation must be the image path, not REELS.
    expect(calls[0]).toContain('/ig-1/media');
  });

  it('waits for a REELS container to finish processing before publishing', async () => {
    const { fetchImpl } = fakeFetch([
      { match: '/ig-1/media', body: { id: 'c-2' } },
      { match: 'status_code', body: { status_code: 'IN_PROGRESS' } },
      { match: 'status_code', body: { status_code: 'FINISHED' } },
      { match: '/ig-1/media_publish', body: { id: 'media-2' } },
      { match: 'fields=permalink', body: { permalink: 'https://instagram.com/reel/x' } },
    ]);

    const res = await publishInstagramMedia(
      {
        igUserId: 'ig-1',
        accessToken: 'tok',
        caption: 'reel',
        mediaUrl: 'https://cdn/v.mp4',
        isVideo: true,
      },
      fetchImpl,
      { attempts: 5, delayMs: 0, sleep: noSleep },
    );

    expect(res.mediaId).toBe('media-2');
  });

  it('throws a descriptive error when the Graph API rejects the container', async () => {
    const { fetchImpl } = fakeFetch([
      {
        match: '/ig-1/media',
        ok: false,
        status: 400,
        body: { error: { message: 'Media URL unreachable' } },
      },
    ]);

    await expect(
      publishInstagramMedia(
        {
          igUserId: 'ig-1',
          accessToken: 'tok',
          caption: 'x',
          mediaUrl: 'https://cdn/bad.jpg',
          isVideo: false,
        },
        fetchImpl,
        { attempts: 1, delayMs: 0, sleep: noSleep },
      ),
    ).rejects.toThrow(/container creation failed \(400\): Media URL unreachable/);
  });

  it('throws when a container never finishes (timeout)', async () => {
    const { fetchImpl } = fakeFetch([
      { match: '/ig-1/media', body: { id: 'c-3' } },
      { match: 'status_code', body: { status_code: 'IN_PROGRESS' } },
      { match: 'status_code', body: { status_code: 'IN_PROGRESS' } },
    ]);

    await expect(
      publishInstagramMedia(
        {
          igUserId: 'ig-1',
          accessToken: 'tok',
          caption: 'x',
          mediaUrl: 'https://cdn/v.mp4',
          isVideo: true,
        },
        fetchImpl,
        { attempts: 2, delayMs: 0, sleep: noSleep },
      ),
    ).rejects.toThrow(/timed out/);
  });

  it('still succeeds when permalink resolution fails', async () => {
    const { fetchImpl } = fakeFetch([
      { match: '/ig-1/media', body: { id: 'c-4' } },
      { match: 'status_code', body: { status_code: 'FINISHED' } },
      { match: '/ig-1/media_publish', body: { id: 'media-4' } },
      { match: 'fields=permalink', ok: false, status: 500, body: {} },
    ]);

    const res = await publishInstagramMedia(
      {
        igUserId: 'ig-1',
        accessToken: 'tok',
        caption: 'x',
        mediaUrl: 'https://cdn/img.jpg',
        isVideo: false,
      },
      fetchImpl,
      { attempts: 2, delayMs: 0, sleep: noSleep },
    );

    expect(res).toEqual({ mediaId: 'media-4', permalink: null });
  });
});
