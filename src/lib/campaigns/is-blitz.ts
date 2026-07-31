/**
 * Blitz-campaign detection — the ONE definition.
 *
 * Blitz and Campaigns share `generateCampaignPosts`, but they are different
 * products with different generation contracts:
 *
 *   Blitz     — a daily feed. Generates at most `postsPerDay` per calendar day
 *               and refills tomorrow. The daily cap is the whole point.
 *   Campaigns — a fixed schedule. Generates its entire window up front so the
 *               Review grid and Calendar can show every slot on day one.
 *
 * Applying Blitz's daily cap to Campaigns silently truncated them to
 * `postsPerDay` posts (a 112-post campaign produced 2) and then wrote that
 * count back as the campaign's total, so the job reported success. Every place
 * that needs to tell the two apart now calls this.
 *
 * Blitz rows are identified by name because there is no discriminator column
 * on `campaign` — `lib/blitz/cleanup-stale.ts` matches the same literal. If a
 * `kind` column is ever added, change it here and every caller follows.
 */

export const BLITZ_CAMPAIGN_NAME = 'Today\'s Blitz';

export function isBlitzCampaign(
  campaign: { name?: string | null } | null | undefined,
): boolean {
  return campaign?.name === BLITZ_CAMPAIGN_NAME;
}
