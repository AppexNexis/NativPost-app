CREATE TABLE IF NOT EXISTS "ai_studio_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text,
	"model_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"fal_request_id" text,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"credits_reserved" integer DEFAULT 0 NOT NULL,
	"credits_charged" integer,
	"error_message" text,
	"media_asset_id" uuid,
	"webhook_received_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_studio_job" ADD CONSTRAINT "ai_studio_job_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_studio_job" ADD CONSTRAINT "ai_studio_job_media_asset_id_media_asset_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_asset"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
