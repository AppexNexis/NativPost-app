CREATE TABLE IF NOT EXISTS "brand_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"brand_name" text NOT NULL,
	"industry" text,
	"target_audience" text,
	"company_description" text,
	"website_url" text,
	"tone_formality" integer DEFAULT 5,
	"tone_humor" integer DEFAULT 5,
	"tone_energy" integer DEFAULT 5,
	"vocabulary" jsonb DEFAULT '[]'::jsonb,
	"forbidden_words" jsonb DEFAULT '[]'::jsonb,
	"communication_style" text,
	"primary_color" text,
	"secondary_color" text,
	"accent_color" text,
	"font_preference" text,
	"image_style" text,
	"logo_url" text,
	"content_examples" jsonb DEFAULT '[]'::jsonb,
	"anti_patterns" jsonb DEFAULT '[]'::jsonb,
	"hashtag_strategy" text,
	"linkedin_voice" text,
	"instagram_voice" text,
	"twitter_voice" text,
	"facebook_voice" text,
	"tiktok_voice" text,
	"mission" text,
	"values" jsonb DEFAULT '[]'::jsonb,
	"products_services" jsonb DEFAULT '[]'::jsonb,
	"key_differentiators" text,
	"profile_completeness" integer DEFAULT 0,
	"onboarding_completed" boolean DEFAULT false,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_calendar" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"content_item_id" uuid,
	"scheduled_date" text NOT NULL,
	"scheduled_time" text,
	"timezone" text DEFAULT 'UTC',
	"is_published" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_item_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"feedback_type" text NOT NULL,
	"feedback_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"brand_profile_id" uuid,
	"caption" text NOT NULL,
	"hashtags" jsonb DEFAULT '[]'::jsonb,
	"content_type" text NOT NULL,
	"topic" text,
	"graphic_urls" jsonb DEFAULT '[]'::jsonb,
	"graphic_template_id" text,
	"variant_group_id" uuid,
	"variant_number" integer DEFAULT 1,
	"is_selected_variant" boolean DEFAULT false,
	"target_platforms" jsonb DEFAULT '[]'::jsonb,
	"platform_specific" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_for" timestamp,
	"published_at" timestamp,
	"rejection_feedback" text,
	"anti_slop_score" real,
	"quality_flags" jsonb DEFAULT '[]'::jsonb,
	"engagement_data" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"step" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "publishing_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_item_id" uuid NOT NULL,
	"social_account_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"scheduled_for" timestamp NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"platform_post_id" text,
	"error_message" text,
	"retry_count" integer DEFAULT 0,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"platform" text NOT NULL,
	"platform_user_id" text,
	"platform_username" text,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"account_type" text,
	"profile_image_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"connected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "todo";--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "stripe_subscription_current_period_end" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "paystack_customer_code" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "paystack_subscription_code" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "paystack_plan_code" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "plan" text DEFAULT 'starter' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "plan_status" text DEFAULT 'trialing' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "posts_per_month" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "platforms_limit" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "setup_fee_paid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "trial_ends_at" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "brand_profile" ADD CONSTRAINT "brand_profile_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_calendar" ADD CONSTRAINT "content_calendar_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_calendar" ADD CONSTRAINT "content_calendar_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_feedback" ADD CONSTRAINT "content_feedback_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_item" ADD CONSTRAINT "content_item_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_item" ADD CONSTRAINT "content_item_brand_profile_id_brand_profile_id_fk" FOREIGN KEY ("brand_profile_id") REFERENCES "public"."brand_profile"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "publishing_queue" ADD CONSTRAINT "publishing_queue_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "publishing_queue" ADD CONSTRAINT "publishing_queue_social_account_id_social_account_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_account"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_account" ADD CONSTRAINT "social_account_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
