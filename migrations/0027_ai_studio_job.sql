CREATE TABLE IF NOT EXISTS "ai_studio_job" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" text NOT NULL,
  "user_id" text,
  "model_id" text NOT NULL,
  "kind" text NOT NULL,
  "status" text DEFAULT 'reserved' NOT NULL,
  "fal_request_id" text,
  "input" jsonb DEFAULT '{}' NOT NULL,
  "output" jsonb,
  "credits_reserved" integer DEFAULT 0 NOT NULL,
  "credits_charged" integer,
  "error_message" text,
  "media_asset_id" uuid,
  "webhook_received_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ai_studio_job_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE,
  CONSTRAINT "ai_studio_job_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_asset"("id") ON DELETE SET NULL
);

-- Webhook path looks up the pending job by fal request id.
CREATE UNIQUE INDEX IF NOT EXISTS "ai_studio_job_fal_request_id_idx"
  ON "ai_studio_job" ("fal_request_id")
  WHERE "fal_request_id" IS NOT NULL;

-- Jobs list endpoint scans per-org, newest first.
CREATE INDEX IF NOT EXISTS "ai_studio_job_org_created_at_idx"
  ON "ai_studio_job" ("org_id", "created_at" DESC);

-- Stale-job sweeper scans in-flight rows by (status, updated_at).
CREATE INDEX IF NOT EXISTS "ai_studio_job_status_updated_at_idx"
  ON "ai_studio_job" ("status", "updated_at");
