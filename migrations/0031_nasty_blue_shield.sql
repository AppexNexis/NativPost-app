CREATE TABLE IF NOT EXISTS "influencer_angle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"influencer_id" uuid NOT NULL,
	"content_angle_id" uuid NOT NULL,
	"weight" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_influencer" ALTER COLUMN "org_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_influencer" ADD COLUMN "voice_id" text;--> statement-breakpoint
ALTER TABLE "ai_influencer" ADD COLUMN "voice_provider" text DEFAULT 'elevenlabs';--> statement-breakpoint
ALTER TABLE "ai_influencer" ADD COLUMN "lora_training_job_id" text;--> statement-breakpoint
ALTER TABLE "ai_influencer" ADD COLUMN "lora_status" text DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "ai_influencer" ADD COLUMN "is_system" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "ai_influencer" ADD COLUMN "persona_prompt" text;--> statement-breakpoint
ALTER TABLE "ai_influencer" ADD COLUMN "archetype" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "influencer_angle" ADD CONSTRAINT "influencer_angle_influencer_id_ai_influencer_id_fk" FOREIGN KEY ("influencer_id") REFERENCES "public"."ai_influencer"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "influencer_angle" ADD CONSTRAINT "influencer_angle_content_angle_id_content_angle_id_fk" FOREIGN KEY ("content_angle_id") REFERENCES "public"."content_angle"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
