// LinkedIn UGC Posts mechanics (docs §Execution Layer; strategy `official_api`).
// Mirrors the proven flow in lib/social-publish.ts: registerUpload → PUT the
// media bytes to the returned URL → create a ugcPost referencing the asset URN.
//
// Unlike Instagram/TikTok, LinkedIn's older UGC API is SYNCHRONOUS — there is no
// async processing/poll step — so the client publishes in one `execute` and has
// no `checkStatus`. The request-shaping is pure (tested); the HTTP is a thin
// injectable-fetch layer. This FetchLike also exposes `arrayBuffer` because the
// media is uploaded as bytes (LinkedIn has no pull-from-URL).

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
}>;

const API = 'https://api.linkedin.com/v2';
const IMAGE_RECIPE = 'urn:li:digitalmediaRecipe:feedshare-image';
// LinkedIn feedshare supports up to 9 images per post.
export const MAX_LINKEDIN_IMAGES = 9;

export type LinkedInMediaCategory = 'NONE' | 'IMAGE' | 'VIDEO';

function jsonHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'X-Restli-Protocol-Version': '2.0.0',
  };
}

// ---------------------------------------------------------------------------
// Pure request/response shaping (unit-tested)
// ---------------------------------------------------------------------------

/** Ensure a bare id becomes a person URN; pass through existing URNs. */
export function normalizeAuthorUrn(authorUrn: string): string {
  return authorUrn.startsWith('urn:li:') ? authorUrn : `urn:li:person:${authorUrn}`;
}

export function buildRegisterUploadBody(authorUrn: string, recipe: string) {
  return {
    registerUploadRequest: {
      recipes: [recipe],
      owner: authorUrn,
      serviceRelationships: [
        { relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' },
      ],
    },
  };
}

export function parseRegisterUpload(data: any): { uploadUrl: string; assetUrn: string } {
  const uploadUrl
    = data?.value?.uploadMechanism?.[
      'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
    ]?.uploadUrl;
  const assetUrn = data?.value?.asset;
  if (!uploadUrl || !assetUrn) {
    throw new Error('LinkedIn register upload returned no upload URL / asset');
  }
  return { uploadUrl, assetUrn };
}

export function buildUgcPostBody(params: {
  author: string;
  caption: string;
  category: LinkedInMediaCategory;
  assetUrns: string[];
}) {
  const { author, caption, category, assetUrns } = params;
  return {
    author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: caption },
        shareMediaCategory: category,
        ...(category !== 'NONE' && assetUrns.length > 0
          ? { media: assetUrns.map(urn => ({ status: 'READY', media: urn })) }
          : {}),
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };
}

// ---------------------------------------------------------------------------
// HTTP (thin, injectable fetch)
// ---------------------------------------------------------------------------

/** Register an image upload; returns the upload URL + the asset URN. */
export async function registerImageUpload(
  authorUrn: string,
  accessToken: string,
  fetchImpl: FetchLike,
): Promise<{ uploadUrl: string; assetUrn: string }> {
  const res = await fetchImpl(`${API}/assets?action=registerUpload`, {
    method: 'POST',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(buildRegisterUploadBody(authorUrn, IMAGE_RECIPE)),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`LinkedIn register upload failed (${res.status})`);
  }
  return parseRegisterUpload(data);
}

/** Fetch the image bytes and PUT them to the pre-signed upload URL. */
export async function uploadImageAsset(
  uploadUrl: string,
  imageUrl: string,
  accessToken: string,
  fetchImpl: FetchLike,
): Promise<void> {
  const media = await fetchImpl(imageUrl);
  if (!media.ok) {
    throw new Error(`LinkedIn media fetch failed (${media.status})`);
  }
  const bytes = await media.arrayBuffer();
  const up = await fetchImpl(uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: bytes,
  });
  if (!up.ok && up.status !== 201) {
    throw new Error(`LinkedIn asset upload failed (${up.status})`);
  }
}

/** Create the ugcPost; returns the post URN. */
export async function createUgcPost(
  body: ReturnType<typeof buildUgcPostBody>,
  accessToken: string,
  fetchImpl: FetchLike,
): Promise<string> {
  const res = await fetchImpl(`${API}/ugcPosts`, {
    method: 'POST',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.id) {
    throw new Error(
      `LinkedIn publish failed (${res.status}): ${data?.message || 'no post id'}`,
    );
  }
  return data.id as string;
}

/** Full publish: upload each image, then create the post. Returns the post URN. */
export async function publishToLinkedIn(
  params: { accessToken: string; authorUrn: string; caption: string; imageUrls: string[] },
  fetchImpl: FetchLike,
): Promise<string> {
  const author = normalizeAuthorUrn(params.authorUrn);
  const assetUrns: string[] = [];
  for (const url of params.imageUrls.slice(0, MAX_LINKEDIN_IMAGES)) {
    const { uploadUrl, assetUrn } = await registerImageUpload(author, params.accessToken, fetchImpl);
    await uploadImageAsset(uploadUrl, url, params.accessToken, fetchImpl);
    assetUrns.push(assetUrn);
  }
  const category: LinkedInMediaCategory = assetUrns.length > 0 ? 'IMAGE' : 'NONE';
  const body = buildUgcPostBody({ author, caption: params.caption, category, assetUrns });
  return createUgcPost(body, params.accessToken, fetchImpl);
}
