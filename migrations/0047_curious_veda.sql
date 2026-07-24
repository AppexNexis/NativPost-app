ALTER TABLE "msi_billable_publish_event" ADD COLUMN "platform_post_id" text;--> statement-breakpoint
ALTER TABLE "msi_billable_publish_event" ADD COLUMN "status" text DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "msi_billable_publish_event" ADD COLUMN "stripe_usage_record_id" text;