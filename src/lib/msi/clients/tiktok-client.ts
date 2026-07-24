// TikTok PlatformClient — the second production execution integration (docs
// §Execution Layer; strategy `official_api`). Implements the same PlatformClient
// seam as the Meta client, which is the point: proving the interface is
// platform-agnostic. On publish_post it loads the content item + the account's
// authorized token from the vault, then drives the TikTok Content Posting API
// via ./tiktok-content.
//
// Compliance: operates a CUSTOMER-OWNED TikTok account through TikTok's
// sanctioned Content Posting API with a customer-authorized token — no evasion.
// Requires the account's Phase-0 `official_api` sign-off before production.
//
// Registration is the single map entry in worker-service (OFFICIAL_API_CLIENTS).

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { isVideoContentType } from '@/types/v2';
import { contentItemSchema } from '@/models/Schema';

import { revealAccountCredentials } from '../credentials-service';
import type { ExecutionContext, ExecutionOperation } from '../execution';
import type {
  PlatformCallResult,
  PlatformClient,
  PlatformStatusResult,
} from '../execution-api';
import type { FetchLike } from './tiktok-content';
import { fetchPublishStatus, initVideoPublish } from './tiktok-content';

/**
 * The credential blob a TikTok official_api account stores in the vault: the
 * authorized Content Posting token (+ the @username, used only to build a
 * permalink). Captured as JSON via the Operations vault surface.
 */
export type TikTokCredentials = { accessToken: string; username?: string };

export function parseTikTokCredentials(raw: string | null): TikTokCredentials {
  if (!raw) {
    throw new Error('TikTok account has no stored credentials (vault empty)');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('TikTok credentials are not valid JSON');
  }
  const cred = parsed as Partial<TikTokCredentials>;
  if (!cred?.accessToken) {
    throw new Error('TikTok credentials missing accessToken');
  }
  return { accessToken: cred.accessToken, username: cred.username };
}

type VideoToPublish = { caption: string; videoUrl: string };

async function loadVideo(contentItemId: string): Promise<VideoToPublish> {
  const [item] = await db
    .select({
      caption: contentItemSchema.caption,
      graphicUrls: contentItemSchema.graphicUrls,
      contentType: contentItemSchema.contentType,
    })
    .from(contentItemSchema)
    .where(eq(contentItemSchema.id, contentItemId))
    .limit(1);
  if (!item) {
    throw new Error(`Content item ${contentItemId} not found`);
  }
  if (!isVideoContentType(item.contentType)) {
    // The Content Posting video flow requires a video; photo posts are a
    // separate endpoint (follow-up).
    throw new Error('TikTok publishing requires a video content item');
  }
  const urls = (item.graphicUrls as string[] | null) ?? [];
  const videoUrl = urls[0];
  if (!videoUrl) {
    throw new Error('Content item has no video to publish');
  }
  return { caption: item.caption, videoUrl };
}

/**
 * TikTok PULL_FROM_URL requires the media to be served from a domain the app
 * has verified with TikTok, so route it through the app's media proxy (same as
 * the OAuth publish path). The proxy origin is the verified domain.
 */
function toTikTokPullUrl(videoUrl: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.nativpost.com';
  const playable = /\.(?:mp4|mov|webm)(?:[/?#]|$)/i.test(videoUrl)
    ? videoUrl
    : `${videoUrl.endsWith('/') ? videoUrl : `${videoUrl}/`}video.mp4`;
  return `${appUrl}/api/media/proxy?url=${encodeURIComponent(playable)}`;
}

export function createTikTokClient(
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
): PlatformClient {
  return {
    platform: 'tiktok',
    async execute(
      operation: ExecutionOperation,
      ctx: ExecutionContext,
    ): Promise<PlatformCallResult> {
      if (operation !== 'publish_post') {
        throw new Error(
          `TikTok official_api client does not support operation "${operation}"`,
        );
      }

      const contentItemId = ctx.payload?.contentItemId;
      if (typeof contentItemId !== 'string') {
        throw new Error('publish_post is missing contentItemId in the payload');
      }

      const credentials = parseTikTokCredentials(
        await revealAccountCredentials(ctx.managedAccountId),
      );
      const video = await loadVideo(contentItemId);

      // Init only — TikTok processes asynchronously; the confirmation pass polls.
      const publishId = await initVideoPublish(
        {
          accessToken: credentials.accessToken,
          caption: video.caption,
          videoUrl: toTikTokPullUrl(video.videoUrl),
        },
        fetchImpl,
      );

      return { pending: true, providerHandle: publishId };
    },

    async checkStatus(
      handle: string,
      ctx: ExecutionContext,
    ): Promise<PlatformStatusResult> {
      const credentials = parseTikTokCredentials(
        await revealAccountCredentials(ctx.managedAccountId),
      );
      const status = await fetchPublishStatus(
        handle,
        credentials.accessToken,
        fetchImpl,
      );
      if (status.status === 'PROCESSING') {
        return { done: false };
      }

      // Prefer the public post id (aweme) for transparency + permalink; fall
      // back to the operation publish_id if the post id wasn't returned.
      const platformPostId = status.postId ?? handle;
      const permalink = credentials.username && status.postId
        ? `https://www.tiktok.com/@${credentials.username}/video/${status.postId}`
        : undefined;

      return {
        done: true,
        platformPostId,
        evidenceUrl: permalink,
        detail: `tiktok post ${platformPostId}`,
      };
    },
  };
}

/** Ready-to-register default instance (real global fetch). */
export const tiktokClient = createTikTokClient();
