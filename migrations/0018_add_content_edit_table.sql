CREATE TABLE IF NOT EXISTS "content_edit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL,
  "content_item_id" uuid REFERENCES "content_item"("id") ON DELETE CASCADE,
  "template_id" uuid REFERENCES "content_template"("id") ON DELETE SET NULL,
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
  "audio_track" jsonb DEFAULT NULL,
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

CREATE INDEX IF NOT EXISTS "content_edit_org_id_idx" ON "content_edit"("org_id");
CREATE INDEX IF NOT EXISTS "content_edit_content_item_id_idx" ON "content_edit"("content_item_id");
CREATE INDEX IF NOT EXISTS "content_edit_template_id_idx" ON "content_edit"("template_id");
CREATE INDEX IF NOT EXISTS "content_edit_status_idx" ON "content_edit"("status");
CREATE INDEX IF NOT EXISTS "content_edit_created_at_idx" ON "content_edit"("created_at" DESC);
