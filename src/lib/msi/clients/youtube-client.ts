// YouTube PlatformClient (docs §Execution Layer; strategy `official_api`). The
// heaviest client — Google OAuth + a resumable BYTE upload (no pull-from-URL).
// Synchronous (returns the video id in one `execute`, no `checkStatus`), and
// video-only (YouTube is a video platform). Registered via the single
// OFFICIAL_API_CLIENTS map entry in worker-service.
//
// Compliance: customer-owned channel, sanctioned Data API, customer-authorized
// token. Per-account Phase-0 `official_api` sign-off required.

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { isVideoContentType } from '@/types/v2';
import { contentItemSchema } from '@/models/Schema';

import {
  revealAccountCredentials,
  storeAccountCredentials,
} from '../credentials-service';
import type { ExecutionContext, ExecutionOperation } from '../execution';
import type {
  PlatformCallResult,
  PlatformClient,
  PlatformStatusResult,
} from '../execution-api';
import { needsRefresh, refreshGoogleToken } from './token-refresh';
import type { FetchLike } from './youtube-upload';
import {
  buildVideoMetadata,
  CHUNK_SIZE,
  fetchByteRange,
  initiateResumableUpload,
  probeTotalSize,
  uploadChunk,
} from './youtube-upload';

/**
 * The credential blob a YouTube official_api account stores in the vault: the
 * authorized Google token (uploads to the token's own channel) + refresh token.
 */
export type YouTubeCredentials = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
};

export function parseYouTubeCredentials(raw: string | null): YouTubeCredentials {
  if (!raw) {
    throw new Error('YouTube account has no stored credentials (vault empty)');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('YouTube credentials are not valid JSON');
  }
  const cred = parsed as Partial<YouTubeCredentials>;
  if (!cred?.accessToken) {
    throw new Error('YouTube credentials missing accessToken');
  }
  return {
    accessToken: cred.accessToken,
    refreshToken: cred.refreshToken,
    expiresAt: cred.expiresAt,
  };
}

async function freshYouTubeCredentials(
  managedAccountId: string,
  fetchImpl: FetchLike,
): Promise<YouTubeCredentials> {
  const creds = parseYouTubeCredentials(
    await revealAccountCredentials(managedAccountId),
  );
  if (!needsRefresh(creds.expiresAt, Date.now()) || !creds.refreshToken) {
    return creds;
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return creds; // cannot refresh without client credentials — use as-is
  }
  const refreshed = await refreshGoogleToken(
    { refreshToken: creds.refreshToken, clientId, clientSecret },
    fetchImpl,
  );
  const updated: YouTubeCredentials = {
    ...creds,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresAt: refreshed.expiresAt,
  };
  await storeAccountCredentials(managedAccountId, JSON.stringify(updated), 'system', {
    actorType: 'system',
    action: 'credentials_refreshed',
  });
  return updated;
}

// Resumable-upload state carried in the job's execution_handle between ticks.
type UploadState = {
  sessionUri: string;
  offset: number;
  total: number;
  videoUrl: string;
};

type ContentToPublish = { caption: string; videoUrl: string };

async function loadVideo(contentItemId: string): Promise<ContentToPublish> {
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
    throw new Error('YouTube publishing requires a video content item');
  }
  const videoUrl = ((item.graphicUrls as string[] | null) ?? [])[0];
  if (!videoUrl) {
    throw new Error('Content item has no video to publish');
  }
  return { caption: item.caption, videoUrl };
}

export function createYouTubeClient(
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
): PlatformClient {
  return {
    platform: 'youtube',
    async execute(
      operation: ExecutionOperation,
      ctx: ExecutionContext,
    ): Promise<PlatformCallResult> {
      if (operation !== 'publish_post') {
        throw new Error(
          `YouTube official_api client does not support operation "${operation}"`,
        );
      }

      const contentItemId = ctx.payload?.contentItemId;
      if (typeof contentItemId !== 'string') {
        throw new Error('publish_post is missing contentItemId in the payload');
      }

      const credentials = await freshYouTubeCredentials(ctx.managedAccountId, fetchImpl);
      const video = await loadVideo(contentItemId);

      // Init only: probe the size + open a resumable session. The bytes are
      // uploaded one chunk per tick by checkStatus, so a large video never
      // blocks a single tick. State (session URI + offset) rides in the handle.
      const total = await probeTotalSize(video.videoUrl, fetchImpl);
      const metadata = buildVideoMetadata({
        title: video.caption,
        description: video.caption,
        privacyStatus: 'public',
      });
      const sessionUri = await initiateResumableUpload(
        metadata,
        credentials.accessToken,
        'video/mp4',
        total,
        fetchImpl,
      );

      const state: UploadState = {
        sessionUri,
        offset: 0,
        total,
        videoUrl: video.videoUrl,
      };
      return { pending: true, providerHandle: JSON.stringify(state) };
    },

    async checkStatus(
      handle: string,
      ctx: ExecutionContext,
    ): Promise<PlatformStatusResult> {
      let state: UploadState;
      try {
        state = JSON.parse(handle) as UploadState;
      } catch {
        throw new Error('YouTube upload handle is corrupt');
      }

      const credentials = await freshYouTubeCredentials(ctx.managedAccountId, fetchImpl);
      const end = Math.min(state.offset + CHUNK_SIZE, state.total) - 1;
      const chunk = await fetchByteRange(state.videoUrl, state.offset, end, fetchImpl);
      const result = await uploadChunk(
        state.sessionUri,
        chunk,
        state.offset,
        state.total,
        credentials.accessToken,
        fetchImpl,
      );

      if (result.status === 'complete') {
        return {
          done: true,
          platformPostId: result.videoId,
          evidenceUrl: `https://www.youtube.com/watch?v=${result.videoId}`,
          detail: `youtube video ${result.videoId}`,
        };
      }

      // Advance the offset and hand the updated state back for the next tick.
      const next: UploadState = { ...state, offset: result.nextOffset };
      return { done: false, providerHandle: JSON.stringify(next) };
    },
  };
}

/** Ready-to-register default instance (real global fetch). */
export const youtubeClient = createYouTubeClient();
