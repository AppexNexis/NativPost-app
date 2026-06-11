/**
 * dispatcher-integration.ts
 *
 * This file shows the exact changes needed in your publishing dispatcher
 * (the server action / API route that calls publishToplatform()) to wire
 * WhatsApp's phoneNumberId from the account metadata into the publisher.
 *
 * You likely have a function that:
 *  1. Fetches the social account from the DB
 *  2. Calls publishToplatform(platform, accessToken, platformUserId, ...)
 *
 * The only change needed is to read metadata.phoneNumberId from the account
 * and pass it as part of platformSpecific.
 *
 * ─── BEFORE (existing pattern) ────────────────────────────────────────────
 *
 *   const result = await publishToplatform(
 *     account.platform,
 *     account.accessToken,
 *     account.platformUserId,
 *     caption,
 *     graphicUrls,
 *     account.refreshToken,
 *     onTokenRefresh,
 *     contentType,
 *     account.oauthToken,
 *     account.oauthTokenSecret,
 *     contentItem.platformSpecific,   // ← existing per-content overrides
 *   );
 *
 * ─── AFTER (with WhatsApp support) ───────────────────────────────────────
 *
 * Replace the platformSpecific argument with the merged version below.
 * This is fully backward-compatible — for all other platforms, the
 * whatsapp key is simply ignored by the dispatcher.
 */

import type { WhatsAppAccountMetadata } from './whatsapp-callback';
import { publishToplatform } from './social-publish';

/**
 * Build the platformSpecific object that gets passed to publishToplatform().
 * Merges content-level overrides with account-level metadata.
 *
 * @param contentPlatformSpecific  - platformSpecific from contentItemSchema (YouTube title, TikTok settings, etc.)
 * @param account                  - the social account row from the DB (includes metadata)
 */
export function buildPlatformSpecific(
  contentPlatformSpecific: Record<string, unknown> | null | undefined,
  account: {
    platform: string;
    metadata?: unknown;
  },
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ...(contentPlatformSpecific ?? {}),
  };

  // Inject WhatsApp phoneNumberId from account metadata
  if (account.platform === 'whatsapp' && account.metadata) {
    const meta = account.metadata as WhatsAppAccountMetadata;
    if (meta.phoneNumberId) {
      base.whatsapp = {
        phoneNumberId: meta.phoneNumberId,
        wabaId: meta.wabaId,
      };
    }
  }

  return base;
}

/**
 * Example: full publish call with WhatsApp wired in.
 * Replace your existing publishToplatform() call with this pattern.
 *
 * account comes from your DB query (socialAccountSchema row).
 * contentItem comes from contentItemSchema.
 */
export async function dispatchPublish(
  account: {
    platform: string;
    accessToken: string;
    platformUserId: string;
    refreshToken?: string | null;
    oauthToken?: string | null;
    oauthTokenSecret?: string | null;
    metadata?: unknown;
  },
  contentItem: {
    caption: string;
    graphicUrls: string[];
    contentType: string;
    platformSpecific?: Record<string, unknown> | null;
  },
  onTokenRefresh?: (newAccessToken: string, newRefreshToken: string) => Promise<void>,
) {
  const platformSpecific = buildPlatformSpecific(
    contentItem.platformSpecific,
    account,
  );

  return publishToplatform(
    account.platform,
    account.accessToken,
    account.platformUserId,
    contentItem.caption,
    contentItem.graphicUrls,
    account.refreshToken ?? undefined,
    onTokenRefresh,
    contentItem.contentType,
    account.oauthToken ?? undefined,
    account.oauthTokenSecret ?? undefined,
    platformSpecific,
  );
}