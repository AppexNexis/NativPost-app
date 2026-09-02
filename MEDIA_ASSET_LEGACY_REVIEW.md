# MEDIA_ASSET_LEGACY_REVIEW.md

## Phase 1.1 Post-Migration Audit
**Date:** 2026-08-31
**Status:** COMPLETE — NO DATABASE CHANGES MADE

---

## Column Classification

### Legacy Columns (pre-Content Intelligence)

| Column | Classification | Reasoning |
|--------|---------------|-----------|
| `uploadcare_uuid` | **REMOVE LATER** | Written once in POST route, never read anywhere. Dead column. No CIE conflict. |
| `influencer_id` | **KEEP** | Actively used — written by saveMediaAsset(), queried by /api/ai-influencers/[id]/media. FK to ai_influencer. No CIE replacement. Complementary to originType. |
| `tags` | **KEEP + MIGRATE LATER** | Heavily used — written by every AI generation path, queried via JSONB @> operator, displayed in v1 API. Soft conflict with originType (tags carry richer classification). Should eventually migrate tag-based origin logic to originType, but tags remain valuable for fine-grained categorization. |
| `description` | **KEEP + MIGRATE LATER** | Actively used — written by reconcile.ts, displayed in MediaLibrary.tsx (5 locations). Stores generation prompt. Overlaps with generationInput. Triple duplication: description, aiMetadata.prompt, generationInput. |
| `source` | **DEPRECATE** | **DIRECT CONFLICT** with originType. source is the de facto origin tracker — actively queried, displayed, used for AI badge logic. originType is never written at runtime. source should eventually be replaced by originType, but requires: (1) mapping all source values to originType enum, (2) updating Media Library AI badge logic, (3) updating GET /api/media-assets filter. |
| `ai_metadata` | **DEPRECATE** | **SIGNIFICANT OVERLAP** with structured CIE columns. aiMetadata is a JSONB catch-all that already stores jobId, modelId, prompt, and other data. New structured columns (generationJobId, providerId, modelId, generationInput) were designed to hold this data. Triple prompt duplication. Should eventually be replaced by structured columns. |
| `usage_count` | **KEEP** | Simple counter. No CIE equivalent. Compatible. |
| `updated_at` | **KEEP** | Standard timestamp. Compatible. |
| `created_at` | **KEEP** | Standard timestamp. Compatible. |

### New Content Intelligence Columns

| Column | Status | Runtime Usage |
|--------|--------|---------------|
| `status` | **DORMANT** | Defined in schema, never written by runtime code. Defaults to 'generated'. |
| `origin_type` | **DORMANT** | Defined in schema, never written at runtime. Defaults to 'user_uploaded'. **DIRECT CONFLICT**: source is the active origin tracker. |
| `generation_job_id` | **DORMANT** | Defined in schema, never written at runtime. |
| `provider_id` | **DORMANT** | Defined in schema, never written at runtime. |
| `model_id` | **DORMANT** | Defined in schema, never written at runtime. |
| `provider_job_id` | **DORMANT** | Defined in schema, never written at runtime. |
| `generation_input` | **DORMANT** | Defined in schema, never written at runtime. |
| `generation_version` | **DORMANT** | Defined in schema, never written at runtime. |
| `cloudinary_public_id` | **ACTIVE** | Written by reconcile.ts and longform assemble route. Pre-existing column, reused. |
| `has_audio` | **DORMANT** | Defined in schema, never written at runtime. |
| `audio_status` | **DORMANT** | Defined in schema, never written at runtime. Defaults to 'unknown'. |
| `audio_duration_ms` through `audio_loudness_lufs` | **DORMANT** | Defined in schema, never written at runtime. |
| `file_hash` | **DORMANT** | Defined in schema, never written at runtime. |
| `perceptual_hash` | **DORMANT** | Defined in schema, never written at runtime. |
| `visual_quality_score` through `safety_quality_score` | **DORMANT** | Defined in schema, never written at runtime. |
| `quality_score` | **DORMANT** | Defined in schema, never written at runtime. |
| `quality_flags` | **DORMANT** | Defined in schema, never written at runtime. |
| `quality_checked_at` | **DORMANT** | Defined in schema, never written at runtime. |
| `embedding_model` | **DORMANT** | Defined in schema, never written at runtime. |
| `embedding_version` | **DORMANT** | Defined in schema, never written at runtime. |
| `embedded_at` | **DORMANT** | Defined in schema, never written at runtime. |
| `deleted_at` | **DORMANT** | Defined in schema, never written at runtime. |
| `metadata` | **DORMANT** | Defined in schema, never written at runtime. |
| `last_used_at` | **DORMANT** | Defined in schema, never written at runtime. |

