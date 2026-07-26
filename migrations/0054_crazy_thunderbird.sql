CREATE TABLE IF NOT EXISTS "msi_addon_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"addon_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"tier_id" text,
	"stripe_subscription_item_id" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"activated_at" timestamp,
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msi_addon_subscription" ADD CONSTRAINT "msi_addon_subscription_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "msi_addon_org_addon_idx" ON "msi_addon_subscription" USING btree ("org_id","addon_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msi_addon_org_idx" ON "msi_addon_subscription" USING btree ("org_id");