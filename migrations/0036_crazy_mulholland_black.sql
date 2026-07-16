CREATE TABLE IF NOT EXISTS "long_form_project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text,
	"title" text,
	"topic" text NOT NULL,
	"script" text,
	"narration_text" text,
	"scenes" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'draft',
	"credits_reserved" integer DEFAULT 0,
	"credits_charged" integer,
	"assembled_video_url" text,
	"assembled_video_asset_id" uuid,
	"error_message" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "long_form_project" ADD CONSTRAINT "long_form_project_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
