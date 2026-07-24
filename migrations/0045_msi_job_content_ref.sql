ALTER TABLE "msi_job" ADD COLUMN "content_item_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msi_job" ADD CONSTRAINT "msi_job_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
