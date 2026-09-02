-- Fix: add 'submitting' and 'completed' to generation_job status CHECK constraint.
-- These statuses are used by the GenerationFactory code but were missing from the
-- original constraint. Drops the old constraint and recreates with the full list.

ALTER TABLE "generation_job" DROP CONSTRAINT IF EXISTS "generation_job_status_check";

ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_status_check"
  CHECK ("status" IN (
    'planned', 'queued', 'submitting', 'submitted', 'generating',
    'provider_complete', 'downloading', 'processing', 'completed',
    'quality_check', 'tagging', 'ready', 'failed', 'rejected', 'cancelled'
  ));
