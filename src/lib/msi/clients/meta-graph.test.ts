import { describe, expect, it } from 'vitest';

import type { FetchLike } from './meta-graph';
import {
  checkContainerStatus,
  createCarouselContainer,
  createCarouselItemContainer,
  createMediaContainer,
  probeInstagram,
  publishContainer,
  resolvePermalink,
} from './meta-graph';

function oneResponse(body: any, ok = true, status = 200): FetchLike {
  return async () => ({ ok, status, json: async () => body });
}

// Scripted fake fetch matching by URL substring (for multi-call flows).
function fakeFetch(
  routes: Array<{ match: string; ok?: boolean; status?: number; body: any }>,
): { fetchImpl: FetchLike } {
  const queue = [...routes];
  const fetchImpl: FetchLike = async (url) => {
    const idx = queue.findIndex(r => url.includes(r.match));
    if (idx === -1) {
      throw new Error(`unexpected fetch: ${url}`);
    }
    const [route] = queue.splice(idx, 1);
    return { ok: route!.ok ?? true, status: route!.status ?? 200, json: async () => route!.body };
  };
  return { fetchImpl };
}

const input = {
  igUserId: 'ig-1',
  accessToken: 'tok',
  caption: 'hi',
  mediaUrl: 'https://cdn/img.jpg',
  isVideo: false,
};

describe('createMediaContainer', () => {
  it('returns the container id (image path)', async () => {
    let sentBody: any;
    const fetchImpl: FetchLike = async (_url, init) => {
      sentBody = JSON.parse(init!.body!);
      return { ok: true, status: 200, json: async () => ({ id: 'container-1' }) };
    };
    const id = await createMediaContainer(input, fetchImpl);
    expect(id).toBe('container-1');
    expect(sentBody.image_url).toBe('https://cdn/img.jpg');
    expect(sentBody.media_type).toBeUndefined();
  });

  it('uses REELS for video', async () => {
    let sentBody: any;
    const fetchImpl: FetchLike = async (_url, init) => {
      sentBody = JSON.parse(init!.body!);
      return { ok: true, status: 200, json: async () => ({ id: 'c-2' }) };
    };
    await createMediaContainer({ ...input, isVideo: true, mediaUrl: 'https://cdn/v.mp4' }, fetchImpl);
    expect(sentBody.media_type).toBe('REELS');
    expect(sentBody.video_url).toBe('https://cdn/v.mp4');
  });

  it('throws a descriptive error when the Graph API rejects it', async () => {
    const fetchImpl = oneResponse({ error: { message: 'Media URL unreachable' } }, false, 400);
    await expect(createMediaContainer(input, fetchImpl)).rejects.toThrow(
      /container creation failed \(400\): Media URL unreachable/,
    );
  });
});

describe('carousel containers', () => {
  it('creates a child item container flagged is_carousel_item', async () => {
    let sentBody: any;
    const fetchImpl: FetchLike = async (_url, init) => {
      sentBody = JSON.parse(init!.body!);
      return { ok: true, status: 200, json: async () => ({ id: 'child-1' }) };
    };
    const id = await createCarouselItemContainer('ig-1', 'https://cdn/1.jpg', 'tok', fetchImpl);
    expect(id).toBe('child-1');
    expect(sentBody).toMatchObject({ image_url: 'https://cdn/1.jpg', is_carousel_item: true });
  });

  it('creates the parent carousel container from child ids', async () => {
    let sentBody: any;
    const fetchImpl: FetchLike = async (_url, init) => {
      sentBody = JSON.parse(init!.body!);
      return { ok: true, status: 200, json: async () => ({ id: 'carousel-1' }) };
    };
    const id = await createCarouselContainer('ig-1', ['child-1', 'child-2'], 'hi', 'tok', fetchImpl);
    expect(id).toBe('carousel-1');
    expect(sentBody).toMatchObject({
      media_type: 'CAROUSEL',
      children: ['child-1', 'child-2'],
      caption: 'hi',
    });
  });

  it('throws when carousel creation returns no id', async () => {
    await expect(
      createCarouselContainer('ig-1', ['c'], 'x', 'tok', oneResponse({ error: { message: 'bad' } }, false, 400)),
    ).rejects.toThrow(/carousel container creation failed \(400\): bad/);
  });
});

