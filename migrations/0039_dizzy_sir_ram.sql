CREATE TABLE IF NOT EXISTS "blitz_media_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"asset_public_id" text NOT NULL,
	"asset_type" text NOT NULL,
	"content_item_id" uuid,
	"campaign_id" uuid,
	"used_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "blitz_template_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"template_id" uuid NOT NULL,
	"content_item_id" uuid,
	"campaign_id" uuid,
	"used_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_template" ADD COLUMN "source_media_type" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blitz_media_usage" ADD CONSTRAINT "blitz_media_usage_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blitz_media_usage" ADD CONSTRAINT "blitz_media_usage_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blitz_media_usage" ADD CONSTRAINT "blitz_media_usage_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blitz_template_usage" ADD CONSTRAINT "blitz_template_usage_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blitz_template_usage" ADD CONSTRAINT "blitz_template_usage_template_id_content_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."content_template"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blitz_template_usage" ADD CONSTRAINT "blitz_template_usage_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blitz_template_usage" ADD CONSTRAINT "blitz_template_usage_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blitz_media_usage_org_asset_idx" ON "blitz_media_usage" USING btree ("org_id","asset_public_id","used_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blitz_media_usage_org_used_idx" ON "blitz_media_usage" USING btree ("org_id","used_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blitz_template_usage_org_tpl_idx" ON "blitz_template_usage" USING btree ("org_id","template_id","used_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blitz_template_usage_org_used_idx" ON "blitz_template_usage" USING btree ("org_id","used_at");