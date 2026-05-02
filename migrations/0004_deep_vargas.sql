CREATE TABLE IF NOT EXISTS "content_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"month" text NOT NULL,
	"topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"regeneration_count" integer DEFAULT 0 NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_plan" ADD CONSTRAINT "content_plan_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "content_plan_org_month_idx" ON "content_plan" USING btree ("org_id","month");