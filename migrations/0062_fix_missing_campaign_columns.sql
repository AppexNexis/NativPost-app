-- Safety migration: add campaign columns that may be missing from production.
-- Uses IF NOT EXISTS so it's idempotent and safe to re-run.
-- Root cause: some migrations were recorded in the Drizzle journal but
-- never actually applied to the production database.

ALTER TABLE "campaign"
  ADD COLUMN IF NOT EXISTS "blitz_advanced" jsonb DEFAULT '{}'::jsonb;

ALTER TABLE "campaign"
  ADD COLUMN IF NOT EXISTS "blitz_disabled_account_ids" jsonb DEFAULT '[]'::jsonb;

ALTER TABLE "campaign"
  ADD COLUMN IF NOT EXISTS "platform_settings" jsonb DEFAULT '{}'::jsonb;
