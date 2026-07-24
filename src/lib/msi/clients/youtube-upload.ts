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
  fetchImpl: FetchLike,
): Promise<string> {
  const res = await fetchImpl(`${UPLOAD}?uploadType=resumable&part=snippet,status`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Upload-Content-Type': contentType,
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

/** PUT the video bytes to the session URI; returns the created video id. */
export async function uploadVideoBytes(
  sessionUri: string,
  bytes: ArrayBuffer,
  contentType: string,
  accessToken: string,
  fetchImpl: FetchLike,
): Promise<string> {
  const res = await fetchImpl(sessionUri, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': contentType },
    body: bytes,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.id) {
    throw new Error(
      `YouTube video upload failed (${res.status}): ${data?.error?.message || 'no video id'}`,
    );
  }
  return data.id as string;
}

/** Full upload: fetch bytes → initiate session → PUT → returns the video id. */
export async function publishToYouTube(
  params: {
    accessToken: string;
    videoUrl: string;
    title: string;
    description: string;
    privacyStatus?: YouTubePrivacy;
  },
  fetchImpl: FetchLike,
): Promise<string> {
  const media = await fetchImpl(params.videoUrl);
  if (!media.ok) {
    throw new Error(`YouTube media fetch failed (${media.status})`);
  }
  const bytes = await media.arrayBuffer();
  const metadata = buildVideoMetadata({
    title: params.title,
    description: params.description,
    privacyStatus: params.privacyStatus ?? 'public',
  });
  const sessionUri = await initiateResumableUpload(
    metadata,
    params.accessToken,
    'video/mp4',
    fetchImpl,
  );
  return uploadVideoBytes(sessionUri, bytes, 'video/mp4', params.accessToken, fetchImpl);
}
