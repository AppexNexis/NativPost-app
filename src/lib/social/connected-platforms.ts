/**
 * getConnectedPlatforms
 *
 * Returns the set of platforms this org has actively connected. Optionally
 * restricted to a whitelist — Blitz + Campaigns both pass
 * `restrictTo: ['facebook', 'instagram', 'tiktok']` per product decision
 * (2026-07-07: Blitz and Campaigns publish targets are hard-gated to these
 * three channels only).
 *
 * If the returned array is empty, callers should surface a
 * "Connect a channel" state instead of falling back to a silent default —
 * we don't want to generate posts for platforms the org can't publish to.
 */

import { and, eq } from 'drizzle-orm';

import { socialAccountSchema } from '@/models/Schema';

export type GetConnectedPlatformsOptions = {
  restrictTo?: string[];
};

export async function getConnectedPlatforms(
  db: any,
  orgId: string,
  opts: GetConnectedPlatformsOptions = {},
): Promise<string[]> {
  const rows = await db
    .select({ platform: socialAccountSchema.platform })
    .from(socialAccountSchema)
    .where(
      and(
        eq(socialAccountSchema.orgId, orgId),
        eq(socialAccountSchema.isActive, true),
      ),
    );

  const platforms = Array.from(
    new Set((rows as { platform: string }[]).map((r) => r.platform).filter(Boolean)),
  );

  if (opts.restrictTo && opts.restrictTo.length > 0) {
    const allow = new Set(opts.restrictTo);
    return platforms.filter((p) => allow.has(p));
  }

  return platforms;
}

/**
 * Thrown by generateCampaignPosts when the org has no eligible connected
 * platforms. The campaign job worker catches this and marks the job failed
 * with a distinct errorCode so the UI can render a "Connect a channel" CTA
 * instead of a generic error state.
 */
export class NoConnectedChannelsError extends Error {
  code = 'NO_CONNECTED_CHANNELS' as const;
  constructor(message = 'Connect Facebook, Instagram, or TikTok before generating posts.') {
    super(message);
    this.name = 'NoConnectedChannelsError';
  }
}

export const BLITZ_ALLOWED_PLATFORMS = ['facebook', 'instagram', 'tiktok'] as const;
