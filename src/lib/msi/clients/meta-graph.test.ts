import { describe, expect, it } from 'vitest';

import type { FetchLike } from './meta-graph';
import {
  checkContainerStatus,
  createCarouselContainer,
  createCarouselItemContainer,
  createMediaContainer,
  publishContainer,
  resolvePermalink,
} from './meta-graph';

function oneResponse(body: any, ok = true, status = 200): FetchLike {
  return async () => ({ ok, status, json: async () => body });
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
