// Facebook Page PlatformClient (docs §Execution Layer; strategy `official_api`).
// Synchronous like LinkedIn, but pull-from-URL like Instagram — so it supports
// text, single image, multi-image carousel, and video in one `execute`, with no
// `checkStatus`. Shares Meta's token refresh (fb_exchange_token, META_APP_*).
//
// Compliance: customer-owned Facebook Page, sanctioned Graph API, customer-
// authorized token. Per-account Phase-0 `official_api` sign-off required.
// Registered via the single OFFICIAL_API_CLIENTS map entry in worker-service.

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { isVideoContentType } from '@/types/v2';
import { contentItemSchema } from '@/models/Schema';

import {
  revealAccountCredentials,
  storeAccountCredentials,
} from '../credentials-service';
import type { ExecutionContext, ExecutionOperation } from '../execution';
import type { PlatformCallResult, PlatformClient } from '../execution-api';
import type { FetchLike } from './facebook-graph';
import { fbPermalink, publishToFacebook } from './facebook-graph';
import { needsRefresh, refreshMetaToken } from './token-refresh';

/**
 * The credential blob a Facebook official_api account stores in the vault: the
 * authorized Page token + the Page id. Refreshed via fb_exchange_token, so no
 * separate refresh token is needed.
 */
export type FacebookCredentials = {
  accessToken: string;
  pageId: string;
  expiresAt?: number;
};

export function parseFacebookCredentials(raw: string | null): FacebookCredentials {
  if (!raw) {
    throw new Error('Facebook account has no stored credentials (vault empty)');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Facebook credentials are not valid JSON');
  }
  const cred = parsed as Partial<FacebookCredentials>;
  if (!cred?.accessToken || !cred?.pageId) {
    throw new Error('Facebook credentials missing accessToken or pageId');
  }
  return {
    accessToken: cred.accessToken,
    pageId: cred.pageId,
    expiresAt: cred.expiresAt,
  };
}

async function freshFacebookCredentials(
  managedAccountId: string,
  fetchImpl: FetchLike,
): Promise<FacebookCredentials> {
  const creds = parseFacebookCredentials(
    await revealAccountCredentials(managedAccountId),
  );
  if (!needsRefresh(creds.expiresAt, Date.now())) {
    return creds;
  }
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return creds; // cannot refresh without app credentials — use as-is
  }
  const refreshed = await refreshMetaToken(
    { accessToken: creds.accessToken, appId, appSecret },
    fetchImpl,
  );
  const updated: FacebookCredentials = {
    ...creds,
    accessToken: refreshed.accessToken,
    expiresAt: refreshed.expiresAt,
  };
  await storeAccountCredentials(managedAccountId, JSON.stringify(updated), 'system', {
    actorType: 'system',
    action: 'credentials_refreshed',
  });
  return updated;
}

type ContentToPublish = { caption: string; mediaUrls: string[]; isVideo: boolean };

async function loadContent(contentItemId: string): Promise<ContentToPublish> {
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
  return {
    caption: item.caption,
    mediaUrls: (item.graphicUrls as string[] | null) ?? [],
    isVideo: isVideoContentType(item.contentType),
  };
}

export function createFacebookClient(
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
): PlatformClient {
  return {
    platform: 'facebook',
    async execute(
      operation: ExecutionOperation,
      ctx: ExecutionContext,
    ): Promise<PlatformCallResult> {
      if (operation !== 'publish_post') {
        throw new Error(
          `Facebook official_api client does not support operation "${operation}"`,
        );
      }

      const contentItemId = ctx.payload?.contentItemId;
      if (typeof contentItemId !== 'string') {
        throw new Error('publish_post is missing contentItemId in the payload');
      }

      const credentials = await freshFacebookCredentials(ctx.managedAccountId, fetchImpl);
      const content = await loadContent(contentItemId);

      // Synchronous: publish now and return a terminal result (no checkStatus).
      const { postId, kind } = await publishToFacebook(
        {
          pageId: credentials.pageId,
          accessToken: credentials.accessToken,
          caption: content.caption,
          mediaUrls: content.mediaUrls,
          isVideo: content.isVideo,
        },
        fetchImpl,
      );

      return {
        platformPostId: postId,
        evidenceUrl: fbPermalink(credentials.pageId, postId, kind),
        detail: `facebook post ${postId}`,
      };
    },
  };
}

/** Ready-to-register default instance (real global fetch). */
export const facebookClient = createFacebookClient();
