// Facebook Page publishing mechanics (docs §Execution Layer; strategy
// `official_api`). Mirrors the proven flow in lib/social-publish.ts. Facebook
// Graph is SYNCHRONOUS and pull-from-URL (video `file_url`, photos `url`) — no
// byte upload, no async processing poll — so the client publishes in one
// `execute` and has no `checkStatus`. Injectable `fetch` for unit tests.

const GRAPH = 'https://graph.facebook.com/v21.0';

export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

export type FacebookPostKind = 'post' | 'photo';

/** Public permalink for a returned FB id (pure). Single photos differ from feed. */
export function fbPermalink(
  pageId: string,
  id: string,
  kind: FacebookPostKind,
): string {
  if (kind === 'photo') {
    return `https://www.facebook.com/${pageId}/photos/${id}`;
  }
  const idx = id.indexOf('_');
  const suffix = idx >= 0 ? id.slice(idx + 1) : id;
  return `https://www.facebook.com/${pageId}/posts/${suffix}`;
}

async function fbPost(
  url: string,
  body: Record<string, unknown>,
  fetchImpl: FetchLike,
  context: string,
): Promise<any> {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw new Error(
      `Facebook ${context} failed (${res.status}): ${data?.error?.message || 'unknown error'}`,
    );
  }
  return data;
}

export async function postFacebookVideo(
  pageId: string,
  videoUrl: string,
  caption: string,
  accessToken: string,
  fetchImpl: FetchLike,
): Promise<string> {
  const data = await fbPost(
    `${GRAPH}/${pageId}/videos`,
    { file_url: videoUrl, description: caption, access_token: accessToken },
    fetchImpl,
    'video post',
  );
  if (!data.id) {
    throw new Error('Facebook video post returned no id');
  }
  return data.id as string;
}

export async function postFacebookText(
  pageId: string,
  caption: string,
  accessToken: string,
  fetchImpl: FetchLike,
): Promise<string> {
  const data = await fbPost(
    `${GRAPH}/${pageId}/feed`,
    { message: caption, access_token: accessToken },
    fetchImpl,
    'text post',
  );
  if (!data.id) {
    throw new Error('Facebook text post returned no id');
  }
  return data.id as string;
}

export async function postFacebookPhoto(
  pageId: string,
  imageUrl: string,
  caption: string,
  accessToken: string,
  fetchImpl: FetchLike,
): Promise<string> {
  const data = await fbPost(
    `${GRAPH}/${pageId}/photos`,
    { url: imageUrl, caption, access_token: accessToken },
    fetchImpl,
    'image post',
  );
  if (!data.id) {
    throw new Error('Facebook image post returned no id');
  }
  return data.id as string;
}

/** Upload an unpublished photo (for carousels); returns its media fbid. */
export async function uploadUnpublishedPhoto(
  pageId: string,
  imageUrl: string,
  accessToken: string,
  fetchImpl: FetchLike,
): Promise<string> {
  const data = await fbPost(
    `${GRAPH}/${pageId}/photos`,
    { url: imageUrl, published: false, access_token: accessToken },
    fetchImpl,
    'carousel photo upload',
  );
  if (!data.id) {
    throw new Error('Facebook carousel photo upload returned no id');
  }
  return data.id as string;
}

export async function postFacebookCarousel(
  pageId: string,
  caption: string,
  photoIds: string[],
  accessToken: string,
  fetchImpl: FetchLike,
): Promise<string> {
  const data = await fbPost(
    `${GRAPH}/${pageId}/feed`,
    {
      message: caption,
      attached_media: photoIds.map(id => ({ media_fbid: id })),
      access_token: accessToken,
    },
    fetchImpl,
    'carousel post',
  );
  if (!data.id) {
    throw new Error('Facebook carousel post returned no id');
  }
  return data.id as string;
}

/** Route to the right Facebook post type; returns the id + its permalink kind. */
export async function publishToFacebook(
  params: {
    pageId: string;
    accessToken: string;
    caption: string;
    mediaUrls: string[];
    isVideo: boolean;
  },
  fetchImpl: FetchLike,
): Promise<{ postId: string; kind: FacebookPostKind }> {
  const { pageId, accessToken, caption, mediaUrls, isVideo } = params;

  if (isVideo && mediaUrls[0]) {
    return { postId: await postFacebookVideo(pageId, mediaUrls[0], caption, accessToken, fetchImpl), kind: 'post' };
  }
  if (mediaUrls.length === 0) {
    return { postId: await postFacebookText(pageId, caption, accessToken, fetchImpl), kind: 'post' };
  }
  if (mediaUrls.length === 1) {
    return { postId: await postFacebookPhoto(pageId, mediaUrls[0]!, caption, accessToken, fetchImpl), kind: 'photo' };
  }

  const photoIds: string[] = [];
  for (const url of mediaUrls) {
    photoIds.push(await uploadUnpublishedPhoto(pageId, url, accessToken, fetchImpl));
  }
  return { postId: await postFacebookCarousel(pageId, caption, photoIds, accessToken, fetchImpl), kind: 'post' };
}
