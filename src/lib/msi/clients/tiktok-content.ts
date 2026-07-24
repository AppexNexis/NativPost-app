// TikTok Content Posting API mechanics (docs §Execution Layer; strategy
// `official_api`). Mirrors the proven flow in lib/social-publish.ts — video/init
// (PULL_FROM_URL) → poll status/fetch until PUBLISH_COMPLETE — behind an
// injectable `fetch` so it is unit-testable with no network. DB/credential
// wiring lives in ./tiktok-client; this file is only the HTTP conversation.
//
// TikTok's shape differs from Instagram's on purpose (this is the second client
// that validates the PlatformClient interface isn't IG-specific): init returns
// an operation `publish_id`, then the public post id (`aweme`) only appears once
// status reaches PUBLISH_COMPLETE.

const TIKTOK = 'https://open.tiktokapis.com/v2';

export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

export type TikTokPublishInput = {
  accessToken: string;
  caption: string;
  videoUrl: string;
  privacyLevel?: string;
};

export type TikTokStatus =
  | { status: 'PROCESSING' }
  | { status: 'COMPLETE'; postId: string | null };

/** Kick off a video publish (PULL_FROM_URL). Returns the operation publish_id. */
export async function initVideoPublish(
  input: TikTokPublishInput,
  fetchImpl: FetchLike,
): Promise<string> {
  const res = await fetchImpl(`${TIKTOK}/post/publish/video/init/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      post_info: {
        title: input.caption.slice(0, 2200),
        privacy_level: input.privacyLevel ?? 'PUBLIC',
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: input.videoUrl,
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  const publishId: string | undefined = data?.data?.publish_id;
  if (!publishId) {
    const code = data?.error?.code || '';
    const msg = data?.error?.message || '';
    throw new Error(`TikTok init failed (${res.status}): ${msg || code || 'no publish_id'}`);
  }
  return publishId;
}

/**
 * One-shot publish-status check (no polling loop). Returns COMPLETE (+ aweme
 * post id) or PROCESSING; throws on FAILED. The worker's confirmation pass calls
 * this once per tick, so a still-processing video is never billed as a false
 * success and never blocks the tick.
 */
export async function fetchPublishStatus(
  publishId: string,
  accessToken: string,
  fetchImpl: FetchLike,
): Promise<TikTokStatus> {
  const res = await fetchImpl(`${TIKTOK}/post/publish/status/fetch/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ publish_id: publishId }),
  });
  const data = await res.json().catch(() => ({}));
  const status: string = data?.data?.status || '';
  if (status === 'PUBLISH_COMPLETE') {
    return {
      status: 'COMPLETE',
      postId: data?.data?.publicaly_available_post_id?.[0] ?? null,
    };
  }
  if (status === 'FAILED') {
    throw new Error(
      `TikTok publish failed: ${data?.data?.fail_reason || 'unknown reason'}`,
    );
  }
  return { status: 'PROCESSING' };
}
