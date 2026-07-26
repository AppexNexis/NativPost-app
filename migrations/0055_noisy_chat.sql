CREATE TABLE IF NOT EXISTS "msi_analytics_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"managed_account_id" uuid NOT NULL,
	"billing_period" text NOT NULL,
	"status" text DEFAULT 'in_review' NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"generated_at" timestamp,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msi_analytics_report" ADD CONSTRAINT "msi_analytics_report_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msi_analytics_report" ADD CONSTRAINT "msi_analytics_report_managed_account_id_managed_account_id_fk" FOREIGN KEY ("managed_account_id") REFERENCES "public"."managed_account"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "msi_analytics_report_acct_period_idx" ON "msi_analytics_report" USING btree ("managed_account_id","billing_period");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msi_analytics_report_org_idx" ON "msi_analytics_report" USING btree ("org_id");