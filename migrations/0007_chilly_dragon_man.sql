ALTER TABLE "support_ticket" ADD COLUMN "ai_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "support_ticket" ADD COLUMN "ai_history" jsonb DEFAULT '[]'::jsonb;