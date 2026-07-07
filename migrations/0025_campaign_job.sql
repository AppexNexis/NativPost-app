CREATE TABLE IF NOT EXISTS "campaign_job" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" text NOT NULL,
  "campaign_id" uuid NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "progress" integer DEFAULT 0 NOT NULL,
  "step" text DEFAULT 'starting' NOT NULL,
  "posts_total" integer DEFAULT 0 NOT NULL,
  "posts_completed" integer DEFAULT 0 NOT NULL,
  "posts_failed" integer DEFAULT 0 NOT NULL,
  "error_message" text,
  "topic_override" text,
  "target_platforms_override" jsonb,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp,
  "started_at" timestamp,
  "completed_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "campaign_job_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE,
  CONSTRAINT "campaign_job_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE
);

-- Queue drain uses status + next_attempt_at as the primary hot path.
CREATE INDEX IF NOT EXISTS "campaign_job_status_next_attempt_idx"
  ON "campaign_job" ("status", "next_attempt_at");

-- Status endpoint looks up the latest job per campaign.
CREATE INDEX IF NOT EXISTS "campaign_job_campaign_id_created_at_idx"
  ON "campaign_job" ("campaign_id", "created_at" DESC);
