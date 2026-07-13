-- Phase 1 social-profile onboarding provenance.
-- Nullable text columns so existing rows stay valid; app treats null as
-- "onboarded via website (legacy)".
ALTER TABLE "brand_profile" ADD COLUMN "brand_profile_source" text;--> statement-breakpoint
ALTER TABLE "brand_profile" ADD COLUMN "brand_profile_source_handle" text;
