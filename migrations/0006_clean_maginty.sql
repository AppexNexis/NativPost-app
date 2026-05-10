CREATE TABLE IF NOT EXISTS "knowledge_article" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"body" text NOT NULL,
	"excerpt" text,
	"category" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"is_published" boolean DEFAULT true NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"helpful" integer DEFAULT 0,
	"not_helpful" integer DEFAULT 0,
	"view_count" integer DEFAULT 0,
	"author_user_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "support_attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"message_id" uuid,
	"file_name" text NOT NULL,
	"file_url" text NOT NULL,
	"file_size" integer,
	"mime_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "support_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_type" text NOT NULL,
	"author_user_id" text,
	"author_name" text NOT NULL,
	"author_email" text,
	"body" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"original_body" text,
	"ai_polished" boolean DEFAULT false,
	"email_message_id" text,
	"email_delivered" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "support_ticket" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"submitter_user_id" text NOT NULL,
	"submitter_email" text NOT NULL,
	"submitter_name" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"ai_summary" text,
	"ai_category" text,
	"ai_priority" text DEFAULT 'medium',
	"ai_auto_resolved" boolean DEFAULT false,
	"ai_confidence" real,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_to_user_id" text,
	"source" text DEFAULT 'web' NOT NULL,
	"inbound_email_id" text,
	"resolved_at" timestamp,
	"closed_at" timestamp,
	"csat_score" integer,
	"csat_feedback" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "support_attachment" ADD CONSTRAINT "support_attachment_ticket_id_support_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_ticket"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "support_attachment" ADD CONSTRAINT "support_attachment_message_id_support_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."support_message"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "support_message" ADD CONSTRAINT "support_message_ticket_id_support_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_ticket"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