---

## Conflict Summary

| Conflict | Severity | Resolution Required |
|----------|----------|-------------------|
| `source` vs `originType` | **HIGH** | source is active, originType is dormant. Phase 2+ migration needed. |
| `aiMetadata` vs structured CIE columns | **HIGH** | aiMetadata is active, CIE columns are dormant. Phase 2+ migration needed. |
| `tags` vs `originType` | **MEDIUM** | Tags are richer. originType can remain dormant until Phase 2+ migration. |
| `description` vs `generationInput` | **MEDIUM** | description is active, generationInput is dormant. Phase 2+ migration needed. |
| `influencer_id` | **LOW** | No conflict. Complementary. Keep as-is. |
| `uploadcare_uuid` | **NONE** | Dead column. Remove later. |

---

## Key Finding

**All Content Intelligence Engine columns on media_asset are DORMANT.** They exist in the schema and database but no runtime code writes to them. Every `insert(mediaAssetSchema)` call only sets legacy columns (`source`, `tags`, `description`, `aiMetadata`, `influencerId`).

This is **by design** — Phase 1 was schema-only. The CIE columns will become active when Phase 2+ code begins using them.

---

## Canonical Meanings — Content Intelligence Engine

| Concept | Canonical Field | Legacy Equivalent | Notes |
|---------|----------------|-------------------|-------|
| **Origin** | `origin_type` | `source` | source is active. originType dormant until migration. |
| **Status** | `status` | None | New field. Defaults to 'generated'. No legacy equivalent. |
| **Generation Provenance** | `generation_job_id` + `provider_id` + `model_id` | `aiMetadata.jobId` + `aiMetadata.modelId` | Structured vs JSONB. aiMetadata is active. |
| **Audio State** | `audio_status` | `has_audio` | has_audio is boolean. audio_status is state machine (unknown/pending_validation/valid/invalid). has_audio is active, audio_status dormant. |
| **Quality** | `quality_score` + 6 dimension scores | None | New fields. All dormant. |
| **Storage** | `cloudinary_public_id` + `url` | `url` + `uploadcare_uuid` | cloudinary_public_id is active. uploadcare_uuid is dead. |
| **Tags** | `tag` table (via `asset_tag`) | `tags` jsonb | tags jsonb is active. asset_tag table is dormant. |
| **Embeddings** | `embedding` + `visual_embedding` (vector) | None | New fields. Dormant. Use raw SQL for similarity search. |
| **Lifecycle** | `deleted_at` + `status` | None | New fields. Dormant. Soft delete pattern. |

---

## Recommendations

1. **Do NOT remove any legacy columns.** They are actively used.
2. **Do NOT remove any CIE columns.** They are dormant by design — waiting for Phase 2+ code.
3. **Phase 2 should begin using CIE columns** for NEW generation paths only.
4. **Existing code paths** (ai-studio, elevenlabs, ai-scene, longform) should continue using legacy columns until explicitly migrated.
5. **No migration of existing data** until the provider abstraction is proven.

---

**This audit confirms the merge was safe. Legacy columns are actively used and must be preserved. CIE columns are dormant and waiting for Phase 2+ activation.**
