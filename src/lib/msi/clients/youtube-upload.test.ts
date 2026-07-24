import { describe, expect, it } from 'vitest';

import type { FetchLike } from './youtube-upload';
import {
  buildVideoMetadata,
  initiateResumableUpload,
  probeTotalSize,
  uploadChunk,
} from './youtube-upload';

// Fake fetch matching by URL substring; supports json, arrayBuffer, and headers.
function fakeFetch(
  routes: Array<{
    match: string;
    ok?: boolean;
    status?: number;
    body?: any;
    headers?: Record<string, string>;
    bytes?: number;
  }>,
): FetchLike {
  const queue = [...routes];
  return async (url) => {
    const idx = queue.findIndex(r => url.includes(r.match));
    if (idx === -1) {
      throw new Error(`unexpected fetch: ${url}`);
    }
    const [route] = queue.splice(idx, 1);
    const headers = route!.headers ?? {};
    return {
      ok: route!.ok ?? true,
      status: route!.status ?? 200,
      json: async () => route!.body ?? {},
      arrayBuffer: async () => new ArrayBuffer(route!.bytes ?? 8),
      headers: {
        get: (name: string) => headers[name.toLowerCase()] ?? null,
      },
    };
  };
}

describe('buildVideoMetadata', () => {
  it('caps the title at 100 chars and sets privacy', () => {
    const meta = buildVideoMetadata({
      title: 'x'.repeat(150),
      description: 'full caption',
      privacyStatus: 'public',
    });
    expect(meta.snippet.title).toHaveLength(100);
    expect(meta.status.privacyStatus).toBe('public');
  });
});

describe('probeTotalSize', () => {
  it('reads the total from a Content-Range on a 206', async () => {
    const fetchImpl = fakeFetch([
      { match: 'v.mp4', status: 206, headers: { 'content-range': 'bytes 0-0/50000' } },
    ]);
    expect(await probeTotalSize('https://cdn/v.mp4', fetchImpl)).toBe(50000);
  });

  it('falls back to Content-Length when range is ignored (200)', async () => {
    const fetchImpl = fakeFetch([
      { match: 'v.mp4', status: 200, headers: { 'content-length': '1234' } },
    ]);
    expect(await probeTotalSize('https://cdn/v.mp4', fetchImpl)).toBe(1234);
  });

  it('throws when the size cannot be determined', async () => {
    const fetchImpl = fakeFetch([{ match: 'v.mp4', status: 200, headers: {} }]);
    await expect(probeTotalSize('https://cdn/v.mp4', fetchImpl)).rejects.toThrow(/size unknown/);
  });
});

describe('initiateResumableUpload', () => {
  it('returns the session URI from the Location header', async () => {
    const meta = buildVideoMetadata({ title: 't', description: 'd', privacyStatus: 'public' });
    const fetchImpl = fakeFetch([
      { match: 'uploadType=resumable', headers: { location: 'https://upload/session/1' } },
    ]);
    expect(await initiateResumableUpload(meta, 'tok', 'video/mp4', 5000, fetchImpl)).toBe(
      'https://upload/session/1',
    );
  });

  it('throws when no Location is returned', async () => {
    const meta = buildVideoMetadata({ title: 't', description: 'd', privacyStatus: 'public' });
    const fetchImpl = fakeFetch([{ match: 'uploadType=resumable', headers: {} }]);
    await expect(initiateResumableUpload(meta, 'tok', 'video/mp4', 5000, fetchImpl)).rejects.toThrow(
      /did not return a resumable upload URL/,
    );
  });
});

describe('uploadChunk', () => {
  it('returns the next offset from the Range header on a 308', async () => {
    const fetchImpl = fakeFetch([
      { match: 'session/1', status: 308, headers: { range: 'bytes=0-8388607' } },
    ]);
    const res = await uploadChunk('https://upload/session/1', new ArrayBuffer(8388608), 0, 20000000, 'tok', fetchImpl);
    expect(res).toEqual({ status: 'incomplete', nextOffset: 8388608 });
  });

  it('returns the video id on a 200 completion', async () => {
    const fetchImpl = fakeFetch([{ match: 'session/1', status: 200, body: { id: 'vid-9' } }]);
    const res = await uploadChunk('https://upload/session/1', new ArrayBuffer(1000), 8388608, 8389608, 'tok', fetchImpl);
    expect(res).toEqual({ status: 'complete', videoId: 'vid-9' });
  });

  it('throws a descriptive error on a rejected chunk', async () => {
    const fetchImpl = fakeFetch([
      { match: 'session/1', ok: false, status: 400, body: { error: { message: 'bad range' } } },
    ]);
    await expect(
      uploadChunk('https://upload/session/1', new ArrayBuffer(1000), 0, 1000, 'tok', fetchImpl),
    ).rejects.toThrow(/YouTube chunk upload failed \(400\): bad range/);
  });
});
