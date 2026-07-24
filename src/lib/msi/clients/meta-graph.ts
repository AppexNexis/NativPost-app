// Instagram Graph API publishing mechanics (docs §Execution Layer; Phase 0 §2,
// strategy `official_api`). Mirrors the proven flow in lib/social-publish.ts —
// create a media container → poll status → media_publish → resolve permalink —
// but isolated behind an injectable `fetch` so it is unit-testable with no
// network. The DB/credential wiring lives in ./meta-client; this file is only
// the HTTP conversation with graph.facebook.com.

const GRAPH = 'https://graph.facebook.com/v21.0';

export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

export type InstagramPublishInput = {
  igUserId: string;
  accessToken: string;
  caption: string;
  mediaUrl: string;
  isVideo: boolean;
};

export type ContainerStatus = 'FINISHED' | 'PROCESSING';

/** Raise a descriptive error from a Graph API error body (the adapter maps → failed). */
function graphError(context: string, status: number, body: any): Error {
  const apiMsg = body?.error?.message || body?.error_message || 'unknown error';
  return new Error(`Instagram ${context} failed (${status}): ${apiMsg}`);
}

async function readJson(res: {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
}, context: string): Promise<any> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw graphError(context, res.status, body);
  }
  return body;
}

/** Create the media container; returns its creation id. */
export async function createMediaContainer(
  input: InstagramPublishInput,
  fetchImpl: FetchLike,
): Promise<string> {
  const body: Record<string, unknown> = {
    caption: input.caption,
    access_token: input.accessToken,
  };
  if (input.isVideo) {
    body.media_type = 'REELS';
    body.video_url = input.mediaUrl;
    body.share_to_feed = true;
  } else {
    body.image_url = input.mediaUrl;
  }

  const res = await fetchImpl(`${GRAPH}/${input.igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await readJson(res, 'container creation');
  if (!data.id) {
    throw new Error('Instagram container creation returned no id');
  }
  return data.id as string;
}

/**
 * One-shot container status check (no polling loop). Returns FINISHED (ready to
 * publish) or PROCESSING (check again next tick); throws on ERROR/EXPIRED. The
 * worker's confirmation pass calls this once per tick.
 */
export async function checkContainerStatus(
  containerId: string,
  accessToken: string,
  fetchImpl: FetchLike,
): Promise<ContainerStatus> {
  const res = await fetchImpl(
    `${GRAPH}/${containerId}?fields=status_code&access_token=${accessToken}`,
  );
  const data = await readJson(res, 'container status');
  const code: string = data.status_code || '';
  if (code === 'FINISHED') {
    return 'FINISHED';
  }
  if (code === 'ERROR' || code === 'EXPIRED') {
    throw new Error(`Instagram container processing ${code}`);
  }
  return 'PROCESSING';
}

/** Publish a ready container; returns the published media id. */
export async function publishContainer(
  igUserId: string,
  creationId: string,
  accessToken: string,
  fetchImpl: FetchLike,
): Promise<string> {
  const res = await fetchImpl(`${GRAPH}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: creationId, access_token: accessToken }),
  });
  const data = await readJson(res, 'publish');
  if (!data.id) {
    throw new Error('Instagram publish returned no media id');
  }
  return data.id as string;
}

/** Best-effort permalink resolution — never fails the publish. */
export async function resolvePermalink(
  mediaId: string,
  accessToken: string,
  fetchImpl: FetchLike,
): Promise<string | null> {
  try {
    const res = await fetchImpl(
      `${GRAPH}/${mediaId}?fields=permalink&access_token=${accessToken}`,
    );
    if (!res.ok) {
      return null;
    }
    const data = await res.json().catch(() => ({}));
    return typeof data.permalink === 'string' ? data.permalink : null;
  } catch {
    return null;
  }
}