describe('checkContainerStatus', () => {
  it('maps FINISHED / in-progress / ERROR', async () => {
    expect(
      await checkContainerStatus('c', 'tok', oneResponse({ status_code: 'FINISHED' })),
    ).toBe('FINISHED');
    expect(
      await checkContainerStatus('c', 'tok', oneResponse({ status_code: 'IN_PROGRESS' })),
    ).toBe('PROCESSING');
    await expect(
      checkContainerStatus('c', 'tok', oneResponse({ status_code: 'ERROR' })),
    ).rejects.toThrow(/processing ERROR/);
  });
});

describe('probeInstagram', () => {
  it('reports reachable + valid token + identity + permissions', async () => {
    const fetchImpl = fakeFetch([
      { match: 'fields=id,username', body: { id: 'ig-1', username: 'brand' } },
      {
        match: '/me/permissions',
        body: {
          data: [
            { permission: 'instagram_content_publish', status: 'granted' },
            { permission: 'instagram_basic', status: 'declined' },
          ],
        },
      },
    ]).fetchImpl;

    const d = await probeInstagram('ig-1', 'tok', fetchImpl);
    expect(d.reachable).toBe(true);
    expect(d.tokenValid).toBe(true);
    expect(d.identity).toBe('@brand');
    expect(d.permissions).toEqual([
      { name: 'instagram_content_publish', granted: true },
      { name: 'instagram_basic', granted: false },
    ]);
  });

  it('flags an invalid token (reachable but rejected)', async () => {
    const fetchImpl = fakeFetch([
      { match: 'fields=id,username', ok: false, status: 400, body: { error: { code: 190, message: 'Invalid OAuth token' } } },
    ]).fetchImpl;
    const d = await probeInstagram('ig-1', 'bad', fetchImpl);
    expect(d.reachable).toBe(true);
    expect(d.tokenValid).toBe(false);
    expect(d.detail).toMatch(/Invalid OAuth token/);
  });
});

describe('publishContainer + resolvePermalink', () => {
  it('publishes a ready container and returns the media id', async () => {
    const id = await publishContainer('ig-1', 'c-1', 'tok', oneResponse({ id: 'media-99' }));
    expect(id).toBe('media-99');
  });

  it('resolves a permalink, and returns null when it fails', async () => {
    expect(
      await resolvePermalink('media-99', 'tok', oneResponse({ permalink: 'https://ig/p/x' })),
    ).toBe('https://ig/p/x');
    expect(await resolvePermalink('media-99', 'tok', oneResponse({}, false, 500))).toBeNull();
  });
});

describe('host selection by token type', () => {
  const recorder = () => {
    const urls: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => ({ id: 'c1', user_id: '178', username: 'brand' }) };
    };
    return { urls, fetchImpl };
  };

  it('uses graph.instagram.com for an IGAA (Instagram Login) token', async () => {
    const { urls, fetchImpl } = recorder();
    await createMediaContainer(
      { igUserId: '178', accessToken: 'IGAAxyz', caption: 'hi', mediaUrl: 'https://cdn/i.jpg', isVideo: false },
      fetchImpl,
    );
    expect(urls[0]).toContain('graph.instagram.com/v21.0/178/media');
  });

  it('uses graph.facebook.com for an EAA (Facebook Login) token', async () => {
    const { urls, fetchImpl } = recorder();
    await createMediaContainer(
      { igUserId: '178', accessToken: 'EAAxyz', caption: 'hi', mediaUrl: 'https://cdn/i.jpg', isVideo: false },
      fetchImpl,
    );
    expect(urls[0]).toContain('graph.facebook.com/v21.0/178/media');
  });

  it('probes an IG-login token via /me on the IG host, with no permissions call', async () => {
    const { urls, fetchImpl } = recorder();
    const d = await probeInstagram('178', 'IGAAxyz', fetchImpl);
    expect(d.tokenValid).toBe(true);
    expect(d.identity).toBe('@brand');
    expect(urls[0]).toContain('graph.instagram.com/v21.0/me');
    expect(urls.some(u => u.includes('/me/permissions'))).toBe(false);
  });
});
