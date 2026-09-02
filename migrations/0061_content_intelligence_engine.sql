-- Content Intelligence Engine — Phase 1 Migration
-- Migration: 0061_content_intelligence_engine
-- Date: 2026-08-31
-- Status: IMPLEMENTATION
--
-- This migration is ADDITIVE ONLY. It creates new tables and adds new columns.
-- It does NOT drop or modify any existing tables or columns.
-- Existing code continues to work unchanged.
--
-- Phase 1.5 Invariants:
-- - Video provenance: application-enforced (origin_type + generation_job_id)
-- - Audio invariant: audio_status field with UNKNOWN/PENDING_VALIDATION/VALID/INVALID
-- - Quality dimensions: 6 separate fields (NULL = not evaluated)
-- - Generation attempts: separate generation_attempt table
-- - Content-type qualification: application-enforced (not DB constraint)
-- - Soft delete: deleted_at field on media_asset

-- ============================================================
-- STEP 0: Enable pgvector extension
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- STEP 1: provider — Who can generate for us
-- ============================================================
CREATE TABLE IF NOT EXISTS "provider" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "type" text NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- ============================================================
-- STEP 2: model — What each provider can do
-- ============================================================
CREATE TABLE IF NOT EXISTS "model" (
  "id" text PRIMARY KEY,
  "provider_id" text NOT NULL,
  "name" text NOT NULL,
  "type" text NOT NULL,
  "input_schema" jsonb,
  "output_schema" jsonb,
  "cost_per_call" real,
  "cost_per_second" real,
  "capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- ============================================================
-- STEP 3: generation_job — Every AI generation request
-- ============================================================
CREATE TABLE IF NOT EXISTS "generation_job" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "model_id" text NOT NULL,
  "kind" text NOT NULL,
  "status" text DEFAULT 'planned' NOT NULL,
  "step" text,
  "input" jsonb NOT NULL,
  "output" jsonb,
  "external_job_id" text,
  "external_status" text,
  "credits_reserved" integer DEFAULT 0 NOT NULL,
  "credits_charged" integer DEFAULT 0,
  "estimated_cost" real,
  "actual_cost" real,
  "cost_currency" text DEFAULT 'USD',
  "cost_units" text,
  "error_message" text,
  "error_code" text,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 3 NOT NULL,
  "next_attempt_at" timestamp,
  "processing_version" text,
  "media_asset_id" uuid,
  "webhook_received_at" timestamp,
  "started_at" timestamp,
  "completed_at" timestamp,
  "duration_ms" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- ============================================================
-- STEP 4: media_asset — Every file we store
-- ============================================================
CREATE TABLE IF NOT EXISTS "media_asset" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" text,
  "status" text DEFAULT 'generated' NOT NULL,
  "origin_type" text DEFAULT 'user_uploaded' NOT NULL,
  "generation_job_id" uuid,
  "provider_id" text,
  "model_id" text,
  "provider_job_id" text,
  "generation_input" jsonb,
  "generation_version" text,
  "cloudinary_public_id" text,
  "url" text NOT NULL,
  "thumbnail_url" text,
  "asset_type" text NOT NULL,
  "mime_type" text,
  "file_size" integer,
  "width" integer,
  "height" integer,
  "aspect_ratio" text,
  "duration_seconds" real,
  "has_audio" boolean DEFAULT false NOT NULL,
  "audio_status" text DEFAULT 'unknown' NOT NULL,
  "audio_duration_ms" integer,
  "audio_codec" text,
  "audio_sample_rate" integer,
  "audio_channels" integer,
  "audio_source" text,
  "audio_loudness_lufs" real,
  "file_hash" text,
  "perceptual_hash" text,
  "visual_quality_score" real,
  "technical_quality_score" real,
  "audio_quality_score" real,
  "composition_quality_score" real,
  "semantic_quality_score" real,
  "safety_quality_score" real,
  "quality_score" real,
  "quality_flags" jsonb DEFAULT '[]'::jsonb,
  "quality_checked_at" timestamp,
  "embedding" vector(1536),
  "visual_embedding" vector(512),
  "embedding_model" text,
  "embedding_version" text,
  "embedded_at" timestamp,
  "deleted_at" timestamp,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "usage_count" integer DEFAULT 0 NOT NULL,
  "last_used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- ============================================================
-- STEP 5: generation_attempt — Per-attempt history
-- ============================================================
CREATE TABLE IF NOT EXISTS "generation_attempt" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL,
  "attempt_number" integer NOT NULL,
  "provider_id" text NOT NULL,
  "model_id" text NOT NULL,
  "status" text NOT NULL,
  "input" jsonb NOT NULL,
  "output" jsonb,
  "external_job_id" text,
  "error_message" text,
  "error_code" text,
  "duration_ms" integer,
  "credits_charged" integer DEFAULT 0,
  "cost_usd" real,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);

