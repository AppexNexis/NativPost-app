-- ============================================================
-- Phase I1 — AI Influencer identity layer
-- Adds voice/persona/LoRA training + baseline library fields
-- to ai_influencer and creates influencer_angle join table.
--
-- Apply manually against target Postgres — npm run db:migrate
-- targets prod (see memory nativpost-db-migrate-targets-prod).
-- ============================================================

ALTER TABLE "ai_influencer"
  ADD COLUMN IF NOT EXISTS "voice_id" text,
  ADD COLUMN IF NOT EXISTS "voice_provider" text DEFAULT 'elevenlabs',
  ADD COLUMN IF NOT EXISTS "lora_training_job_id" text,
  ADD COLUMN IF NOT EXISTS "lora_status" text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "is_system" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "persona_prompt" text,
  ADD COLUMN IF NOT EXISTS "archetype" text;

-- Allow system rows (org_id NULL) for baseline library
ALTER TABLE "ai_influencer"
  ALTER COLUMN "org_id" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "ai_influencer_is_system_idx"
  ON "ai_influencer" ("is_system");
CREATE INDEX IF NOT EXISTS "ai_influencer_lora_status_idx"
  ON "ai_influencer" ("lora_status");

-- ── influencer_angle: per-influencer content angles ─────────
CREATE TABLE IF NOT EXISTS "influencer_angle" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "influencer_id" uuid NOT NULL REFERENCES "ai_influencer"("id") ON DELETE CASCADE,
  "content_angle_id" uuid NOT NULL REFERENCES "content_angle"("id") ON DELETE CASCADE,
  "weight" integer DEFAULT 1,
  "created_at" timestamp DEFAULT now() NOT NULL,
  UNIQUE ("influencer_id", "content_angle_id")
);

CREATE INDEX IF NOT EXISTS "influencer_angle_influencer_idx"
  ON "influencer_angle" ("influencer_id");
