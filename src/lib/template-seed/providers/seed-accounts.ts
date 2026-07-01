/**
 * Curated seed accounts for profile-based content discovery.
 *
 * Used by apify-instagram.ts and apify-tiktok.ts to pull real reels/videos
 * from known hook/UGC/talking-head-style accounts, instead of scraping
 * public hashtag feeds (which are dominated by spam/caption-farming
 * accounts with no reliable engagement signal).
 *
 * SOURCE / FRESHNESS WARNING: This list was compiled from third-party
 * "top creator" round-ups (mid-2026), not a live account check. Before
 * relying on this at scale:
 *   1. Test each account with a small `limit` (e.g. 5) and manually review
 *      the curation queue — confirm the content actually matches the
 *      hook/UGC style we want, not just "popular in this niche."
 *   2. Verify handles are still active — some listed here are TikTok-only
 *      and the Instagram handle may not exist or may differ.
 *   3. Treat this as a starting point, not a finished list. Every curation
 *      session (approve/reject) is a signal for which accounts to add more
 *      of, or drop.
 *
 * Niche classification of scraped content itself is NOT done here — that's
 * handled downstream by enrichTemplateWithAI. This list only controls which
 * accounts we pull raw video from.
 */

export type SeedNiche = {
  instagram: string[];
  tiktok: string[];
};

export const SEED_ACCOUNTS: Record<string, SeedNiche> = {
  fitness: {
    instagram: [
      'soheefit',
      'scotthoho',
      'charleeatkins',
      'stevecook_32',
    ],
    tiktok: [
      'soheefit',
      'kjweatherspoon',
      'msjeanettejenkins',
      'scotthoho',
      'charleeatkins',
      'laylawarsamefit',
      'stevecook_32',
    ],
  },

  b2bBusiness: {
    instagram: [
      'zendesk',
      'clickup',
      'zapier',
      'atlassian', // Confluence
    ],
    tiktok: [
      'steven', // Steven Bartlett / Diary of a CEO
      'thesocialshepherdagency',
      'zendesk',
      'clickup',
      'zapier',
    ],
  },

  ecommerceEntrepreneur: {
    instagram: [
      'jordanwelch', // verify handle
      'shopify',
    ],
    tiktok: [
      'theecomcoach', // Brendan Gillen
      'kinsonsworld',
      'jordanwelch', // verify
    ],
  },

  selfImprovement: {
    instagram: [
      'melrobbins',
      'simonsquibb',
    ],
    tiktok: [
      'melrobbins',
      'simonsquibb',
    ],
  },

  smallBusinessOwner: {
    instagram: [
      'beadedbyjessxo',
      'shopmaddiegreen',
    ],
    tiktok: [
      'beadedbyjessxo',
      'emlucin',
      'shopmaddiegreen',
      'launchedacademy',
    ],
  },
};