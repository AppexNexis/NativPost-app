CREATE TABLE IF NOT EXISTS "content_edit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"content_item_id" uuid,
	"template_id" uuid,
	"source" text NOT NULL,
	"content_type" text NOT NULL,
	"content_mode" text DEFAULT 'normal',
	"target_platforms" jsonb DEFAULT '[]'::jsonb,
	"aspect_ratio" text DEFAULT '9:16',
	"script" jsonb DEFAULT '{}'::jsonb,
	"style" jsonb DEFAULT '{}'::jsonb,
	"layout" text DEFAULT 'centered',
	"timing" jsonb DEFAULT '{}'::jsonb,
	"media_slots" jsonb DEFAULT '{}'::jsonb,
	"audio_track" jsonb DEFAULT 'null'::jsonb,
	"enrichment" jsonb DEFAULT '{}'::jsonb,
	"brand_profile_snapshot" jsonb DEFAULT '{}'::jsonb,
	"preview_render_url" text,
	"preview_render_id" text,
	"final_render_url" text,
	"final_render_id" text,
	"render_status" text DEFAULT 'idle',
	"status" text DEFAULT 'draft',
	"is_autosave" boolean DEFAULT false,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_edit" ADD CONSTRAINT "content_edit_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_edit" ADD CONSTRAINT "content_edit_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_edit" ADD CONSTRAINT "content_edit_template_id_content_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."content_template"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
