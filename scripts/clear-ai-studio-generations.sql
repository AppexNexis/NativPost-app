-- ============================================================================
-- Clear AI Studio generations
-- ============================================================================
-- DESTRUCTIVE. Read this header before running any of it.
--
-- Two separate things store a generation, and clearing one does NOT clear the
-- other:
--
--   1. ai_studio_job   — the job rows behind the AI Studio grid (image,
--                        image-edit, video, video-lipsync). This is what you
--                        see on the page.
--   2. media_asset     — the synced copy that appears in Media Library.
--                        `ai_studio_job.media_asset_id` is ON DELETE SET NULL,
--                        so deleting jobs leaves these behind, and they keep
--                        showing up in Media Library and the media picker.
--
-- Decide which you want. Step 3 does jobs only; step 4 adds the assets.
--
-- Nothing here touches credits. Spend already recorded in the credit wallet
-- and its activity log is deliberately left alone — deleting the artefact does
-- not refund the generation, and rewriting billing history to match a cleanup
-- would be worse than leaving it accurate.
--
-- Cloudinary is NOT touched either. These statements remove database rows; the
-- underlying files stay in your Cloudinary account until deleted there.
-- ============================================================================


-- ── 1. SET YOUR SCOPE ───────────────────────────────────────────────────────
-- Strongly recommended: scope to one org. Every statement below filters on it.
-- Get the id from the app URL or: SELECT id, name FROM organization;
--
--   \set org_id 'org_3CU4YYx3bZFlQbg81ni8aN6cZOa'
--
-- If you truly want EVERY org, delete the `WHERE org_id = ...` lines. Do that
-- deliberately, not by accident.


-- ── 2. PREVIEW — run this first, always ─────────────────────────────────────
-- Confirm the counts look like what you expect before deleting anything.

SELECT kind, status, count(*) AS jobs
FROM ai_studio_job
WHERE org_id = :'org_id'
GROUP BY kind, status
ORDER BY kind, status;

SELECT count(*) AS media_assets_from_ai_studio
FROM media_asset
WHERE org_id = :'org_id'
  AND source IN ('ai-studio', 'ai-studio-longform', 'ai-studio-longform-assembly');


-- ── 3. DELETE THE JOBS (the AI Studio grid) ─────────────────────────────────
-- Wrapped in a transaction: check the row count, then COMMIT or ROLLBACK.

BEGIN;

DELETE FROM ai_studio_job
WHERE org_id = :'org_id';

-- To keep successful work and clear only the noise, use this instead:
--
--   DELETE FROM ai_studio_job
--   WHERE org_id = :'org_id'
--     AND status IN ('failed', 'reserved', 'queued');
--
-- ('reserved' and 'queued' are in-flight states — deleting those abandons jobs
--  that may still be running at fal.ai and could still fire a webhook.)

-- Inspect the reported row count, then:
COMMIT;
-- ROLLBACK;


-- ── 4. OPTIONAL — also remove the Media Library copies ──────────────────────
-- Only if you want the generations gone from Media Library too. Anything that
-- has since been used in a post will disappear from that post's media.

-- BEGIN;
--
-- DELETE FROM media_asset
-- WHERE org_id = :'org_id'
--   AND source IN ('ai-studio', 'ai-studio-longform', 'ai-studio-longform-assembly');
--
-- COMMIT;


-- ── 5. OPTIONAL — Long Form projects ────────────────────────────────────────
-- Long Form keeps its own project rows separate from ai_studio_job.

-- SELECT count(*) FROM long_form_project WHERE org_id = :'org_id';
--
-- BEGIN;
-- DELETE FROM long_form_project WHERE org_id = :'org_id';
-- COMMIT;
