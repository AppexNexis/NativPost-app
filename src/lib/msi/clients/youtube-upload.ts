// YouTube Data API v3 upload mechanics (docs §Execution Layer; strategy
// `official_api`). Mirrors the proven flow in lib/social-publish.ts: initiate a
// resumable session (returns the session URI in the Location header) → PUT the
// video bytes → get the video id. Synchronous, byte upload (YouTube has no
// pull-from-URL). Injectable `fetch` — this FetchLike exposes response headers
// (for Location) and arrayBuffer (for the media bytes).

const UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos';

export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | ArrayBuffer | Uint8Array;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<any>;
  arrayBuffer: () => Promise<ArrayBuffer>;
  headers: { get: (name: string) => string | null };
}>;

export type YouTubePrivacy = 'public' | 'unlisted' | 'private';

// Upload one 8 MB slice per tick (a multiple of 256 KB, as YouTube requires for
// non-final chunks). Bounds each tick's work so a large video never blocks.
export const CHUNK_SIZE = 8 * 1024 * 1024;

/** Build the videos.insert metadata (pure). Title is capped at YouTube's 100. */
export function buildVideoMetadata(params: {
  title: string;
  description: string;
  privacyStatus: YouTubePrivacy;
}) {
  return {
    snippet: {
      title: params.title.slice(0, 100),
      description: params.description,
      categoryId: '22', // People & Blogs
    },
    status: {
      privacyStatus: params.privacyStatus,
      selfDeclaredMadeForKids: false,
    },
  };
}

/** Initiate a resumable upload session; returns the session URI (Location). */
export async function initiateResumableUpload(
  metadata: ReturnType<typeof buildVideoMetadata>,
  accessToken: string,
  contentType: string,
  totalSize: number,
  fetchImpl: FetchLike,
): Promise<string> {
  const res = await fetchImpl(`${UPLOAD}?uploadType=resumable&part=snippet,status`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Upload-Content-Type': contentType,
      'X-Upload-Content-Length': String(totalSize),
    },
    body: JSON.stringify(metadata),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      `YouTube resumable session failed (${res.status}): ${data?.error?.message || 'no session'}`,
    );
  }
  const sessionUri = res.headers.get('location') ?? res.headers.get('Location');
  if (!sessionUri) {
    throw new Error('YouTube did not return a resumable upload URL');
  }
  return sessionUri;
}

/** Discover the source video's total byte size via a 1-byte range probe. */
export async function probeTotalSize(
  videoUrl: string,
  fetchImpl: FetchLike,
): Promise<number> {
  const res = await fetchImpl(videoUrl, { method: 'GET', headers: { Range: 'bytes=0-0' } });
  if (!res.ok && res.status !== 206) {
    throw new Error(`YouTube source probe failed (${res.status})`);
  }
  // 206 → Content-Range "bytes 0-0/{total}"; 200 (range ignored) → Content-Length is the total.
  const contentRange = res.headers.get('content-range');
  if (contentRange && contentRange.includes('/')) {
    const total = Number(contentRange.split('/')[1]);
    if (Number.isFinite(total) && total > 0) {
      return total;
    }
  }
  const contentLength = Number(res.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > 0) {
    return contentLength;
  }
  throw new Error('YouTube source size unknown (does the CDN support range requests?)');
}

/** Fetch a byte range [start, end] (inclusive) of the source video. */
export async function fetchByteRange(
  videoUrl: string,
  start: number,
  end: number,
  fetchImpl: FetchLike,
): Promise<ArrayBuffer> {
  const res = await fetchImpl(videoUrl, {
    method: 'GET',
    headers: { Range: `bytes=${start}-${end}` },
  });
  if (!res.ok && res.status !== 206) {
    throw new Error(`YouTube source range fetch failed (${res.status})`);
  }
  return res.arrayBuffer();
}

export type ChunkResult =
  | { status: 'incomplete'; nextOffset: number }
  | { status: 'complete'; videoId: string };

/**
 * PUT one chunk with a Content-Range header. YouTube replies 308 (Resume
 * Incomplete, with a `Range: bytes=0-{last}` header) until the final chunk, then
 * 200/201 with the video resource.
 */
export async function uploadChunk(
  sessionUri: string,
  chunk: ArrayBuffer,
  start: number,
  total: number,
  accessToken: string,
  fetchImpl: FetchLike,
): Promise<ChunkResult> {
  const len = chunk.byteLength;
  const res = await fetchImpl(sessionUri, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Length': String(len),
      'Content-Range': `bytes ${start}-${start + len - 1}/${total}`,
    },
    body: chunk,
  });

  if (res.status === 308) {
    // "Range: bytes=0-{lastByteReceived}" → resume after it.
    const range = res.headers.get('range');
    const last = range ? Number(range.split('-')[1]) : Number.NaN;
    const nextOffset = Number.isFinite(last) ? last + 1 : start + len;
    return { status: 'incomplete', nextOffset };
  }

  const data = await res.json().catch(() => ({}));
  if ((res.ok || res.status === 201) && data?.id) {
    return { status: 'complete', videoId: data.id as string };
  }
  throw new Error(
    `YouTube chunk upload failed (${res.status}): ${data?.error?.message || 'no video id'}`,
  );
}
