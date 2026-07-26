CREATE TABLE IF NOT EXISTS "msi_ad_campaign" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"managed_account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"platform" text NOT NULL,
	"objective" text,
	"status" text DEFAULT 'active' NOT NULL,
	"management_pct" integer NOT NULL,
	"spend_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "msi_community_reply" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"managed_account_id" uuid NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"note" text,
	"logged_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msi_ad_campaign" ADD CONSTRAINT "msi_ad_campaign_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msi_ad_campaign" ADD CONSTRAINT "msi_ad_campaign_managed_account_id_managed_account_id_fk" FOREIGN KEY ("managed_account_id") REFERENCES "public"."managed_account"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msi_community_reply" ADD CONSTRAINT "msi_community_reply_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msi_community_reply" ADD CONSTRAINT "msi_community_reply_managed_account_id_managed_account_id_fk" FOREIGN KEY ("managed_account_id") REFERENCES "public"."managed_account"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msi_ad_campaign_org_idx" ON "msi_ad_campaign" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msi_community_reply_org_idx" ON "msi_community_reply" USING btree ("org_id");