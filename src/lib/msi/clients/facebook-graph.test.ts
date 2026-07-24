import { describe, expect, it } from 'vitest';

import type { FetchLike } from './facebook-graph';
import { fbPermalink, probeFacebookPage, publishToFacebook } from './facebook-graph';

function fakeFetch(
  routes: Array<{ match: string; ok?: boolean; status?: number; body?: any }>,
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
      json: async () => route!.body ?? {},
    };
  };
  return { fetchImpl, calls };
}

describe('fbPermalink', () => {
  it('links single photos and feed posts differently', () => {
    expect(fbPermalink('123', '999', 'photo')).toBe('https://www.facebook.com/123/photos/999');
    // feed ids are "{pageId}_{suffix}" → /posts/{suffix}
    expect(fbPermalink('123', '123_456', 'post')).toBe('https://www.facebook.com/123/posts/456');
  });
});

describe('publishToFacebook routing', () => {
  it('posts a video via /videos (pull-from-URL)', async () => {
    const { fetchImpl, calls } = fakeFetch([{ match: '/videos', body: { id: 'v-1' } }]);
    const res = await publishToFacebook(
      { pageId: '1', accessToken: 't', caption: 'hi', mediaUrls: ['https://cdn/v.mp4'], isVideo: true },
      fetchImpl,
    );
    expect(res).toEqual({ postId: 'v-1', kind: 'post' });
    expect(calls[0]).toContain('/1/videos');
  });

  it('posts text via /feed when there is no media', async () => {
    const { fetchImpl } = fakeFetch([{ match: '/feed', body: { id: '1_2' } }]);
    const res = await publishToFacebook(
      { pageId: '1', accessToken: 't', caption: 'hi', mediaUrls: [], isVideo: false },
      fetchImpl,
    );
    expect(res).toEqual({ postId: '1_2', kind: 'post' });
  });

  it('posts a single image via /photos', async () => {
    const { fetchImpl } = fakeFetch([{ match: '/photos', body: { id: 'p-1' } }]);
    const res = await publishToFacebook(
      { pageId: '1', accessToken: 't', caption: 'hi', mediaUrls: ['https://cdn/1.jpg'], isVideo: false },
      fetchImpl,
    );
    expect(res).toEqual({ postId: 'p-1', kind: 'photo' });
  });

  it('uploads unpublished photos then posts a carousel via /feed', async () => {
    const { fetchImpl, calls } = fakeFetch([
      { match: '/photos', body: { id: 'ph-1' } },
      { match: '/photos', body: { id: 'ph-2' } },
      { match: '/feed', body: { id: '1_carousel' } },
    ]);
    const res = await publishToFacebook(
      {
        pageId: '1',
        accessToken: 't',
        caption: 'hi',
        mediaUrls: ['https://cdn/1.jpg', 'https://cdn/2.jpg'],
        isVideo: false,
      },
      fetchImpl,
    );
    expect(res).toEqual({ postId: '1_carousel', kind: 'post' });
    expect(calls.filter(c => c.includes('/photos'))).toHaveLength(2);
  });

  it('throws a descriptive error when the Graph API rejects the post', async () => {
    const { fetchImpl } = fakeFetch([
      { match: '/photos', ok: false, status: 400, body: { error: { message: 'bad image' } } },
    ]);
    await expect(
      publishToFacebook(
        { pageId: '1', accessToken: 't', caption: 'hi', mediaUrls: ['https://cdn/1.jpg'], isVideo: false },
        fetchImpl,
      ),
    ).rejects.toThrow(/Facebook image post failed \(400\): bad image/);
  });
});

describe('probeFacebookPage', () => {
  it('reports reachable + valid token + identity + permissions', async () => {
    const { fetchImpl } = fakeFetch([
      { match: 'fields=id,name', body: { id: '123', name: 'Acme' } },
      {
        match: '/me/permissions',
        body: {
          data: [
            { permission: 'pages_manage_posts', status: 'granted' },
            { permission: 'pages_read_engagement', status: 'declined' },
          ],
        },
      },
    ]);
    const d = await probeFacebookPage('123', 'tok', fetchImpl);
    expect(d.reachable).toBe(true);
    expect(d.tokenValid).toBe(true);
    expect(d.identity).toBe('Acme (123)');
    expect(d.permissions?.find(p => p.name === 'pages_manage_posts')?.granted).toBe(true);
    expect(d.permissions?.find(p => p.name === 'pages_read_engagement')?.granted).toBe(false);
  });

  it('flags an invalid token', async () => {
    const { fetchImpl } = fakeFetch([
      { match: 'fields=id,name', ok: false, status: 400, body: { error: { message: 'Invalid token' } } },
    ]);
    const d = await probeFacebookPage('123', 'bad', fetchImpl);
    expect(d.tokenValid).toBe(false);
    expect(d.detail).toMatch(/Invalid token/);
  });
});
