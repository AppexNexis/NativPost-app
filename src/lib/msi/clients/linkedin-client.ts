// LinkedIn PlatformClient (docs §Execution Layer; strategy `official_api`). The
// third production client — and the first SYNCHRONOUS one: LinkedIn's UGC API
// publishes in a single call with no async processing step, so `execute`
// returns a terminal result and there is no `checkStatus`. This validates that
// the init+confirm execution model also cleanly supports synchronous clients
// (the adapter maps a non-pending result straight to `completed`).
//
// Compliance: customer-owned LinkedIn identity, sanctioned UGC API, customer-
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
import type { FetchLike } from './linkedin-posts';
import { publishToLinkedIn } from './linkedin-posts';
import { needsRefresh, refreshLinkedInToken } from './token-refresh';

/**
 * The credential blob a LinkedIn official_api account stores in the vault: the
 * authorized token + the author URN (person/organization) that owns the post.
 */
export type LinkedInCredentials = {
  accessToken: string;
  authorUrn: string;
  refreshToken?: string;
  expiresAt?: number;
};

export function parseLinkedInCredentials(raw: string | null): LinkedInCredentials {
  if (!raw) {
    throw new Error('LinkedIn account has no stored credentials (vault empty)');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('LinkedIn credentials are not valid JSON');
  }
  const cred = parsed as Partial<LinkedInCredentials>;
  if (!cred?.accessToken || !cred?.authorUrn) {
    throw new Error('LinkedIn credentials missing accessToken or authorUrn');
  }
  return {
    accessToken: cred.accessToken,
    authorUrn: cred.authorUrn,
    refreshToken: cred.refreshToken,
    expiresAt: cred.expiresAt,
  };
}

async function freshLinkedInCredentials(
  managedAccountId: string,
  fetchImpl: FetchLike,
): Promise<LinkedInCredentials> {
  const creds = parseLinkedInCredentials(
    await revealAccountCredentials(managedAccountId),
  );
  if (!needsRefresh(creds.expiresAt, Date.now()) || !creds.refreshToken) {
    return creds;
  }
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return creds; // cannot refresh without client credentials — use as-is
  }
  const refreshed = await refreshLinkedInToken(
    { refreshToken: creds.refreshToken, clientId, clientSecret },
    fetchImpl,
  );
  const updated: LinkedInCredentials = {
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

type ContentToPublish = { caption: string; imageUrls: string[]; isVideo: boolean };

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
    imageUrls: (item.graphicUrls as string[] | null) ?? [],
    isVideo: isVideoContentType(item.contentType),
  };
}

export function createLinkedInClient(
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
): PlatformClient {
  return {
    platform: 'linkedin',
    async execute(
      operation: ExecutionOperation,
      ctx: ExecutionContext,
    ): Promise<PlatformCallResult> {
      if (operation !== 'publish_post') {
        throw new Error(
          `LinkedIn official_api client does not support operation "${operation}"`,
        );
      }

      const contentItemId = ctx.payload?.contentItemId;
      if (typeof contentItemId !== 'string') {
        throw new Error('publish_post is missing contentItemId in the payload');
      }

      const credentials = await freshLinkedInCredentials(ctx.managedAccountId, fetchImpl);
      const content = await loadContent(contentItemId);
      if (content.isVideo) {
        // Video uses a heavier chunked-upload flow — image + text first (v1).
        throw new Error('LinkedIn video publishing is not yet supported');
      }

      // Synchronous: publish now and return a terminal result (no checkStatus).
      const postUrn = await publishToLinkedIn(
        {
          accessToken: credentials.accessToken,
          authorUrn: credentials.authorUrn,
          caption: content.caption,
          imageUrls: content.imageUrls,
        },
        fetchImpl,
      );

      return {
        platformPostId: postUrn,
        evidenceUrl: `https://www.linkedin.com/feed/update/${postUrn}`,
        detail: `linkedin post ${postUrn}`,
      };
    },
  };
}

/** Ready-to-register default instance (real global fetch). */
export const linkedinClient = createLinkedInClient();
