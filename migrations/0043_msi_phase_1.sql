CREATE TABLE IF NOT EXISTS "authorization_grant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"brand_profile_id" uuid NOT NULL,
	"grant_version" text NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"signed_by_user_id" text NOT NULL,
	"signed_at" timestamp DEFAULT now() NOT NULL,
	"document_url" text,
	"status" text DEFAULT 'active' NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "managed_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"brand_profile_id" uuid NOT NULL,
	"authorization_grant_id" uuid NOT NULL,
	"order_id" uuid,
	"platform" text NOT NULL,
	"country" text NOT NULL,
	"target_locale" text,
	"niche" text,
	"handle_preferences" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"display_name" text,
	"lifecycle_state" text DEFAULT 'ordered' NOT NULL,
	"credential_custody" text DEFAULT 'customer_owned' NOT NULL,
	"social_account_id" uuid,
	"health_score" integer,
	"live_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "msi_account_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"managed_account_id" uuid NOT NULL,
	"window_opens_at" timestamp DEFAULT now() NOT NULL,
	"window_closes_at" timestamp NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"responded_at" timestamp,
	"responded_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "msi_activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"managed_account_id" uuid,
	"job_id" uuid,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "msi_capacity_reservation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"order_id" uuid,
	"country" text NOT NULL,
	"platform" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'held' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "msi_credential" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"managed_account_id" uuid NOT NULL,
	"vault_ref" text NOT NULL,
	"encrypted_dek" text,
	"custody_state" text DEFAULT 'provisioning' NOT NULL,
	"last_rotated_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "msi_device_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"managed_account_id" uuid NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"released_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "msi_device" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"country" text NOT NULL,
	"carrier" text,
	"sim_identifier" text,
	"capacity" integer DEFAULT 5 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"managed_by_operator_id" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "msi_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"managed_account_id" uuid NOT NULL,
	"job_type" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"assigned_operator_id" uuid,
	"assigned_device_id" uuid,
	"sla_due_at" timestamp,
	"failure_reason" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "msi_operator" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"display_name" text,
	"country" text NOT NULL,
	"role" text DEFAULT 'operator' NOT NULL,
	"capacity" integer DEFAULT 10 NOT NULL,
	"active_load" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "msi_provisioning_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"stripe_checkout_session_id" text,
	"stripe_subscription_id" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"config_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "msi_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"task_type" text NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"completed_by_role" text,
	"completed_by_user_id" text,
	"evidence_url" text,
	"notes" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "authorization_grant" ADD CONSTRAINT "authorization_grant_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "authorization_grant" ADD CONSTRAINT "authorization_grant_brand_profile_id_brand_profile_id_fk" FOREIGN KEY ("brand_profile_id") REFERENCES "public"."brand_profile"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "managed_account" ADD CONSTRAINT "managed_account_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "managed_account" ADD CONSTRAINT "managed_account_brand_profile_id_brand_profile_id_fk" FOREIGN KEY ("brand_profile_id") REFERENCES "public"."brand_profile"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "managed_account" ADD CONSTRAINT "managed_account_authorization_grant_id_authorization_grant_id_fk" FOREIGN KEY ("authorization_grant_id") REFERENCES "public"."authorization_grant"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "managed_account" ADD CONSTRAINT "managed_account_order_id_msi_provisioning_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."msi_provisioning_order"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "managed_account" ADD CONSTRAINT "managed_account_social_account_id_social_account_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_account"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msi_account_review" ADD CONSTRAINT "msi_account_review_managed_account_id_managed_account_id_fk" FOREIGN KEY ("managed_account_id") REFERENCES "public"."managed_account"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msi_activity_log" ADD CONSTRAINT "msi_activity_log_managed_account_id_managed_account_id_fk" FOREIGN KEY ("managed_account_id") REFERENCES "public"."managed_account"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msi_activity_log" ADD CONSTRAINT "msi_activity_log_job_id_msi_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."msi_job"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msi_capacity_reservation" ADD CONSTRAINT "msi_capacity_reservation_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msi_capacity_reservation" ADD CONSTRAINT "msi_capacity_reservation_order_id_msi_provisioning_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."msi_provisioning_order"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msi_credential" ADD CONSTRAINT "msi_credential_managed_account_id_managed_account_id_fk" FOREIGN KEY ("managed_account_id") REFERENCES "public"."managed_account"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msi_device_assignment" ADD CONSTRAINT "msi_device_assignment_device_id_msi_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."msi_device"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msi_device_assignment" ADD CONSTRAINT "msi_device_assignment_managed_account_id_managed_account_id_fk" FOREIGN KEY ("managed_account_id") REFERENCES "public"."managed_account"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msi_device" ADD CONSTRAINT "msi_device_managed_by_operator_id_msi_operator_id_fk" FOREIGN KEY ("managed_by_operator_id") REFERENCES "public"."msi_operator"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msi_job" ADD CONSTRAINT "msi_job_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msi_job" ADD CONSTRAINT "msi_job_managed_account_id_managed_account_id_fk" FOREIGN KEY ("managed_account_id") REFERENCES "public"."managed_account"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msi_job" ADD CONSTRAINT "msi_job_assigned_operator_id_msi_operator_id_fk" FOREIGN KEY ("assigned_operator_id") REFERENCES "public"."msi_operator"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msi_job" ADD CONSTRAINT "msi_job_assigned_device_id_msi_device_id_fk" FOREIGN KEY ("assigned_device_id") REFERENCES "public"."msi_device"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msi_provisioning_order" ADD CONSTRAINT "msi_provisioning_order_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msi_task" ADD CONSTRAINT "msi_task_job_id_msi_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."msi_job"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "authorization_grant_org_idx" ON "authorization_grant" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "authorization_grant_brand_idx" ON "authorization_grant" USING btree ("brand_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "managed_account_org_idx" ON "managed_account" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "managed_account_state_idx" ON "managed_account" USING btree ("lifecycle_state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "managed_account_country_platform_idx" ON "managed_account" USING btree ("country","platform");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msi_account_review_account_idx" ON "msi_account_review" USING btree ("managed_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msi_activity_log_account_idx" ON "msi_activity_log" USING btree ("managed_account_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msi_activity_log_job_idx" ON "msi_activity_log" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msi_capacity_reservation_org_idx" ON "msi_capacity_reservation" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msi_capacity_reservation_cp_idx" ON "msi_capacity_reservation" USING btree ("country","platform","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "msi_credential_account_idx" ON "msi_credential" USING btree ("managed_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msi_device_assignment_device_idx" ON "msi_device_assignment" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msi_device_assignment_account_idx" ON "msi_device_assignment" USING btree ("managed_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msi_device_country_idx" ON "msi_device" USING btree ("country","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msi_job_account_idx" ON "msi_job" USING btree ("managed_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msi_job_state_idx" ON "msi_job" USING btree ("state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msi_job_org_idx" ON "msi_job" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "msi_operator_clerk_idx" ON "msi_operator" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msi_operator_country_idx" ON "msi_operator" USING btree ("country","role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msi_provisioning_order_org_idx" ON "msi_provisioning_order" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msi_task_job_idx" ON "msi_task" USING btree ("job_id","sequence");