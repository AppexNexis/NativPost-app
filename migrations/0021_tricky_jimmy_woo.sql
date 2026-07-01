CREATE TABLE IF NOT EXISTS "apify_seed_run" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"actor_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb,
	"items_fetched" integer,
	"items_inserted" integer,
	"error_message" text,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"processed_at" timestamp
);
