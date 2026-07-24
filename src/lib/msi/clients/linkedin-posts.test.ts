import { describe, expect, it } from 'vitest';

import type { FetchLike } from './linkedin-posts';
import {
  buildRegisterUploadBody,
  buildUgcPostBody,
  normalizeAuthorUrn,
  parseRegisterUpload,
  probeLinkedIn,
  publishToLinkedIn,
} from './linkedin-posts';

describe('normalizeAuthorUrn', () => {
  it('prefixes a bare id but passes URNs through', () => {
    expect(normalizeAuthorUrn('abc')).toBe('urn:li:person:abc');
    expect(normalizeAuthorUrn('urn:li:organization:99')).toBe('urn:li:organization:99');
  });
});

describe('buildRegisterUploadBody', () => {
  it('requests the recipe owned by the author', () => {
    const body = buildRegisterUploadBody('urn:li:person:1', 'urn:li:digitalmediaRecipe:feedshare-image');
    expect(body.registerUploadRequest.owner).toBe('urn:li:person:1');
    expect(body.registerUploadRequest.recipes).toEqual(['urn:li:digitalmediaRecipe:feedshare-image']);
  });
});

describe('parseRegisterUpload', () => {
  it('extracts the upload URL and asset URN', () => {
    const parsed = parseRegisterUpload({
      value: {
        asset: 'urn:li:digitalmediaAsset:xyz',
        uploadMechanism: {
          'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': {
            uploadUrl: 'https://upload/1',
          },
        },
      },
    });
    expect(parsed).toEqual({ uploadUrl: 'https://upload/1', assetUrn: 'urn:li:digitalmediaAsset:xyz' });
  });

  it('throws when the response is missing the mechanism', () => {
    expect(() => parseRegisterUpload({ value: {} })).toThrow(/no upload URL/);
  });
});

describe('buildUgcPostBody', () => {
  it('builds an IMAGE share with READY media', () => {
    const body = buildUgcPostBody({
      author: 'urn:li:person:1',
      caption: 'hi',
      category: 'IMAGE',
      assetUrns: ['urn:a', 'urn:b'],
    });
    const share = body.specificContent['com.linkedin.ugc.ShareContent'];
    expect(share.shareMediaCategory).toBe('IMAGE');
    expect(share.media).toEqual([
      { status: 'READY', media: 'urn:a' },
      { status: 'READY', media: 'urn:b' },
    ]);
  });

  it('builds a VIDEO share referencing the video asset', () => {
    const body = buildUgcPostBody({
      author: 'urn:li:person:1',
      caption: 'hi',
      category: 'VIDEO',
      assetUrns: ['urn:li:digitalmediaAsset:vid'],
    });
    const share = body.specificContent['com.linkedin.ugc.ShareContent'];
    expect(share.shareMediaCategory).toBe('VIDEO');
    expect(share.media).toEqual([{ status: 'READY', media: 'urn:li:digitalmediaAsset:vid' }]);
  });

  it('omits media for a NONE (text) share', () => {
    const body = buildUgcPostBody({ author: 'urn:li:person:1', caption: 'hi', category: 'NONE', assetUrns: [] });
    expect(body.specificContent['com.linkedin.ugc.ShareContent'].media).toBeUndefined();
  });
});

// Scripted fake fetch matching by URL substring, with json + arrayBuffer.
function fakeFetch(
  routes: Array<{ match: string; ok?: boolean; status?: number; body?: any }>,
): FetchLike {
  const queue = [...routes];
  return async (url) => {
    const idx = queue.findIndex(r => url.includes(r.match));
    if (idx === -1) {
      throw new Error(`unexpected fetch: ${url}`);
    }
    const [route] = queue.splice(idx, 1);
    return {
      ok: route!.ok ?? true,
      status: route!.status ?? 200,
      json: async () => route!.body ?? {},
      arrayBuffer: async () => new ArrayBuffer(8),
    };
  };
}

