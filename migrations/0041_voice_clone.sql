CREATE TABLE IF NOT EXISTS "voice_clone" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" text NOT NULL,
  "name" text NOT NULL,
  "elevenlabs_voice_id" text NOT NULL,
  "source_url" text,
  "preview_url" text,
  "created_by" text,
  "deleted_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "voice_clone" ADD CONSTRAINT "voice_clone_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_clone_org_id_idx" ON "voice_clone" ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_clone_deleted_at_idx" ON "voice_clone" ("deleted_at");
