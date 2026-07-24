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

import { revealAccountCredentials } from '../credentials-service';
import type { ExecutionContext, ExecutionOperation } from '../execution';
import type { PlatformCallResult, PlatformClient } from '../execution-api';
import type { FetchLike, InstagramPublishResult } from './meta-graph';
import { publishInstagramMedia } from './meta-graph';

/**
 * The credential blob a Meta official_api account stores in the vault — the
 * authorized IG Graph token + the IG Business user id. Captured via the
 * Operations vault surface as JSON, not a username/password.
 */
export type MetaCredentials = { accessToken: string; igUserId: string };

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
  return { accessToken: cred.accessToken, igUserId: cred.igUserId };
}

type ContentToPublish = {
  caption: string;
  mediaUrl: string;
  isVideo: boolean;
};

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
  const mediaUrl = urls[0];
  if (!mediaUrl) {
    throw new Error('Content item has no media to publish');
  }
  return {
    caption: item.caption,
    mediaUrl,
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

      const credentials = parseMetaCredentials(
        await revealAccountCredentials(ctx.managedAccountId),
      );
      const content = await loadContent(contentItemId);

      const result: InstagramPublishResult = await publishInstagramMedia(
        {
          igUserId: credentials.igUserId,
          accessToken: credentials.accessToken,
          caption: content.caption,
          mediaUrl: content.mediaUrl,
          isVideo: content.isVideo,
        },
        fetchImpl,
      );

      return {
        evidenceUrl: result.permalink ?? undefined,
        // The platform post id — threaded into billing (platform_post_id) for
        // transparency + audit; also echoed in detail for the activity log.
        platformPostId: result.mediaId,
        detail: `instagram media ${result.mediaId}`,
      };
    },
  };
}

/** Ready-to-register default instance (real global fetch). */
export const metaInstagramClient = createMetaInstagramClient();
