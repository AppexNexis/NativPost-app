CREATE TABLE IF NOT EXISTS "msi_billable_publish_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"managed_account_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"content_item_id" uuid,
	"platform" text NOT NULL,
	"billing_period" text NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"reported_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msi_billable_publish_event" ADD CONSTRAINT "msi_billable_publish_event_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msi_billable_publish_event" ADD CONSTRAINT "msi_billable_publish_event_managed_account_id_managed_account_id_fk" FOREIGN KEY ("managed_account_id") REFERENCES "public"."managed_account"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msi_billable_publish_event" ADD CONSTRAINT "msi_billable_publish_event_job_id_msi_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."msi_job"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msi_billable_publish_event" ADD CONSTRAINT "msi_billable_publish_event_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "msi_billable_publish_job_idx" ON "msi_billable_publish_event" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msi_billable_publish_period_idx" ON "msi_billable_publish_event" USING btree ("org_id","billing_period");