describe('publishToLinkedIn', () => {
  it('registers, uploads, and posts a single image → returns the post urn', async () => {
    const fetchImpl = fakeFetch([
      {
        match: '/assets?action=registerUpload',
        body: {
          value: {
            asset: 'urn:li:digitalmediaAsset:1',
            uploadMechanism: {
              'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': { uploadUrl: 'https://upload/1' },
            },
          },
        },
      },
      { match: 'https://cdn/img.jpg' }, // media fetch (arrayBuffer)
      { match: 'https://upload/1', status: 201 }, // PUT upload
      { match: '/ugcPosts', body: { id: 'urn:li:share:999' } },
    ]);

    const urn = await publishToLinkedIn(
      { accessToken: 'tok', authorUrn: 'urn:li:person:1', caption: 'hi', imageUrls: ['https://cdn/img.jpg'] },
      fetchImpl,
    );
    expect(urn).toBe('urn:li:share:999');
  });

  it('registers the video recipe, uploads, and posts a VIDEO', async () => {
    let registerBody: any;
    let postBody: any;
    const queue = [
      {
        match: '/assets?action=registerUpload',
        body: {
          value: {
            asset: 'urn:li:digitalmediaAsset:vid',
            uploadMechanism: {
              'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': { uploadUrl: 'https://upload/v' },
            },
          },
        },
      },
      { match: 'https://cdn/clip.mp4' }, // media fetch
      { match: 'https://upload/v', status: 201 }, // PUT upload
      { match: '/ugcPosts', body: { id: 'urn:li:share:vid1' } },
    ];
    const fetchImpl: FetchLike = async (url, init) => {
      const idx = queue.findIndex(r => url.includes(r.match));
      const [route] = queue.splice(idx, 1);
      if (url.includes('registerUpload')) {
        registerBody = JSON.parse(init!.body as string);
      }
      if (url.includes('/ugcPosts')) {
        postBody = JSON.parse(init!.body as string);
      }
      return {
        ok: (route as any)!.ok ?? true,
        status: (route as any)!.status ?? 200,
        json: async () => (route as any)!.body ?? {},
        arrayBuffer: async () => new ArrayBuffer(8),
      };
    };

    const urn = await publishToLinkedIn(
      { accessToken: 'tok', authorUrn: 'urn:li:person:1', caption: 'hi', videoUrl: 'https://cdn/clip.mp4' },
      fetchImpl,
    );
    expect(urn).toBe('urn:li:share:vid1');
    expect(registerBody.registerUploadRequest.recipes).toEqual(['urn:li:digitalmediaRecipe:feedshare-video']);
    expect(postBody.specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory).toBe('VIDEO');
  });

  it('throws a descriptive error when the post is rejected', async () => {
    const fetchImpl = fakeFetch([
      { match: '/ugcPosts', ok: false, status: 422, body: { message: 'duplicate content' } },
    ]);
    await expect(
      publishToLinkedIn(
        { accessToken: 'tok', authorUrn: 'urn:li:person:1', caption: 'hi', imageUrls: [] },
        fetchImpl,
      ),
    ).rejects.toThrow(/LinkedIn publish failed \(422\): duplicate content/);
  });
});

describe('probeLinkedIn', () => {
  it('valid token → identity', async () => {
    const fetchImpl = fakeFetch([
      { match: '/me', body: { id: 'abc', localizedFirstName: 'Jo', localizedLastName: 'Lee' } },
    ]);
    const d = await probeLinkedIn('tok', fetchImpl);
    expect(d.tokenValid).toBe(true);
    expect(d.identity).toBe('Jo Lee (abc)');
  });

  it('invalid token', async () => {
    const fetchImpl = fakeFetch([{ match: '/me', ok: false, status: 401, body: { message: 'invalid' } }]);
    const d = await probeLinkedIn('bad', fetchImpl);
    expect(d.tokenValid).toBe(false);
  });
});
