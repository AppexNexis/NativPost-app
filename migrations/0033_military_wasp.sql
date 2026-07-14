ALTER TABLE "media_asset" ADD COLUMN "influencer_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_influencer_id_ai_influencer_id_fk" FOREIGN KEY ("influencer_id") REFERENCES "public"."ai_influencer"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
