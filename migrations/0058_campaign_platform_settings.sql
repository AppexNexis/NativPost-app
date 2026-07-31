-- Per-campaign, per-platform publishing configuration.
--
-- Scheduled publishing had no source for platform-specific options (TikTok
-- privacy level, direct vs inbox, duet/stitch/comment, AIGC disclosure), so the
-- publisher fell back to hardcoded values. One of them ('PUBLIC') is not a
-- valid TikTok enum, and every scheduled TikTok post was rejected with
-- "The request post info is empty or incorrect".
--
-- This column stores the user's INTENT for the campaign, e.g.
--   { "tiktok": { "publishMethod": "DIRECT",
--                 "privacyLevel": "USE_ACCOUNT_DEFAULT",
--                 "isAIGC": true } }
--
-- Values may be the USE_ACCOUNT_DEFAULT sentinel rather than a frozen enum, so
-- an account later restricted by TikTok resolves correctly at publish time
-- instead of failing. See src/lib/tiktok/resolve-settings.ts for the
-- campaign -> account -> creator_info hierarchy.

ALTER TABLE "campaign"
  ADD COLUMN IF NOT EXISTS "platform_settings" jsonb DEFAULT '{}'::jsonb;
