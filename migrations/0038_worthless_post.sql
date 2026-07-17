ALTER TABLE "campaign" ADD COLUMN "blitz_advanced" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "long_form_project" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb;