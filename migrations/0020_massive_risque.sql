ALTER TABLE "campaign" ADD COLUMN "pinterest_percent" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "enabled_influencer_ids" jsonb DEFAULT '[]'::jsonb;