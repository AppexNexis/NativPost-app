ALTER TABLE "content_item" ADD COLUMN "campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "content_item" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "content_item" ADD COLUMN "influencer_id" uuid;--> statement-breakpoint
ALTER TABLE "content_item" ADD COLUMN "angle_id" uuid;--> statement-breakpoint
ALTER TABLE "content_item" ADD COLUMN "generation_params" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "content_item" ADD COLUMN "content_format" text;--> statement-breakpoint
ALTER TABLE "content_item" ADD COLUMN "aspect_ratio" text;--> statement-breakpoint
ALTER TABLE "content_item" ADD COLUMN "duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "content_item" ADD COLUMN "ai_model_used" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_item" ADD CONSTRAINT "content_item_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_item" ADD CONSTRAINT "content_item_template_id_content_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."content_template"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_item" ADD CONSTRAINT "content_item_influencer_id_ai_influencer_id_fk" FOREIGN KEY ("influencer_id") REFERENCES "public"."ai_influencer"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_item" ADD CONSTRAINT "content_item_angle_id_content_angle_id_fk" FOREIGN KEY ("angle_id") REFERENCES "public"."content_angle"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
