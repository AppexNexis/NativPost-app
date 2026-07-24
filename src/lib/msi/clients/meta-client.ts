// Meta (Instagram) PlatformClient — the first production execution integration
// (docs §Execution Layer; Phase 0 §2, strategy `official_api`). Implements the
// PlatformClient seam: on a publish_post operation it loads the content item +
// the account's authorized Graph credentials from the vault, then drives the
// Instagram Content Publishing API via ./meta-graph.
//
// Compliance: this operates a CUSTOMER-OWNED Instagram Business/Creator account
// through Meta's SANCTIONED API using a token the customer authorized — the
// compliant model, no evasion. It requires the account's Phase-0 sign-off for
// `official_api` before being registered for production traffic.
//
// Registration (do at the point you wire it, not in a preemptive bootstrap):
//   const clients = new Map([['instagram', metaInstagramClient]]);
//   registerExecutionAdapter(createApiExecutionAdapter('official_api', clients));
// Until registered, the official_api strategy stays fail-closed.

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
import type { FetchLike } from './meta-graph';
import {
  checkContainerStatus,
  createCarouselContainer,
  createCarouselItemContainer,
  createMediaContainer,
  publishContainer,
  resolvePermalink,
} from './meta-graph';
import { needsRefresh, refreshMetaToken } from './token-refresh';

/**
 * The credential blob a Meta official_api account stores in the vault — the
 * authorized IG Graph token + the IG Business user id. Captured via the
 * Operations vault surface as JSON, not a username/password.
 */
export type MetaCredentials = {
  accessToken: string;
  igUserId: string;
  // Absolute token expiry (epoch ms), when known — drives proactive refresh.
  expiresAt?: number;
};

export function parseMetaCredentials(raw: string | null): MetaCredentials {
  if (!raw) {
    throw new Error('Instagram account has no stored credentials (vault empty)');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Instagram credentials are not valid JSON');
  }
  const cred = parsed as Partial<MetaCredentials>;
  if (!cred?.accessToken || !cred?.igUserId) {
    throw new Error('Instagram credentials missing accessToken or igUserId');
  }
  return {
    accessToken: cred.accessToken,
    igUserId: cred.igUserId,
    expiresAt: cred.expiresAt,
  };
}

/**
 * Reveal the account credentials and proactively refresh the token if it is at
 * or near expiry, persisting the new token back to the vault. No-ops (returns
 * as-is) when the expiry is unknown or the app credentials aren't configured.
 */
async function freshMetaCredentials(
  managedAccountId: string,
  fetchImpl: FetchLike,
): Promise<MetaCredentials> {
  const creds = parseMetaCredentials(
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
  const updated: MetaCredentials = {
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

type ContentToPublish = {
  caption: string;
  mediaUrls: string[];
  isVideo: boolean;
};

// Instagram allows up to 10 items in a carousel.
const MAX_CAROUSEL_ITEMS = 10;

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
  const urls = (item.graphicUrls as string[] | null) ?? [];
  if (urls.length === 0) {
    throw new Error('Content item has no media to publish');
  }
  return {
    caption: item.caption,
    mediaUrls: urls,
    isVideo: isVideoContentType(item.contentType),
  };
}

/**
 * Build the Instagram PlatformClient. `fetchImpl` is injectable for testing;
 * defaults to the global fetch in production.
 */
export function createMetaInstagramClient(
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
): PlatformClient {
  return {
    platform: 'instagram',
    async execute(
      operation: ExecutionOperation,
      ctx: ExecutionContext,
    ): Promise<PlatformCallResult> {
      if (operation !== 'publish_post') {
        // Account create/profile edits on IG are customer-owned + manual; only
        // publishing is automatable via the API. Fail loud, never silent.
        throw new Error(
          `Instagram official_api client does not support operation "${operation}"`,
        );
      }

      const contentItemId = ctx.payload?.contentItemId;
      if (typeof contentItemId !== 'string') {
        throw new Error('publish_post is missing contentItemId in the payload');
      }

      const credentials = await freshMetaCredentials(ctx.managedAccountId, fetchImpl);
      const content = await loadContent(contentItemId);

      // Init only: create the container(s) and hand back the parent id.
      // Publishing waits for processing, which the confirmation pass drives
      // (checkStatus) — identical for single media and carousels, because the
      // carousel container's status already reflects child readiness.
      let creationId: string;
      if (!content.isVideo && content.mediaUrls.length > 1) {
        // Carousel: create a child container per image, then the parent.
        const childIds: string[] = [];
        for (const url of content.mediaUrls.slice(0, MAX_CAROUSEL_ITEMS)) {
          childIds.push(
            await createCarouselItemContainer(
              credentials.igUserId,
              url,
              credentials.accessToken,
              fetchImpl,
            ),
          );
        }
        creationId = await createCarouselContainer(
          credentials.igUserId,
          childIds,
          content.caption,
          credentials.accessToken,
          fetchImpl,
        );
      } else {
        // Single image or REELS video.
        creationId = await createMediaContainer(
          {
            igUserId: credentials.igUserId,
            accessToken: credentials.accessToken,
            caption: content.caption,
            mediaUrl: content.mediaUrls[0]!,
            isVideo: content.isVideo,
          },
          fetchImpl,
        );
      }

      return { pending: true, providerHandle: creationId };
    },

    async checkStatus(
      handle: string,
      ctx: ExecutionContext,
    ): Promise<PlatformStatusResult> {
      const credentials = await freshMetaCredentials(ctx.managedAccountId, fetchImpl);

      const status = await checkContainerStatus(
        handle,
        credentials.accessToken,
        fetchImpl,
      );
      if (status === 'PROCESSING') {
        return { done: false };
      }

      // Container ready → publish it and resolve the permalink.
      const mediaId = await publishContainer(
        credentials.igUserId,
        handle,
        credentials.accessToken,
        fetchImpl,
      );
      const permalink = await resolvePermalink(
        mediaId,
        credentials.accessToken,
        fetchImpl,
      );

      return {
        done: true,
        platformPostId: mediaId,
        evidenceUrl: permalink ?? undefined,
        detail: `instagram media ${mediaId}`,
      };
    },
  };
}

/** Ready-to-register default instance (real global fetch). */
export const metaInstagramClient = createMetaInstagramClient();
