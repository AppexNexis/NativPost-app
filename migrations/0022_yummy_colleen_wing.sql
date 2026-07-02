ALTER TABLE "content_template" ADD COLUMN "cloudinary_public_id" text;--> statement-breakpoint
ALTER TABLE "content_template" ADD COLUMN "moderation_status" text;--> statement-breakpoint
ALTER TABLE "content_template" ADD COLUMN "moderation_kind" text;--> statement-breakpoint
ALTER TABLE "content_template" ADD COLUMN "moderation_labels" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "content_template" ADD COLUMN "moderation_checked_at" timestamp;