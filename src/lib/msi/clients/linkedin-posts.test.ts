import { describe, expect, it } from 'vitest';

import type { FetchLike } from './linkedin-posts';
import {
  buildRegisterUploadBody,
  buildUgcPostBody,
  normalizeAuthorUrn,
  parseRegisterUpload,
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