-- ============================================================
-- STEP 6: tag — Hierarchical taxonomy
-- ============================================================
CREATE TABLE IF NOT EXISTS "tag" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "parent_id" uuid,
  "type" text NOT NULL,
  "color" text,
  "description" text,
  "embedding" vector(1536),
  "usage_count" integer DEFAULT 0 NOT NULL,
  "is_system" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- ============================================================
-- STEP 7: asset_tag — Many-to-many: assets ↔ tags
-- ============================================================
CREATE TABLE IF NOT EXISTS "asset_tag" (
  "asset_id" uuid NOT NULL,
  "tag_id" uuid NOT NULL,
  "confidence" real DEFAULT 1.0 NOT NULL,
  "source" text DEFAULT 'manual' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "asset_tag_pkey" PRIMARY KEY ("asset_id", "tag_id")
);

-- ============================================================
-- STEP 8: content_type — Content format definitions
-- ============================================================
CREATE TABLE IF NOT EXISTS "content_type" (
  "id" text PRIMARY KEY,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "min_assets" integer DEFAULT 1 NOT NULL,
  "max_assets" integer DEFAULT 1 NOT NULL,
  "requires_video" boolean DEFAULT false NOT NULL,
  "requires_audio" boolean DEFAULT true NOT NULL,
  "requires_text_overlay" boolean DEFAULT false NOT NULL,
  "requires_caption" boolean DEFAULT true NOT NULL,
  "slot_schema" jsonb NOT NULL,
  "qualification_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "construction_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "render_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- ============================================================
-- STEP 9: content_composition — How assets combine into content
-- ============================================================
CREATE TABLE IF NOT EXISTS "content_composition" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "content_type_id" text NOT NULL,
  "org_id" text,
  "name" text,
  "version" integer DEFAULT 1 NOT NULL,
  "slots" jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "quality_score" real,
  "is_complete" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- ============================================================
-- STEP 10: library_content — Final library items
-- ============================================================
CREATE TABLE IF NOT EXISTS "library_content" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" text NOT NULL,
  "content_type_id" text NOT NULL,
  "composition_id" uuid,
  "campaign_id" uuid,
  "title" text,
  "caption" text,
  "hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "target_platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "target_account_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "scheduled_for" timestamp,
  "published_at" timestamp,
  "quality_score" real,
  "quality_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "anti_slop_score" real,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- ============================================================
-- STEP 11: asset_usage — Track where assets are used
-- ============================================================
CREATE TABLE IF NOT EXISTS "asset_usage" (
  "id" serial PRIMARY KEY,
  "asset_id" uuid NOT NULL,
  "org_id" text NOT NULL,
  "content_id" uuid,
  "composition_id" uuid,
  "campaign_id" uuid,
  "usage_type" text NOT NULL,
  "usage_context" jsonb DEFAULT '{}'::jsonb,
  "used_at" timestamp DEFAULT now() NOT NULL
);

-- ============================================================
-- STEP 12: Foreign Keys
-- ============================================================

-- model → provider
DO $$ BEGIN
  ALTER TABLE "model" ADD CONSTRAINT "model_provider_id_provider_id_fk"
    FOREIGN KEY ("provider_id") REFERENCES "provider"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- generation_job → organization
DO $$ BEGIN
  ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_org_id_organization_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- generation_job → provider
DO $$ BEGIN
  ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_provider_id_provider_id_fk"
    FOREIGN KEY ("provider_id") REFERENCES "provider"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- generation_job → model
DO $$ BEGIN
  ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_model_id_model_id_fk"
    FOREIGN KEY ("model_id") REFERENCES "model"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- generation_job → media_asset (set null on delete)
DO $$ BEGIN
  ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_media_asset_id_media_asset_id_fk"
    FOREIGN KEY ("media_asset_id") REFERENCES "media_asset"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- media_asset → organization
DO $$ BEGIN
  ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_org_id_organization_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- media_asset → generation_job (set null on delete)
DO $$ BEGIN
  ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_generation_job_id_generation_job_id_fk"
    FOREIGN KEY ("generation_job_id") REFERENCES "generation_job"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- media_asset → provider (set null on delete)
DO $$ BEGIN
  ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_provider_id_provider_id_fk"
    FOREIGN KEY ("provider_id") REFERENCES "provider"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- media_asset → model (set null on delete)
DO $$ BEGIN
  ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_model_id_model_id_fk"
    FOREIGN KEY ("model_id") REFERENCES "model"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- generation_attempt → generation_job (cascade on delete)
DO $$ BEGIN
  ALTER TABLE "generation_attempt" ADD CONSTRAINT "generation_attempt_job_id_generation_job_id_fk"
    FOREIGN KEY ("job_id") REFERENCES "generation_job"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- generation_attempt → provider
DO $$ BEGIN
  ALTER TABLE "generation_attempt" ADD CONSTRAINT "generation_attempt_provider_id_provider_id_fk"
    FOREIGN KEY ("provider_id") REFERENCES "provider"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- generation_attempt → model
DO $$ BEGIN
  ALTER TABLE "generation_attempt" ADD CONSTRAINT "generation_attempt_model_id_model_id_fk"
    FOREIGN KEY ("model_id") REFERENCES "model"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- tag → tag (self-referential, set null on delete)
DO $$ BEGIN
  ALTER TABLE "tag" ADD CONSTRAINT "tag_parent_id_tag_id_fk"
    FOREIGN KEY ("parent_id") REFERENCES "tag"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- asset_tag → media_asset (cascade on delete)
DO $$ BEGIN
  ALTER TABLE "asset_tag" ADD CONSTRAINT "asset_tag_asset_id_media_asset_id_fk"
    FOREIGN KEY ("asset_id") REFERENCES "media_asset"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- asset_tag → tag (cascade on delete)
DO $$ BEGIN
  ALTER TABLE "asset_tag" ADD CONSTRAINT "asset_tag_tag_id_tag_id_fk"
    FOREIGN KEY ("tag_id") REFERENCES "tag"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- content_composition → content_type (restrict on delete)
DO $$ BEGIN
  ALTER TABLE "content_composition" ADD CONSTRAINT "content_composition_content_type_id_content_type_id_fk"
    FOREIGN KEY ("content_type_id") REFERENCES "content_type"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- content_composition → organization (cascade on delete)
DO $$ BEGIN
  ALTER TABLE "content_composition" ADD CONSTRAINT "content_composition_org_id_organization_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- library_content → organization (cascade on delete)
DO $$ BEGIN
  ALTER TABLE "library_content" ADD CONSTRAINT "library_content_org_id_organization_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- library_content → content_type (restrict on delete)
DO $$ BEGIN
  ALTER TABLE "library_content" ADD CONSTRAINT "library_content_content_type_id_content_type_id_fk"
    FOREIGN KEY ("content_type_id") REFERENCES "content_type"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- library_content → content_composition (set null on delete)
DO $$ BEGIN
  ALTER TABLE "library_content" ADD CONSTRAINT "library_content_composition_id_content_composition_id_fk"
    FOREIGN KEY ("composition_id") REFERENCES "content_composition"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- library_content → campaign (set null on delete)
DO $$ BEGIN
  ALTER TABLE "library_content" ADD CONSTRAINT "library_content_campaign_id_campaign_id_fk"
    FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- asset_usage → media_asset (cascade on delete)
DO $$ BEGIN
  ALTER TABLE "asset_usage" ADD CONSTRAINT "asset_usage_asset_id_media_asset_id_fk"
    FOREIGN KEY ("asset_id") REFERENCES "media_asset"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- asset_usage → organization (cascade on delete)
DO $$ BEGIN
  ALTER TABLE "asset_usage" ADD CONSTRAINT "asset_usage_org_id_organization_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- asset_usage → library_content (set null on delete)
DO $$ BEGIN
  ALTER TABLE "asset_usage" ADD CONSTRAINT "asset_usage_content_id_library_content_id_fk"
    FOREIGN KEY ("content_id") REFERENCES "library_content"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- asset_usage → content_composition (set null on delete)
DO $$ BEGIN
  ALTER TABLE "asset_usage" ADD CONSTRAINT "asset_usage_composition_id_content_composition_id_fk"
    FOREIGN KEY ("composition_id") REFERENCES "content_composition"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- asset_usage → campaign (set null on delete)
DO $$ BEGIN
  ALTER TABLE "asset_usage" ADD CONSTRAINT "asset_usage_campaign_id_campaign_id_fk"
    FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- STEP 13: Indexes
-- ============================================================

-- model
CREATE INDEX IF NOT EXISTS "model_provider_id_idx" ON "model" ("provider_id");
CREATE INDEX IF NOT EXISTS "model_type_idx" ON "model" ("type");

-- media_asset
CREATE INDEX IF NOT EXISTS "media_asset_org_id_idx" ON "media_asset" ("org_id");
CREATE INDEX IF NOT EXISTS "media_asset_status_idx" ON "media_asset" ("status");
CREATE INDEX IF NOT EXISTS "media_asset_origin_type_idx" ON "media_asset" ("origin_type");
CREATE INDEX IF NOT EXISTS "media_asset_generation_job_id_idx" ON "media_asset" ("generation_job_id");
CREATE INDEX IF NOT EXISTS "media_asset_provider_id_idx" ON "media_asset" ("provider_id");
CREATE INDEX IF NOT EXISTS "media_asset_model_id_idx" ON "media_asset" ("model_id");
CREATE INDEX IF NOT EXISTS "media_asset_asset_type_idx" ON "media_asset" ("asset_type");
CREATE INDEX IF NOT EXISTS "media_asset_audio_status_idx" ON "media_asset" ("audio_status");
CREATE INDEX IF NOT EXISTS "media_asset_file_hash_idx" ON "media_asset" ("file_hash") WHERE "file_hash" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "media_asset_quality_score_idx" ON "media_asset" ("quality_score") WHERE "quality_score" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "media_asset_org_asset_type_idx" ON "media_asset" ("org_id", "asset_type");
CREATE INDEX IF NOT EXISTS "media_asset_org_created_at_idx" ON "media_asset" ("org_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "media_asset_deleted_at_idx" ON "media_asset" ("deleted_at") WHERE "deleted_at" IS NULL;

-- HNSW indexes for vector search
CREATE INDEX IF NOT EXISTS "media_asset_embedding_idx" ON "media_asset"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS "media_asset_visual_embedding_idx" ON "media_asset"
  USING hnsw ("visual_embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- generation_job
CREATE INDEX IF NOT EXISTS "generation_job_org_id_idx" ON "generation_job" ("org_id");
CREATE INDEX IF NOT EXISTS "generation_job_provider_id_idx" ON "generation_job" ("provider_id");
CREATE INDEX IF NOT EXISTS "generation_job_model_id_idx" ON "generation_job" ("model_id");
CREATE INDEX IF NOT EXISTS "generation_job_status_idx" ON "generation_job" ("status");
CREATE INDEX IF NOT EXISTS "generation_job_org_created_at_idx" ON "generation_job" ("org_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "generation_job_status_updated_at_idx" ON "generation_job" ("status", "updated_at");
CREATE INDEX IF NOT EXISTS "generation_job_media_asset_id_idx" ON "generation_job" ("media_asset_id");

CREATE UNIQUE INDEX IF NOT EXISTS "generation_job_external_job_id_idx" ON "generation_job" ("external_job_id")
  WHERE "external_job_id" IS NOT NULL;

-- generation_attempt
CREATE INDEX IF NOT EXISTS "generation_attempt_job_id_idx" ON "generation_attempt" ("job_id");
CREATE INDEX IF NOT EXISTS "generation_attempt_status_idx" ON "generation_attempt" ("status");
CREATE INDEX IF NOT EXISTS "generation_attempt_provider_id_idx" ON "generation_attempt" ("provider_id");

CREATE UNIQUE INDEX IF NOT EXISTS "generation_attempt_job_number_unique_idx" ON "generation_attempt" ("job_id", "attempt_number");

-- tag
CREATE UNIQUE INDEX IF NOT EXISTS "tag_slug_idx" ON "tag" ("slug");
CREATE INDEX IF NOT EXISTS "tag_parent_id_idx" ON "tag" ("parent_id");
CREATE INDEX IF NOT EXISTS "tag_type_idx" ON "tag" ("type");
CREATE INDEX IF NOT EXISTS "tag_usage_count_idx" ON "tag" ("usage_count" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "tag_parent_name_unique_idx" ON "tag" ("parent_id", "name")
  WHERE "parent_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "tag_embedding_idx" ON "tag"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- asset_tag
CREATE INDEX IF NOT EXISTS "asset_tag_tag_id_idx" ON "asset_tag" ("tag_id");
CREATE INDEX IF NOT EXISTS "asset_tag_source_idx" ON "asset_tag" ("source");

-- content_type
CREATE UNIQUE INDEX IF NOT EXISTS "content_type_slug_idx" ON "content_type" ("slug");

-- content_composition
CREATE INDEX IF NOT EXISTS "content_composition_content_type_id_idx" ON "content_composition" ("content_type_id");
CREATE INDEX IF NOT EXISTS "content_composition_org_id_idx" ON "content_composition" ("org_id");
CREATE INDEX IF NOT EXISTS "content_composition_is_complete_idx" ON "content_composition" ("is_complete") WHERE "is_complete" = true;

-- library_content
CREATE INDEX IF NOT EXISTS "library_content_org_id_idx" ON "library_content" ("org_id");
CREATE INDEX IF NOT EXISTS "library_content_content_type_id_idx" ON "library_content" ("content_type_id");
CREATE INDEX IF NOT EXISTS "library_content_composition_id_idx" ON "library_content" ("composition_id");
CREATE INDEX IF NOT EXISTS "library_content_campaign_id_idx" ON "library_content" ("campaign_id");
CREATE INDEX IF NOT EXISTS "library_content_status_idx" ON "library_content" ("status");
CREATE INDEX IF NOT EXISTS "library_content_org_status_idx" ON "library_content" ("org_id", "status");
CREATE INDEX IF NOT EXISTS "library_content_org_content_type_idx" ON "library_content" ("org_id", "content_type_id");
CREATE INDEX IF NOT EXISTS "library_content_quality_score_idx" ON "library_content" ("quality_score") WHERE "quality_score" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "library_content_scheduled_for_idx" ON "library_content" ("scheduled_for") WHERE "scheduled_for" IS NOT NULL;

-- asset_usage
CREATE INDEX IF NOT EXISTS "asset_usage_asset_id_idx" ON "asset_usage" ("asset_id");
CREATE INDEX IF NOT EXISTS "asset_usage_org_id_idx" ON "asset_usage" ("org_id");
CREATE INDEX IF NOT EXISTS "asset_usage_content_id_idx" ON "asset_usage" ("content_id");
CREATE INDEX IF NOT EXISTS "asset_usage_composition_id_idx" ON "asset_usage" ("composition_id");
CREATE INDEX IF NOT EXISTS "asset_usage_campaign_id_idx" ON "asset_usage" ("campaign_id");
CREATE INDEX IF NOT EXISTS "asset_usage_usage_type_idx" ON "asset_usage" ("usage_type");

-- ============================================================
-- STEP 14: CHECK Constraints
-- ============================================================

-- media_asset: origin_type must be valid
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_origin_type_check"
  CHECK ("origin_type" IN ('ai_generated', 'ai_enhanced', 'user_uploaded', 'imported', 'system_generated'));

-- media_asset: status must be valid
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_status_check"
  CHECK ("status" IN ('generated', 'processing', 'validated', 'tagged', 'available', 'quarantined', 'rejected', 'archived'));

-- media_asset: audio_status must be valid
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_audio_status_check"
  CHECK ("audio_status" IN ('unknown', 'pending_validation', 'valid', 'invalid'));

-- media_asset: quality_score in valid range (NULL = not evaluated)
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_quality_score_check"
  CHECK ("quality_score" IS NULL OR ("quality_score" >= 0 AND "quality_score" <= 1));

-- library_content: status must be valid
ALTER TABLE "library_content" ADD CONSTRAINT "library_content_status_check"
  CHECK ("status" IN ('draft', 'processing', 'quality_check', 'pending_review', 'ready', 'approved', 'scheduled', 'rejected', 'published', 'archived'));

-- generation_job: status must be valid
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_status_check"
  CHECK ("status" IN ('planned', 'queued', 'submitted', 'generating', 'provider_complete', 'downloading', 'processing', 'quality_check', 'tagging', 'ready', 'failed', 'rejected', 'cancelled'));

-- generation_job: attempts >= 0
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_attempts_check"
  CHECK ("attempts" >= 0);

-- generation_job: credits >= 0
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_credits_reserved_check"
  CHECK ("credits_reserved" >= 0);

ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_credits_charged_check"
  CHECK ("credits_charged" >= 0);

-- model: cost >= 0
ALTER TABLE "model" ADD CONSTRAINT "model_cost_per_call_check"
  CHECK ("cost_per_call" IS NULL OR "cost_per_call" >= 0);

ALTER TABLE "model" ADD CONSTRAINT "model_cost_per_second_check"
  CHECK ("cost_per_second" IS NULL OR "cost_per_second" >= 0);

-- asset_tag: confidence in valid range
ALTER TABLE "asset_tag" ADD CONSTRAINT "asset_tag_confidence_check"
  CHECK ("confidence" >= 0 AND "confidence" <= 1);

-- ============================================================
-- STEP 15: RLS Policies
-- ============================================================

ALTER TABLE "provider" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prov_service_role_all" ON "provider" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "prov_authenticated_select" ON "provider" FOR SELECT TO authenticated USING (true);

ALTER TABLE "model" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mod_service_role_all" ON "model" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "mod_authenticated_select" ON "model" FOR SELECT TO authenticated USING (true);

ALTER TABLE "generation_job" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gj_service_role_all" ON "generation_job" FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "media_asset" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ma_service_role_all" ON "media_asset" FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "generation_attempt" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ga_service_role_all" ON "generation_attempt" FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "tag" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tag_service_role_all" ON "tag" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "tag_authenticated_select" ON "tag" FOR SELECT TO authenticated USING (true);

ALTER TABLE "asset_tag" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "at_service_role_all" ON "asset_tag" FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "content_type" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ct_service_role_all" ON "content_type" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "ct_authenticated_select" ON "content_type" FOR SELECT TO authenticated USING (true);

ALTER TABLE "content_composition" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cc_service_role_all" ON "content_composition" FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "library_content" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lc_service_role_all" ON "library_content" FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "asset_usage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "au_service_role_all" ON "asset_usage" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- STEP 16: Seed Data — Providers
-- ============================================================
INSERT INTO "provider" ("id", "name", "type", "config", "is_active", "priority") VALUES
  ('fal', 'Fal.ai', 'media_generation', '{"env_var": "FAL_KEY", "base_url": "https://queue.fal.run", "webhook_secret_env": "FAL_KEY"}', true, 10),
  ('elevenlabs', 'ElevenLabs', 'audio_generation', '{"env_var": "ELEVENLABS_API_KEY", "base_url": "https://api.elevenlabs.io"}', true, 10),
  ('anthropic', 'Anthropic', 'text_generation', '{"env_var": "ANTHROPIC_API_KEY", "sdk": "@anthropic-ai/sdk"}', true, 10),
  ('deepseek', 'DeepSeek', 'text_generation', '{"env_var": "DEEPSEEK_API_KEY", "base_url": "https://api.deepseek.com"}', true, 5),
  ('openai', 'OpenAI', 'text_generation', '{"env_var": "OPENAI_API_KEY", "base_url": "https://api.openai.com"}', true, 3),
  ('nativpost-image-engine', 'NativPost Image Engine', 'media_generation', '{"env_var": "NATIVPOST_IMAGE_URL", "api_key_env": "NATIVPOST_ENGINE_API_KEY"}', true, 8),
  ('nativpost-video-engine', 'NativPost Video Engine', 'media_generation', '{"env_var": "NATIVPOST_VIDEO_URL", "api_key_env": "NATIVPOST_ENGINE_API_KEY"}', true, 8),
  ('unsplash', 'Unsplash', 'media_generation', '{"env_var": "UNSPLASH_ACCESS_KEY", "base_url": "https://api.unsplash.com"}', true, 2)
ON CONFLICT ("id") DO NOTHING;

-- ============================================================
-- STEP 17: Seed Data — Models
-- ============================================================
INSERT INTO "model" ("id", "provider_id", "name", "type", "cost_per_call", "capabilities", "is_active") VALUES
  ('flux-dev', 'fal', 'FLUX.1 [dev]', 'image', 0.025, '{"aspects": ["1:1", "9:16", "16:9", "4:5"]}', true),
  ('krea-2-turbo', 'fal', 'Krea 2 Turbo', 'image', 0.01, '{"aspects": ["1:1", "9:16", "16:9", "4:5"]}', true),
  ('krea-2-turbo-style', 'fal', 'Krea 2 Turbo (Style)', 'image', 0.012, '{"aspects": ["1:1", "9:16", "16:9", "4:5"], "requires_image": true}', true),
  ('gpt-image-2', 'fal', 'GPT Image 2', 'image', 0.15, '{"aspects": ["1:1", "9:16", "16:9"]}', true),
  ('gpt-image-2-edit', 'fal', 'GPT Image 2 Edit', 'image', 0.20, '{"aspects": ["1:1", "9:16", "16:9"], "requires_image": true}', true),
  ('pixverse-v6-i2v', 'fal', 'Pixverse V6', 'video', 0.50, '{"max_duration": 8, "aspects": ["9:16", "1:1", "16:9"], "requires_image": true}', true),
  ('kling-v3-turbo-pro-i2v', 'fal', 'Kling V3 Turbo Pro', 'video', 0.14, '{"max_duration": 15, "per_second": true, "aspects": ["9:16", "1:1", "16:9"], "requires_image": true}', true),
  ('happy-horse-i2v', 'fal', 'Happy Horse v1.1', 'video', 0.90, '{"max_duration": 15, "per_second": true, "aspects": ["9:16", "1:1", "16:9", "4:5"], "requires_image": true, "native_audio": true, "multilingual_lipsync": true}', true),
  ('kling-v3-pro-i2v', 'fal', 'Kling V3 Pro', 'video', 0.84, '{"max_duration": 15, "per_second": true, "aspects": ["9:16", "1:1", "16:9", "4:5"], "requires_image": true, "native_audio": true}', true),
  ('seedance-2-i2v', 'fal', 'Seedance 2.0 Pro', 'video', 1.51, '{"max_duration": 12, "aspects": ["9:16", "1:1", "16:9"], "requires_image": true}', true),
  ('veed-lipsync', 'fal', 'Veed Lipsync', 'video-lipsync', 0.30, '{"aspects": ["9:16", "1:1", "16:9"], "requires_image": true, "requires_audio": true}', true),
  ('elevenlabs-tts', 'elevenlabs', 'ElevenLabs TTS', 'audio', 0.01, '{"max_chars": 5000, "voices": "library"}', true),
  ('claude-sonnet-4-6', 'anthropic', 'Claude Sonnet 4.6', 'text', 0.003, '{"max_tokens": 8192, "context_window": 200000}', true),
  ('claude-haiku-4-5', 'anthropic', 'Claude Haiku 4.5', 'text', 0.00025, '{"max_tokens": 8192, "context_window": 200000}', true),
  ('deepseek-chat', 'deepseek', 'DeepSeek Chat', 'text', 0.00014, '{"max_tokens": 8192, "context_window": 128000}', true),
  ('nativpost-puppeteer', 'nativpost-image-engine', 'Puppeteer Template Renderer', 'image', 0.001, '{"templates": ["quote-card", "announcement-card", "stat-card"]}', true),
  ('nativpost-flux-scene', 'nativpost-image-engine', 'FLUX Scene Generator', 'image', 0.025, '{"aspects": ["9:16", "16:9"]}', true),
  ('nativpost-video-render', 'nativpost-video-engine', 'Video Renderer', 'video', 0.01, '{"templates": ["slideshow", "ugc-ad", "data-story", "text-motion"]}', true)
ON CONFLICT ("id") DO NOTHING;

-- ============================================================
-- STEP 18: Seed Data — Content Types
-- ============================================================
INSERT INTO "content_type" ("id", "slug", "name", "min_assets", "max_assets", "requires_video", "requires_audio", "requires_text_overlay", "requires_caption", "slot_schema", "qualification_rules", "construction_rules", "render_config") VALUES
  ('single_image', 'single-image', 'Single Image', 1, 1, false, true, false, true,
   '{"image": {"type": "image", "required": true}, "text_overlay": {"type": "text", "required": false}}',
   '{"min_quality_score": 0.5}',
   '{}',
   '{"default_aspect": "9:16", "supported_aspects": ["9:16", "1:1", "16:9", "4:5"]}'),

  ('slideshow', 'slideshow', 'Slideshow', 3, 5, false, true, true, true,
   '{"slide_1": {"type": "image", "required": true}, "slide_2": {"type": "image", "required": true}, "slide_3": {"type": "image", "required": true}, "background_music": {"type": "audio", "required": true}, "text_overlay": {"type": "text", "required": true}}',
   '{"min_duration": 5, "max_duration": 30, "min_quality_score": 0.5}',
   '{"similarity_required": true, "diversity_required": true, "min_tag_overlap": 1, "max_visual_similarity": 0.85}',
   '{"default_aspect": "9:16", "supported_aspects": ["9:16"], "slide_duration": 3}'),

  ('reel', 'reel', 'Reel', 1, 1, true, true, true, true,
   '{"hook_video": {"type": "video", "required": true, "max_duration": 15}, "text_overlay": {"type": "text", "required": true}}',
   '{"min_duration": 3, "max_duration": 60, "require_audio": true, "require_non_silent_audio": true, "min_quality_score": 0.6}',
   '{}',
   '{"default_aspect": "9:16", "supported_aspects": ["9:16"]}'),

  ('ugc', 'ugc', 'UGC', 1, 1, true, true, true, true,
   '{"face_video": {"type": "video", "required": true, "max_duration": 15}, "text_overlay": {"type": "text", "required": true}}',
   '{"min_duration": 3, "max_duration": 30, "require_audio": true, "require_non_silent_audio": true, "require_face": true, "min_quality_score": 0.6}',
   '{}',
   '{"default_aspect": "9:16", "supported_aspects": ["9:16"]}'),

  ('wall_of_text', 'wall-of-text', 'Wall of Text', 1, 1, false, true, true, true,
   '{"background": {"type": "image", "required": true}, "text_overlay": {"type": "text", "required": true}}',
   '{"min_quality_score": 0.4}',
   '{}',
   '{"default_aspect": "9:16", "supported_aspects": ["9:16", "1:1"]}'),

  ('talking_head', 'talking-head', 'Talking Head', 1, 1, true, true, true, true,
   '{"face_video": {"type": "video", "required": true, "max_duration": 15}, "text_overlay": {"type": "text", "required": true}}',
   '{"min_duration": 3, "max_duration": 60, "require_audio": true, "require_non_silent_audio": true, "require_face": true, "min_quality_score": 0.7}',
   '{}',
   '{"default_aspect": "9:16", "supported_aspects": ["9:16"]}'),

  ('green_screen', 'green-screen', 'Green Screen', 1, 1, true, true, true, true,
   '{"face_video": {"type": "video", "required": true, "max_duration": 15}, "background": {"type": "image", "required": true}, "text_overlay": {"type": "text", "required": true}}',
   '{"min_duration": 3, "max_duration": 30, "require_audio": true, "require_non_silent_audio": true, "require_face": true, "min_quality_score": 0.6}',
   '{}',
   '{"default_aspect": "9:16", "supported_aspects": ["9:16"]}')
ON CONFLICT ("id") DO NOTHING;
