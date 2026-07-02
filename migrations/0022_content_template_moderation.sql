-- Cloudinary moderation columns for content_template.
--
-- Why: prior to 2026-07-02 Cloudinary AUP flagged the account for prohibited
-- content and blocked all asset delivery, blanking the entire content library.
-- The ingestion pipeline (Apify TikTok/IG + Pexels + TikWM hydration) now
-- passes the `moderation` param on every upload and receives async verdicts
-- via a webhook — these columns store that verdict per row.

ALTER TABLE "content_template" ADD COLUMN IF NOT EXISTS "cloudinary_public_id" text;
ALTER TABLE "content_template" ADD COLUMN IF NOT EXISTS "moderation_status" text;
ALTER TABLE "content_template" ADD COLUMN IF NOT EXISTS "moderation_kind" text;
ALTER TABLE "content_template" ADD COLUMN IF NOT EXISTS "moderation_labels" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "content_template" ADD COLUMN IF NOT EXISTS "moderation_checked_at" timestamp;

-- Fast lookup for the webhook + backfill routes (both key on public_id).
CREATE INDEX IF NOT EXISTS "content_template_cloudinary_public_id_idx"
  ON "content_template" ("cloudinary_public_id");

-- Fast filtering in library queries: WHERE moderation_status IN ('approved', NULL).
CREATE INDEX IF NOT EXISTS "content_template_moderation_status_idx"
  ON "content_template" ("moderation_status");
