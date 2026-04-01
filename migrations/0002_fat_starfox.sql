ALTER TABLE "brand_profile" ADD COLUMN "growth_stage" text DEFAULT 'early';--> statement-breakpoint
ALTER TABLE "content_item" ADD COLUMN "content_mode" text DEFAULT 'normal';--> statement-breakpoint
ALTER TABLE "content_item" ADD COLUMN "enrichment_data" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "content_item" ADD COLUMN "enrichment_applied" jsonb DEFAULT '[]'::jsonb;