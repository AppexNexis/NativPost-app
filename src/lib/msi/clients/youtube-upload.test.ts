import { describe, expect, it } from 'vitest';

import type { FetchLike } from './youtube-upload';
import { buildVideoMetadata, publishToYouTube } from './youtube-upload';

// Fake fetch matching by URL substring; supports json, arrayBuffer, and a
// Location response header (for the resumable session).
function fakeFetch(
  routes: Array<{ match: string; ok?: boolean; status?: number; body?: any; location?: string }>,
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
      arrayBuffer: async () => new ArrayBuffer(16),
      headers: { get: (name: string) => (name.toLowerCase() === 'location' ? route!.location ?? null : null) },
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
    expect(meta.snippet.description).toBe('full caption');
    expect(meta.status.privacyStatus).toBe('public');
    expect(meta.status.selfDeclaredMadeForKids).toBe(false);
  });
});

describe('publishToYouTube', () => {
  it('fetches bytes → initiates a session → PUTs → returns the video id', async () => {
    const fetchImpl = fakeFetch([
      { match: 'https://cdn/v.mp4' }, // media fetch (arrayBuffer)
      { match: 'uploadType=resumable', location: 'https://upload.googleapis.com/session/1' }, // initiate
      { match: 'https://upload.googleapis.com/session/1', body: { id: 'vid-123' } }, // PUT bytes
    ]);
    const id = await publishToYouTube(
      { accessToken: 'tok', videoUrl: 'https://cdn/v.mp4', title: 'hi', description: 'hi' },
      fetchImpl,
    );
    expect(id).toBe('vid-123');
  });

  it('throws when the resumable session returns no Location', async () => {
    const fetchImpl = fakeFetch([
      { match: 'https://cdn/v.mp4' },
      { match: 'uploadType=resumable' }, // no location
    ]);
    await expect(
      publishToYouTube(
        { accessToken: 'tok', videoUrl: 'https://cdn/v.mp4', title: 'hi', description: 'hi' },
        fetchImpl,
      ),
    ).rejects.toThrow(/did not return a resumable upload URL/);
  });

  it('throws a descriptive error when the byte upload is rejected', async () => {
    const fetchImpl = fakeFetch([
      { match: 'https://cdn/v.mp4' },
      { match: 'uploadType=resumable', location: 'https://upload/session/2' },
      { match: 'https://upload/session/2', ok: false, status: 400, body: { error: { message: 'invalid video' } } },
    ]);
    await expect(
      publishToYouTube(
        { accessToken: 'tok', videoUrl: 'https://cdn/v.mp4', title: 'hi', description: 'hi' },
        fetchImpl,
      ),
    ).rejects.toThrow(/YouTube video upload failed \(400\): invalid video/);
  });
});
