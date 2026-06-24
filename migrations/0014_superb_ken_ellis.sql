CREATE TABLE IF NOT EXISTS "ai_influencer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"gender" text,
	"age_range" text,
	"ethnicity" text,
	"hair_style" text,
	"hair_color" text,
	"body_type" text,
	"fashion_style" text,
	"pose_style" text,
	"background_preference" text,
	"base_image_url" text,
	"reference_image_urls" jsonb DEFAULT '[]'::jsonb,
	"lora_model_id" text,
	"usage_count" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "automation_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"trigger_type" text NOT NULL,
	"trigger_config" jsonb DEFAULT '{}'::jsonb,
	"action_type" text NOT NULL,
	"action_config" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true,
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"run_count" integer DEFAULT 0,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaign_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"content_item_id" uuid NOT NULL,
	"sequence_index" integer DEFAULT 0,
	"scheduled_date" timestamp,
	"scheduled_time" text,
	"is_rolled" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaign" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"content_mix" jsonb DEFAULT '{}'::jsonb,
	"remix_ratio" integer DEFAULT 50,
	"angles" jsonb DEFAULT '[]'::jsonb,
	"mention_frequency" text DEFAULT 'sometimes',
	"gender_preference" text,
	"own_media_mix" integer DEFAULT 50,
	"influencer_frequency" integer DEFAULT 0,
	"target_accounts" jsonb DEFAULT '[]'::jsonb,
	"posts_per_day" integer DEFAULT 3,
	"campaign_length_days" integer DEFAULT 7,
	"start_date" timestamp,
	"total_posts" integer DEFAULT 0,
	"generated_posts" integer DEFAULT 0,
	"re_rolls_remaining" integer DEFAULT 4,
	"quality_threshold" real DEFAULT 0.7,
	"total_engagement" integer DEFAULT 0,
	"avg_engagement_rate" real,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_angle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text,
	"name" text NOT NULL,
	"description" text,
	"color" text,
	"is_system" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_url" text NOT NULL,
	"source_platform" text NOT NULL,
	"source_creator" text,
	"source_video_id" text,
	"media_url" text,
	"thumbnail_url" text NOT NULL,
	"thumbnail_urls" jsonb DEFAULT '{}'::jsonb,
	"duration_seconds" integer,
	"content_type" text NOT NULL,
	"niches" jsonb DEFAULT '[]'::jsonb,
	"angles" jsonb DEFAULT '[]'::jsonb,
	"structure" jsonb DEFAULT '{}'::jsonb,
	"engagement_score" real,
	"view_count" integer,
	"like_count" integer,
	"share_count" integer,
	"comment_count" integer,
	"curation_status" text DEFAULT 'pending',
	"curated_by" text,
	"curated_at" timestamp,
	"remix_count" integer DEFAULT 0,
	"publish_count" integer DEFAULT 0,
	"avg_remix_performance" real,
	"added_at" timestamp DEFAULT now(),
	"last_refreshed_at" timestamp,
	"is_active" boolean DEFAULT true,
	"training_used" boolean DEFAULT false,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "engine_request_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"content_item_id" uuid,
	"campaign_id" uuid,
	"request_type" text NOT NULL,
	"engine_url" text,
	"model_used" text,
	"request_payload_size" integer,
	"response_payload_size" integer,
	"duration_ms" integer,
	"status" text,
	"error_message" text,
	"cost_estimate" real,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "media_asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"uploadcare_uuid" text,
	"url" text NOT NULL,
	"thumbnail_url" text,
	"asset_type" text NOT NULL,
	"mime_type" text,
	"file_size" integer,
	"width" integer,
	"height" integer,
	"aspect_ratio" text,
	"duration_seconds" real,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"description" text,
	"source" text DEFAULT 'upload',
	"ai_metadata" jsonb DEFAULT '{}'::jsonb,
	"usage_count" integer DEFAULT 0,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_influencer" ADD CONSTRAINT "ai_influencer_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "automation_rule" ADD CONSTRAINT "automation_rule_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaign_content" ADD CONSTRAINT "campaign_content_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaign_content" ADD CONSTRAINT "campaign_content_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaign" ADD CONSTRAINT "campaign_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_angle" ADD CONSTRAINT "content_angle_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
