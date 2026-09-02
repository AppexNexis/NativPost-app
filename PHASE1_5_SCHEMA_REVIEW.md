# Content Intelligence Engine — Phase 1.5 Schema Review / Invariants Lockdown

**Version:** 1.0.0
**Date:** 2026-08-31
**Status:** CHANGES REQUIRED
**Review Scope:** 24 non-negotiable business invariants against Phase 1 design

---

## 1. Executive Summary

The Phase 1 design is structurally sound. The core hierarchy (MediaAsset → ContentComposition → LibraryContent) is correct. The provider/model abstraction is clean. The JSONB-driven content type system is flexible.

However, **7 critical gaps** and **9 moderate gaps** were identified. None are architectural — they are all schema-level refinements that prevent the database from silently permitting states that violate business rules.

**Critical gaps requiring schema changes before migration:**

1. **No `audio_status` field** — `has_audio` boolean cannot represent UNKNOWN/PENDING/VALID/INVALID
2. **No `media_asset.status` field** — no lifecycle state (GENERATED/PROCESSING/VALIDATED/TAGGED/AVAILABLE/QUARANTINED/REJECTED/ARCHIVED)
3. **No `library_content.status` values** for PROCESSING/QUALITY_CHECK/READY/ARCHIVED
4. **No `generation_job` cost fields** — missing estimated_cost, actual_cost, currency
5. **No `generation_job` version fields** — missing processing_version, embedding_version
6. **No `media_asset.generation_version`** — can't reproduce or explain why an asset was accepted
7. **No `content_composition.version`** — can't track construction algorithm versions

**The schema must be updated before the migration is implemented.**

---

## 2. Revised ERD

```
                         ┌──────────────────┐
                         │   organization   │ (existing — unchanged)
                         └────────┬─────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
          ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│    provider     │    │  content_type    │    │       tag        │
│                 │    │                  │    │                  │
│ id (PK)         │    │ id (PK)          │    │ id (PK)          │
│ name            │    │ slug (UNIQUE)    │    │ name             │
│ type            │    │ name             │    │ slug (UNIQUE)    │
│ config          │    │ description      │    │ parent_id (FK→tag)│
│ is_active       │    │ min_assets       │    │ type             │
│ priority        │    │ max_assets       │    │ color            │
│ created_at      │    │ requires_video   │    │ description      │
│ updated_at      │    │ requires_audio   │    │ embedding        │
└────────┬────────┘    │ requires_text..  │    │ usage_count      │
         │             │ requires_caption │    │ is_system        │
         ▼             │ slot_schema      │    │ is_active        │
┌─────────────────┐    │ qualification..  │    │ created_at       │
│     model       │    │ construction..   │    └────────┬─────────┘
│                 │    │ render_config    │             │
│ id (PK)         │    │ is_active        │             │
│ provider_id(FK) │    │ created_at       │             │
│ name            │    └──────────────────┘             │
│ type            │                                     │
│ input_schema    │                                     │
│ output_schema   │                                     │
│ cost_per_call   │                                     │
│ cost_per_second │                                     │
│ capabilities    │                                     │
│ is_active       │                                     │
│ created_at      │                                     │
└────────┬────────┘                                     │
         │                                              │
         ▼                                              │
┌──────────────────────────────────┐                    │
│        generation_job            │                    │
│                                  │                    │
│ id (PK)                          │                    │
│ org_id (FK→organization)         │                    │
│ provider_id (FK→provider)        │                    │
│ model_id (FK→model)              │                    │
│ kind                             │                    │
│ status                           │                    │
│ step                             │                    │
│ input (JSONB)                    │                    │
│ output (JSONB)                   │                    │
│ external_job_id                  │                    │
│ external_status                  │                    │
│ credits_reserved                 │                    │
│ credits_charged                  │                    │
│ estimated_cost                   │  ← NEW             │
│ actual_cost                      │  ← NEW             │
│ cost_currency                    │  ← NEW             │
│ cost_units                       │  ← NEW             │
│ error_message                    │                    │
│ error_code                       │                    │
│ attempts                         │                    │
│ max_attempts                     │                    │
│ next_attempt_at                  │                    │
│ processing_version               │  ← NEW             │
│ media_asset_id (FK→media_asset)  │                    │
│ webhook_received_at              │                    │
│ started_at                       │                    │
│ completed_at                     │                    │
│ duration_ms                      │                    │
│ created_at                       │                    │
│ updated_at                       │                    │
└──────────────┬───────────────────┘                    │
               │                                        │
               ▼                                        │
┌──────────────────────────────────┐                    │
│         media_asset              │◄───────────────────┘
│                                  │        (via asset_tag)
│ id (PK)                          │
│ org_id (FK→organization)         │
│ status                  ← NEW    │
│ origin_type                      │
│ generation_job_id (FK→gen_job)   │
│ provider_id (FK→provider)        │
│ model_id (FK→model)              │
│ provider_job_id                  │
│ generation_input (JSONB)         │
│ generation_version    ← NEW      │
│ cloudinary_public_id             │
│ url                              │
│ thumbnail_url                    │
│ asset_type                       │
│ mime_type                        │
│ file_size                        │
│ width / height                   │
│ aspect_ratio                     │
│ duration_seconds                 │
│ has_audio                        │
│ audio_status          ← NEW      │
│ audio_duration_ms                │
│ audio_codec                      │
│ audio_sample_rate                │
│ audio_channels                   │
│ audio_source                     │
│ audio_loudness_lufs              │
│ audio_is_silent                  │
│ file_hash                        │
│ perceptual_hash                  │
│ visual_quality_score   ← NEW     │
│ technical_quality_score ← NEW    │
│ audio_quality_score    ← NEW     │
│ composition_quality_score ← NEW  │
│ semantic_quality_score ← NEW     │
│ safety_quality_score   ← NEW     │
│ quality_score                    │
│ quality_flags (JSONB)            │
│ quality_checked_at               │
│ embedding (vector 1536)          │
│ visual_embedding (vector 512)    │
│ embedding_model                  │
│ embedding_version                │
│ embedded_at                      │
│ deleted_at             ← NEW     │
│ metadata (JSONB)                 │
│ usage_count                      │
│ last_used_at                     │
│ created_at                       │
│ updated_at                       │
└──────────────┬───────────────────┘
               │
       ┌───────┴───────┐
       ▼               ▼
┌────────────┐  ┌──────────────────────┐
│ asset_tag  │  │    asset_usage       │
│            │  │                      │
│ asset_id   │  │ id (PK)              │
│ tag_id     │  │ asset_id (FK)        │
│ confidence │  │ org_id (FK)          │
│ source     │  │ content_id (FK)      │
│ version    │← NEW                    │
│ created_at │  │ composition_id (FK)  │
└────────────┘  │ campaign_id (FK)     │
                │ usage_type           │
                │ usage_context ← NEW  │
                │ used_at              │
                └──────────────────────┘
                         │
                         ▼
┌──────────────────────────────────┐
│     content_composition          │
│                                  │
│ id (PK)                          │
│ content_type_id (FK)             │
│ org_id (FK→organization)         │
│ name                             │
│ version              ← NEW       │
│ slots (JSONB)                    │
│ metadata (JSONB)                 │
│ quality_score                    │
│ is_complete                      │
│ created_at                       │
│ updated_at                       │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│      library_content             │
│                                  │
│ id (PK)                          │
│ org_id (FK→organization)         │
│ content_type_id (FK)             │
│ composition_id (FK)              │
│ campaign_id (FK→campaign)        │
│ title                            │
│ caption                          │
│ hashtags (JSONB)                 │
│ target_platforms (JSONB)         │
│ target_account_ids (JSONB)       │
│ status                           │
│ scheduled_for                    │
│ published_at                     │
│ quality_score                    │
│ quality_flags (JSONB)            │
│ anti_slop_score                  │
│ metadata (JSONB)                 │
│ created_at                       │
│ updated_at                       │
└──────────────────────────────────┘
```

---

## 3. Final Table List

| # | Table | Purpose | Tenancy |
|---|---|---|---|
| 1 | `provider` | Who can generate | GLOBAL |
| 2 | `model` | What each provider can do | GLOBAL |
| 3 | `media_asset` | Every file we store | ORG or GLOBAL (nullable org_id) |
| 4 | `tag` | Hierarchical taxonomy | GLOBAL |
| 5 | `asset_tag` | Assets ↔ tags | follows asset |
| 6 | `content_type` | Content format definitions | GLOBAL |
| 7 | `content_composition` | How assets combine | ORG or GLOBAL |
| 8 | `library_content` | Final library items | ORG |
| 9 | `generation_job` | Every generation request | ORG |
| 10 | `asset_usage` | Where assets are used | ORG |

**Total: 10 tables** (unchanged from Phase 1)

---

## 4. Table-by-Table Invariant Review

### 4.1 `provider`

**No changes required.** Schema is correct.

| Field | Status | Notes |
|---|---|---|
| `id` (text PK) | ✅ Correct | External identifier pattern matches `organization.id` |
| `type` | ✅ Correct | `'media_generation' | 'text_generation' | 'audio_generation'` |
| `config` (JSONB) | ✅ Correct | Provider-specific config |
| `is_active` | ✅ Correct | Soft enable/disable |
| `priority` | ✅ Correct | Model routing support |

---

### 4.2 `model`

**No changes required.** Schema is correct.

| Field | Status | Notes |
|---|---|---|
| `id` (text PK) | ✅ Correct | Matches existing `AI_STUDIO_MODELS` ids |
| `provider_id` (FK) | ✅ Correct | CASCADE on provider delete |
| `type` | ✅ Correct | `'image' | 'video' | 'audio' | 'text' | 'image-edit' | 'video-lipsync'` |
| `capabilities` (JSONB) | ✅ Correct | Flexible enough for future models |
| `cost_per_call` / `cost_per_second` | ✅ Correct | Cost tracking |

---

### 4.3 `media_asset`

**CHANGES REQUIRED.**

| Field | Status | Issue |
|---|---|---|
| `id` (uuid PK) | ✅ Correct | |
| `org_id` (nullable) | ✅ Correct | NULL = global/system asset |
| `origin_type` | ⚠️ GAP | No CHECK constraint on valid values |
| `generation_job_id` | ⚠️ GAP | Nullable but should be REQUIRED when `origin_type = 'ai_generated'` |
| `provider_id` | ⚠️ GAP | Nullable but should be REQUIRED when `origin_type = 'ai_generated'` |
| `model_id` | ⚠️ GAP | Nullable but should be REQUIRED when `origin_type = 'ai_generated'` |
| `provider_job_id` | ✅ Correct | External reference |
| `generation_input` | ✅ Correct | Prompt/params snapshot |
| `status` | ❌ MISSING | No lifecycle state field |
| `generation_version` | ❌ MISSING | Can't reproduce or explain acceptance |
| `has_audio` | ⚠️ GAP | Boolean can't represent UNKNOWN/PENDING/VALID/INVALID |
| `audio_status` | ❌ MISSING | Need explicit audio validation state |
| `audio_is_silent` | ⚠️ GAP | Redundant with `audio_status` — remove or keep as convenience |
| `quality_score` | ⚠️ GAP | Single opaque score — should be decomposed |
| `visual_quality_score` | ❌ MISSING | Quality dimension |
| `technical_quality_score` | ❌ MISSING | Quality dimension |
| `audio_quality_score` | ❌ MISSING | Quality dimension |
| `composition_quality_score` | ❌ MISSING | Quality dimension |
| `semantic_quality_score` | ❌ MISSING | Quality dimension |
| `safety_quality_score` | ❌ MISSING | Quality dimension |
| `deleted_at` | ❌ MISSING | No soft delete |
| `file_hash` | ✅ Correct | SHA-256 dedup |
| `perceptual_hash` | ✅ Correct | pHash dedup |
| `embedding` | ✅ Correct | vector(1536) |
| `visual_embedding` | ✅ Correct | vector(512) |
| `embedding_model` | ✅ Correct | Provider tracking |
| `embedding_version` | ✅ Correct | Re-embedding support |

**Required changes to `media_asset`:**
1. Add `status` text field (NOT NULL, default `'generated'`)
2. Add `audio_status` text field (NOT NULL, default `'unknown'`)
3. Add `generation_version` text field
4. Add 6 quality dimension fields
5. Add `deleted_at` timestamp
6. Add CHECK constraint: `origin_type IN ('ai_generated', 'ai_enhanced', 'user_uploaded', 'imported', 'system_generated')`
7. Add CHECK constraint: `audio_status IN ('unknown', 'pending_validation', 'valid', 'invalid')`
8. Add CHECK constraint: `status IN ('generated', 'processing', 'validated', 'tagged', 'available', 'quarantined', 'rejected', 'archived')`
9. Add conditional NOT NULL: when `origin_type = 'ai_generated'`, `generation_job_id` must be NOT NULL (application-enforced, not DB-enforceable without trigger)

---

### 4.4 `tag`

**MINOR CHANGES REQUIRED.**

| Field | Status | Issue |
|---|---|---|
| `id` (uuid PK) | ✅ Correct | |
| `name` | ✅ Correct | |
| `slug` (UNIQUE) | ✅ Correct | Global uniqueness |
| `parent_id` (self FK) | ✅ Correct | Hierarchical |
| `type` | ✅ Correct | Taxonomy category |
| `embedding` | ✅ Correct | vector(1536) |
| `is_system` | ✅ Correct | Protection flag |
| — | ⚠️ GAP | No protection against circular parent references (application-enforced) |
| — | ⚠️ GAP | No unique constraint on `(parent_id, name)` to prevent duplicate tags at same level |

**Required changes to `tag`:**
1. Add unique index: `UNIQUE (parent_id, name) WHERE parent_id IS NOT NULL` — prevents duplicate sibling tags
2. Note: circular parent reference prevention is application-enforced (DB triggers would be complex)

---

### 4.5 `asset_tag`

**MINOR CHANGES REQUIRED.**

| Field | Status | Issue |
|---|---|---|
| `asset_id` (FK) | ✅ Correct | CASCADE delete |
| `tag_id` (FK) | ✅ Correct | CASCADE delete |
| `confidence` | ✅ Correct | 0.0–1.0 |
| `source` | ⚠️ GAP | Missing `'ai_generated'` source option |
| — | ❌ MISSING | No `version` field for re-tagging tracking |

**Required changes to `asset_tag`:**
1. Add `version` integer field (default 1) — tracks re-tagging iterations
2. Add `'ai_generated'` to source enum documentation

---

### 4.6 `content_type`

**NO CHANGES REQUIRED.** Schema is correct.

| Field | Status | Notes |
|---|---|---|
| `id` (text PK) | ✅ Correct | Semantic IDs |
| `slug` (UNIQUE) | ✅ Correct | |
| `min_assets` / `max_assets` | ✅ Correct | Slot count bounds |
| `requires_video` / `requires_audio` / `requires_text_overlay` / `requires_caption` | ✅ Correct | Boolean requirements |
| `slot_schema` (JSONB) | ✅ Correct | Flexible slot definitions |
| `qualification_rules` (JSONB) | ✅ Correct | Quality gate rules |
| `construction_rules` (JSONB) | ✅ Correct | Assembly rules |
| `render_config` (JSONB) | ✅ Correct | Rendering parameters |

---

### 4.7 `content_composition`

**MINOR CHANGES REQUIRED.**

| Field | Status | Issue |
|---|---|---|
| `id` (uuid PK) | ✅ Correct | |
| `content_type_id` (FK) | ✅ Correct | RESTRICT on delete |
| `org_id` (FK) | ✅ Correct | CASCADE on delete |
| `slots` (JSONB) | ✅ Correct | Generic slot system |
| `metadata` (JSONB) | ✅ Correct | |
| `quality_score` | ✅ Correct | |
| `is_complete` | ✅ Correct | |
| — | ❌ MISSING | No `version` field for construction algorithm tracking |

**Required changes to `content_composition`:**
1. Add `version` integer field (default 1) — tracks construction algorithm versions

---

### 4.8 `library_content`

**CHANGES REQUIRED.**

| Field | Status | Issue |
|---|---|---|
| `id` (uuid PK) | ✅ Correct | |
| `org_id` (FK) | ✅ Correct | |
| `content_type_id` (FK) | ✅ Correct | RESTRICT on delete |
| `composition_id` (FK) | ⚠️ GAP | Nullable — should some content types not require composition? |
| `campaign_id` (FK) | ✅ Correct | SET NULL on delete |
| `status` | ❌ GAP | Missing PROCESSING/QUALITY_CHECK/READY/ARCHIVED states |
| `quality_score` | ⚠️ GAP | Should mirror composition quality or be independent? |
| `quality_flags` | ✅ Correct | |
| `anti_slop_score` | ✅ Correct | |
| `metadata` (JSONB) | ✅ Correct | |

**Required changes to `library_content`:**
1. Expand `status` values: add `'processing'`, `'quality_check'`, `'ready'`, `'archived'`
2. Document: `composition_id` is intentionally nullable for content types that don't need composition (e.g., single_image can reference a media_asset directly via metadata)

---

### 4.9 `generation_job`

**CHANGES REQUIRED.**

| Field | Status | Issue |
|---|---|---|
| `id` (uuid PK) | ✅ Correct | |
| `org_id` (FK) | ✅ Correct | |
| `provider_id` (FK) | ✅ Correct | RESTRICT on delete |
| `model_id` (FK) | ✅ Correct | RESTRICT on delete |
| `kind` | ✅ Correct | |
| `status` | ✅ Correct | Full lifecycle |
| `step` | ✅ Correct | UI display |
| `input` (JSONB) | ✅ Correct | |
| `output` (JSONB) | ✅ Correct | |
| `external_job_id` | ✅ Correct | UNIQUE partial index |
| `credits_reserved` / `credits_charged` | ✅ Correct | |
| `error_message` / `error_code` | ✅ Correct | |
| `attempts` / `max_attempts` / `next_attempt_at` | ✅ Correct | Retry backoff |
| `media_asset_id` (FK) | ✅ Correct | SET NULL on delete |
| `duration_ms` | ✅ Correct | |
| — | ❌ MISSING | No `estimated_cost` field |
| — | ❌ MISSING | No `actual_cost` field |
| — | ❌ MISSING | No `cost_currency` field |
| — | ❌ MISSING | No `cost_units` field (tokens, seconds, etc.) |
| — | ❌ MISSING | No `processing_version` field |

**Required changes to `generation_job`:**
1. Add `estimated_cost` real field — cost estimate before generation
2. Add `actual_cost` real field — actual cost after completion
3. Add `cost_currency` text field (default `'USD'`)
4. Add `cost_units` text field — `'credits' | 'tokens' | 'seconds' | 'characters'`
5. Add `processing_version` text field — version of processing pipeline

---

### 4.10 `asset_usage`

**MINOR CHANGES REQUIRED.**

| Field | Status | Issue |
|---|---|---|
| `id` (serial PK) | ✅ Correct | |
| `asset_id` (FK) | ✅ Correct | CASCADE delete |
| `org_id` (FK) | ✅ Correct | |
| `content_id` (FK) | ✅ Correct | SET NULL on delete |
| `composition_id` (FK) | ✅ Correct | SET NULL on delete |
| `campaign_id` (FK) | ✅ Correct | SET NULL on delete |
| `usage_type` | ✅ Correct | |
| `used_at` | ✅ Correct | |
| — | ❌ MISSING | No `usage_context` field |

**Required changes to `asset_usage`:**
1. Add `usage_context` JSONB field — `{ "slot": "hook_video", "position": 0, "platform": "instagram" }`

---

## 5. Foreign Key Review

| FK | From | To | On Delete | Status |
|---|---|---|---|---|
| `model.provider_id` | model | provider | CASCADE | ✅ Correct |
| `generation_job.org_id` | generation_job | organization | CASCADE | ✅ Correct |
| `generation_job.provider_id` | generation_job | provider | RESTRICT | ✅ Correct |
| `generation_job.model_id` | generation_job | model | RESTRICT | ✅ Correct |
| `generation_job.media_asset_id` | generation_job | media_asset | SET NULL | ✅ Correct |
| `media_asset.org_id` | media_asset | organization | CASCADE | ✅ Correct |
| `media_asset.generation_job_id` | media_asset | generation_job | SET NULL | ✅ Correct |
| `media_asset.provider_id` | media_asset | provider | SET NULL | ✅ Correct |
| `media_asset.model_id` | media_asset | model | SET NULL | ✅ Correct |
| `tag.parent_id` | tag | tag | SET NULL | ✅ Correct |
| `asset_tag.asset_id` | asset_tag | media_asset | CASCADE | ✅ Correct |
| `asset_tag.tag_id` | asset_tag | tag | CASCADE | ✅ Correct |
| `content_composition.content_type_id` | content_composition | content_type | RESTRICT | ✅ Correct |
| `content_composition.org_id` | content_composition | organization | CASCADE | ✅ Correct |
| `library_content.org_id` | library_content | organization | CASCADE | ✅ Correct |
| `library_content.content_type_id` | library_content | content_type | RESTRICT | ✅ Correct |
| `library_content.composition_id` | library_content | content_composition | SET NULL | ✅ Correct |
| `library_content.campaign_id` | library_content | campaign | SET NULL | ✅ Correct |
| `asset_usage.asset_id` | asset_usage | media_asset | CASCADE | ✅ Correct |
| `asset_usage.org_id` | asset_usage | organization | CASCADE | ✅ Correct |
| `asset_usage.content_id` | asset_usage | library_content | SET NULL | ✅ Correct |
| `asset_usage.composition_id` | asset_usage | content_composition | SET NULL | ✅ Correct |
| `asset_usage.campaign_id` | asset_usage | campaign | SET NULL | ✅ Correct |

**No FK changes required.**

---

## 6. Unique Constraint Review

| Table | Constraint | Type | Status |
|---|---|---|---|
| `tag.slug` | `tag_slug_idx` | UNIQUE | ✅ Correct |
| `content_type.slug` | `content_type_slug_idx` | UNIQUE | ✅ Correct |
| `generation_job.external_job_id` | partial UNIQUE | WHERE NOT NULL | ✅ Correct |
| `asset_tag.(asset_id, tag_id)` | Composite PK | PRIMARY KEY | ✅ Correct |
| `tag.(parent_id, name)` | — | MISSING | ❌ Required |

**Required additions:**
1. `UNIQUE (parent_id, name) WHERE parent_id IS NOT NULL` on `tag` — prevents duplicate sibling tags

---

## 7. CHECK Constraint Review

| Table | Column | Constraint | Status |
|---|---|---|---|
| `media_asset.origin_type` | `IN ('ai_generated', 'ai_enhanced', 'user_uploaded', 'imported', 'system_generated')` | ❌ MISSING | Required |
| `media_asset.status` | `IN ('generated', 'processing', 'validated', 'tagged', 'available', 'quarantined', 'rejected', 'archived')` | ❌ MISSING | Required |
| `media_asset.audio_status` | `IN ('unknown', 'pending_validation', 'valid', 'invalid')` | ❌ MISSING | Required |
| `media_asset.quality_score` | `>= 0 AND <= 1` | ❌ MISSING | Recommended |
| `media_asset.confidence` (asset_tag) | `>= 0 AND <= 1` | ❌ MISSING | Recommended |
| `library_content.status` | `IN ('draft', 'processing', 'quality_check', 'pending_review', 'ready', 'approved', 'scheduled', 'rejected', 'published', 'archived')` | ❌ MISSING | Required |
| `generation_job.status` | `IN ('planned', 'queued', 'submitted', 'generating', 'provider_complete', 'downloading', 'processing', 'quality_check', 'tagging', 'ready', 'failed', 'rejected', 'cancelled')` | ❌ MISSING | Required |
| `generation_job.attempts` | `>= 0` | ❌ MISSING | Recommended |
| `generation_job.credits_reserved` | `>= 0` | ❌ MISSING | Recommended |
| `generation_job.credits_charged` | `>= 0` | ❌ MISSING | Recommended |
| `model.cost_per_call` | `>= 0` | ❌ MISSING | Recommended |
| `model.cost_per_second` | `>= 0` | ❌ MISSING | Recommended |

**Note:** PostgreSQL CHECK constraints are not generated by Drizzle ORM. They must be added as raw SQL in the migration.

---

## 8. Nullability Review

| Table | Column | Current | Required | Issue |
|---|---|---|---|---|
| `media_asset.org_id` | nullable | ✅ OK | NULL = global asset | |
| `media_asset.generation_job_id` | nullable | ⚠️ CONDITIONAL | Must be NOT NULL when `origin_type = 'ai_generated'` | Cannot enforce with CHECK (references other column) — application-enforced |
| `media_asset.provider_id` | nullable | ⚠️ CONDITIONAL | Must be NOT NULL when `origin_type = 'ai_generated'` | Application-enforced |
| `media_asset.model_id` | nullable | ⚠️ CONDITIONAL | Must be NOT NULL when `origin_type = 'ai_generated'` | Application-enforced |
| `library_content.composition_id` | nullable | ✅ OK | Some content types don't need composition | |
| `content_composition.org_id` | nullable | ✅ OK | NULL = system composition | |
| `tag.parent_id` | nullable | ✅ OK | NULL = root tag | |

**Conditional NOT NULL enforcement:** PostgreSQL CHECK constraints cannot reference other columns or tables. The rule "when origin_type = 'ai_generated', generation_job_id must be NOT NULL" must be enforced at the application/domain layer, not via DB CHECK constraint. A trigger could enforce this, but adds complexity. **Decision: application-enforced.**

---

## 9. Enum Review

All enums are stored as text (existing convention — no pgEnum).

| Enum | Values | Table | Status |
|---|---|---|---|
| `ProviderType` | `media_generation`, `text_generation`, `audio_generation` | provider.type | ✅ |
| `ModelType` | `image`, `video`, `audio`, `text`, `image-edit`, `video-lipsync` | model.type | ✅ |
| `OriginType` | `ai_generated`, `ai_enhanced`, `user_uploaded`, `imported`, `system_generated` | media_asset.origin_type | ⚠️ Needs CHECK |
| `AssetType` | `image`, `video`, `audio` | media_asset.asset_type | ⚠️ Needs CHECK |
| `MediaAssetStatus` | `generated`, `processing`, `validated`, `tagged`, `available`, `quarantined`, `rejected`, `archived` | media_asset.status | ❌ New field |
| `AudioStatus` | `unknown`, `pending_validation`, `valid`, `invalid` | media_asset.audio_status | ❌ New field |
| `TagType` | `person`, `business`, `industry`, `intent`, `visual`, `style`, `audience`, `format`, `emotion`, `custom` | tag.type | ✅ |
| `ContentStatus` | `draft`, `processing`, `quality_check`, `pending_review`, `ready`, `approved`, `scheduled`, `rejected`, `published`, `archived` | library_content.status | ⚠️ Expanded |
| `GenerationJobStatus` | `planned`, `queued`, `submitted`, `generating`, `provider_complete`, `downloading`, `processing`, `quality_check`, `tagging`, `ready`, `failed`, `rejected`, `cancelled` | generation_job.status | ✅ |
| `UsageType` | `composition`, `content`, `campaign`, `template` | asset_usage.usage_type | ✅ |
| `TagSource` | `manual`, `ai_auto`, `ai_suggested`, `ai_generated` | asset_tag.source | ⚠️ Added `ai_generated` |

---

## 10. JSONB Schema Review

### `media_asset.generation_input`
```json
{
  "prompt": "string (required)",
  "image_url": "string (optional — for i2v)",
  "duration": "number (optional — for video)",
  "aspect_ratio": "string (optional — 9:16, 16:9, 1:1, 4:5)",
  "seed": "number (optional)",
  "style": "string (optional)",
  "negative_prompt": "string (optional)"
}
```
✅ Schema is flexible enough.

### `media_asset.quality_flags`
```json
["no_audio", "too_short", "low_resolution", "nsfw", "corrupted", "duplicate", "silent_audio", "invalid_codec", "blurry", "watermark_detected"]
```
✅ Extensible array.

### `media_asset.metadata`
```json
{
  "transcription": "string",
  "scene_description": "string",
  "subject_detection": { "primary": "string", "secondary": ["string"] },
  "unsafe_content": { "score": 0.02, "labels": [] },
  "processing_pipeline": "string",
  "processing_version": "string"
}
```
⚠️ Add `processing_pipeline` and `processing_version` to metadata schema.

### `content_type.slot_schema`
```json
{
  "slot_name": {
    "type": "image | video | audio | text",
    "required": true | false,
    "max_duration": "number (optional)",
    "min_duration": "number (optional)",
    "asset_role": "string (optional — e.g., 'hook', 'demo', 'background')"
  }
}
```
✅ Flexible enough.

### `content_type.qualification_rules`
```json
{
  "min_duration": "number",
  "max_duration": "number",
  "min_resolution": "string (e.g., '720p')",
  "min_quality_score": "number (0.0-1.0)",
  "require_audio": true,
  "require_non_silent_audio": true,
  "require_face": true,
  "max_file_size_mb": "number"
}
```
✅ Flexible enough.

### `content_type.construction_rules`
```json
{
  "similarity_required": true,
  "diversity_required": true,
  "min_tag_overlap": "number",
  "max_visual_similarity": "number (0.0-1.0)",
  "require_text_overlay": true,
  "require_caption": true
}
```
✅ Flexible enough.

### `content_composition.slots`
```json
{
  "slot_name": {
    "asset_id": "uuid (reference to media_asset)",
    "start": "number (seconds)",
    "end": "number (seconds)",
    "trim": { "start": "number", "end": "number" },
    "volume": "number (0.0-1.0, for audio)",
    "fade_in": "number (seconds)",
    "fade_out": "number (seconds)",
    "text": "string (for text_overlay slots)",
    "position": "string (center, top, bottom)",
    "font": "string",
    "size": "string (small, medium, large)",
    "color": "string (hex)",
    "shadow": "boolean"
  }
}
```
✅ Generic enough for all content types.

### `library_content.metadata`
```json
{
  "platform_specific": { "instagram": {}, "tiktok": {} },
  "enrichment": { "ai_suggested_caption": "string", "ai_suggested_hashtags": [] },
  "engagement": { "views": 0, "likes": 0, "shares": 0, "comments": 0 },
  "rendering_version": "string",
  "tagging_version": "string",
  "embedding_version": "string"
}
```
⚠️ Add version tracking fields to metadata schema.

### `asset_usage.usage_context`
```json
{
  "slot": "string (e.g., 'hook_video')",
  "position": "number (e.g., 0)",
  "platform": "string (e.g., 'instagram')",
  "campaign_name": "string (optional)"
}
```
✅ New field, flexible.

---

## 11. pgvector Review

| Index | Table | Column | Dimensions | Ops | HNSW m | HNSW ef_construction | Status |
|---|---|---|---|---|---|---|---|
| `media_asset_embedding_idx` | media_asset | embedding | 1536 | vector_cosine_ops | 16 | 64 | ✅ Correct |
| `media_asset_visual_embedding_idx` | media_asset | visual_embedding | 512 | vector_cosine_ops | 16 | 64 | ✅ Correct |
| `tag_embedding_idx` | tag | embedding | 1536 | vector_cosine_ops | 16 | 64 | ✅ Correct |

**Review findings:**
- ✅ Dimensions match OpenAI text-embedding-3-small (1536) and CLIP ViT-B/32 (512)
- ✅ HNSW parameters are appropriate for 10K–100K vectors
- ✅ `embedding_model` and `embedding_version` fields allow re-embedding with different models
- ⚠️ HNSW indexes cannot be created concurrently — migration will lock tables briefly (acceptable for new empty tables)
- ✅ `IF NOT EXISTS` on index creation is safe for idempotent migration

**No pgvector changes required.**

---

## 12. Provenance Review

**Can an AI-generated asset exist without knowing what generated it?**

**Current schema answer: YES** — `generation_job_id`, `provider_id`, `model_id` are all nullable.

**Required answer: NO** — for `origin_type = 'ai_generated'`, all three must be populated.

**Enforcement approach:**
- DB CHECK constraint cannot enforce cross-column dependency
- DB trigger could enforce this but adds complexity
- **Decision: Application/domain layer enforcement** with a validation function:

```typescript
function validateMediaAssetProvenance(asset: MediaAsset): void {
  if (asset.originType === 'ai_generated') {
    if (!asset.generationJobId) throw new Error('ai_generated assets must have generation_job_id');
    if (!asset.providerId) throw new Error('ai_generated assets must have provider_id');
    if (!asset.modelId) throw new Error('ai_generated assets must have model_id');
  }
}
```

**Provenance completeness check:**

| Provenance Field | Present | Status |
|---|---|---|
| provider | ✅ `provider_id` FK | |
| model | ✅ `model_id` FK | |
| generation_job | ✅ `generation_job_id` FK | |
| provider_job_id | ✅ `provider_job_id` text | |
| prompt/params | ✅ `generation_input` JSONB | |
| generation timestamp | ✅ `created_at` on media_asset + `completed_at` on generation_job | |
| processing version | ❌ MISSING | Need `generation_version` on media_asset |
| embedding version | ✅ `embedding_version` on media_asset | |

**Required addition:** `generation_version` text field on `media_asset`.

---

## 13. Tenancy Review

| Table | org_id | Tenancy | Notes |
|---|---|---|---|
| `provider` | — | GLOBAL | Shared across all orgs |
| `model` | — | GLOBAL | Shared across all orgs |
| `media_asset` | nullable | ORG or GLOBAL | NULL = global/system asset |
| `tag` | — | GLOBAL | Shared taxonomy |
| `asset_tag` | — | follows asset | |
| `content_type` | — | GLOBAL | Shared definitions |
| `content_composition` | nullable | ORG or GLOBAL | NULL = system composition |
| `library_content` | NOT NULL | ORG | Always org-scoped |
| `generation_job` | NOT NULL | ORG | Always org-scoped |
| `asset_usage` | NOT NULL | ORG | Always org-scoped |

**Critical distinction:**
- **GLOBAL library content** (NativPost-owned): `org_id = NULL` on `media_asset`, `content_composition`
- **CUSTOMER content**: `org_id = <customer org id>` on all tables
- **Library Content** is always org-scoped — but the global library could use a dedicated "nativpost" org ID

**Risk:** If a customer's `library_content` references a global `media_asset` (org_id = NULL), the `asset_usage.org_id` must still be set to the customer's org. This is correct — `asset_usage.org_id` is NOT NULL.

**No schema changes required for tenancy.**

---

## 14. Lifecycle Review

### MediaAsset Lifecycle

**Current:** No status field.
**Required:** `status` field with states:

```
GENERATED → PROCESSING → VALIDATED → TAGGED → AVAILABLE
                                    ↓
                              QUARANTINED → REJECTED
                                    ↓
                               ARCHIVED
```

| State | Meaning |
|---|---|
| `generated` | Just created from generation_job |
| `processing` | Being validated, hashed, embedded |
| `validated` | Passed quality gate |
| `tagged` | Tags assigned |
| `available` | Ready for composition/library |
| `quarantined` | Failed quality gate, under review |
| `rejected` | Confirmed unusable |
| `archived` | Preserved for history, not active |

### LibraryContent Lifecycle

**Current:** `status` has `draft`, `pending_review`, `approved`, `scheduled`, `rejected`, `published`.
**Required:** Add `processing`, `quality_check`, `ready`, `archived`.

```
DRAFT → PROCESSING → QUALITY_CHECK → PENDING_REVIEW → READY → APPROVED → SCHEDULED → PUBLISHED
                                        ↓                              ↓
                                   REJECTED                        ARCHIVED
```

### GenerationJob Lifecycle

**Current:** Full lifecycle defined. ✅ Correct.

```
PLANNED → QUEUED → SUBMITTED → GENERATING → PROVIDER_COMPLETE → DOWNLOADING → PROCESSING → QUALITY_CHECK → TAGGING → READY
                                                                                                                    ↓
                                                                                                               FAILED / REJECTED / CANCELLED
```

**No changes to generation_job lifecycle.**

---

## 15. Generation Attempt Review

**Current design:** `generation_job` has `attempts` counter + `max_attempts` + `next_attempt_at`.

**Question: Do we need a separate `generation_attempt` table?**

**Analysis:**
- Current design: one `generation_job` row, `attempts` counter increments on retry
- Problem: when job retries, `input`, `output`, `error_message`, `external_job_id` are overwritten — history is lost
- The `generation_job.output` JSONB could accumulate attempt history, but that's messy

**Recommendation: Add `generation_attempt` table NOW.**

```sql
CREATE TABLE IF NOT EXISTS "generation_attempt" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL,                           -- FK → generation_job.id
  "attempt_number" integer NOT NULL,
  "provider_id" text NOT NULL,                      -- FK → provider.id (may differ from job's provider on fallback)
  "model_id" text NOT NULL,                         -- FK → model.id (may differ from job's model on fallback)
  "status" text NOT NULL,                           -- 'submitted' | 'generating' | 'completed' | 'failed' | 'rejected'
  "input" jsonb NOT NULL,                           -- snapshot of this attempt's input
  "output" jsonb,                                   -- this attempt's output
  "external_job_id" text,                           -- this attempt's external reference
  "error_message" text,
  "error_code" text,
  "duration_ms" integer,
  "credits_charged" integer DEFAULT 0,
  "cost_usd" real,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);
```

**Benefits:**
- Full attempt history preserved
- Provider/model fallback tracked per attempt
- Cost per attempt tracked
- Can analyze which providers/models succeed/fail most

**This is a NEW table — total tables becomes 11.**

---

## 16. Audio Invariant Review

**Current:** `has_audio` boolean + `audio_is_silent` boolean.

**Problem:** Cannot represent:
- UNKNOWN (not yet checked)
- PENDING_VALIDATION (being checked)
- VALID (confirmed has usable audio)
- INVALID (confirmed no/bad audio)

**Required:** `audio_status` field with states:

| State | Meaning |
|---|---|
| `unknown` | Audio status not yet determined |
| `pending_validation` | Audio being analyzed |
| `valid` | Confirmed has usable audio |
| `invalid` | Confirmed no/bad/silent audio |

**`has_audio` boolean:** Keep as convenience field (quick filter), but `audio_status` is the source of truth.

**`audio_is_silent` boolean:** Remove — redundant with `audio_status = 'invalid'` + quality flag.

**Audio invariant enforcement:**

```
library_content creation requires:
  media_asset.asset_type = 'video'
  → media_asset.audio_status = 'valid'
  → media_asset.has_audio = true
  → media_asset.audio_is_silent = false (or remove this field)
```

This is **application-enforced** at the quality gate (Phase 4).

---

## 17. Generated-Video-Only Invariant Review

**Rule:** Video entering the Content Library must be AI-generated.

**Current schema support:**
- `media_asset.origin_type` — can distinguish `ai_generated` vs `user_uploaded`
- `media_asset.generation_job_id` — links to generation history

**Enforcement layers:**

| Layer | Mechanism | Strength |
|---|---|---|
| DB CHECK | `origin_type IN (...)` | Prevents invalid values |
| DB CHECK | `status IN (...)` | Prevents invalid lifecycle states |
| Application | `validateMediaAssetProvenance()` | Ensures provenance fields populated |
| Application | Quality gate: `if (asset_type === 'video' && origin_type !== 'ai_generated') reject` | Blocks non-AI video from library |
| Application | Quality gate: `if (asset_type === 'video' && audio_status !== 'valid') reject` | Blocks video without audio |

**The schema supports enforcement. The enforcement itself is application-layer (Phase 4).**

**For images:** `origin_type` can be `user_uploaded`, `imported`, etc. — images are not restricted to AI-generated only.

---

## 18. Quality Gate Readiness Review

**Current:** Single `quality_score` real field on `media_asset` and `library_content`.

**Problem:** Single opaque score cannot explain WHY an asset was accepted/rejected.

**Required decomposition:**

| Field | Dimension | Range | Description |
|---|---|---|---|
| `visual_quality_score` | Visual | 0.0–1.0 | Resolution, clarity, composition |
| `technical_quality_score` | Technical | 0.0–1.0 | Codec, bitrate, corruption |
| `audio_quality_score` | Audio | 0.0–1.0 | Presence, duration, loudness, silence |
| `composition_quality_score` | Composition | 0.0–1.0 | Slot completeness, timing, coherence |
| `semantic_quality_score` | Semantic | 0.0–1.0 | Relevance, coherence, usefulness |
| `safety_quality_score` | Safety | 0.0–1.0 | NSFW, watermark, copyright |
| `quality_score` | Overall | 0.0–1.0 | Weighted aggregate of above |

**`quality_flags`** remains as the specific failure reasons array.

**This decomposition allows:**
- "Asset rejected because audio_quality_score = 0.1" instead of "quality_score = 0.3"
- Per-dimension analytics
- Targeted quality gate tuning
- Provider/model quality comparison

---

## 19. Deduplication Readiness Review

**Current schema support:**

| Dedup Method | Field | Status |
|---|---|---|
| Exact file duplicate | `file_hash` (SHA-256) | ✅ Present |
| Visual near-duplicate | `perceptual_hash` (pHash) | ✅ Present |
| Semantic near-duplicate | `embedding` (vector 1536) | ✅ Present |
| Visual semantic duplicate | `visual_embedding` (vector 512) | ✅ Present |

**Dedup types supported:**

| Type | Method | Threshold |
|---|---|---|
| Exact duplicate | `file_hash` comparison | 100% match |
| Visual near-duplicate | `perceptual_hash` Hamming distance | < 10 bits |
| Semantic near-duplicate | `embedding` cosine similarity | > 0.95 |
| Visual semantic duplicate | `visual_embedding` cosine similarity | > 0.90 |

**The schema fully supports deduplication. Implementation is Phase 7.**

---

## 20. Inventory Engine Readiness Review

**Current schema supports multi-dimensional inventory through:**

| Dimension | Source |
|---|---|
| Content type | `library_content.content_type_id` |
| Industry | `asset_tag` → `tag.type = 'industry'` |
| Audience | `asset_tag` → `tag.type = 'audience'` |
| Subject | `asset_tag` → `tag.type = 'person'` |
| Visual style | `asset_tag` → `tag.type = 'visual'` |
| Intent | `asset_tag` → `tag.type = 'intent'` |
| Tag combinations | Multiple `asset_tag` joins |

**No dedicated inventory table needed.** Inventory is computed from:
```sql
SELECT
  lc.content_type_id,
  t.type AS tag_type,
  t.name AS tag_name,
  COUNT(DISTINCT lc.id) AS content_count
FROM library_content lc
JOIN content_composition cc ON lc.composition_id = cc.id
JOIN asset_tag at ON at.asset_id IN (SELECT jsonb_array_elements_text(cc.slots->'hook_video'->'asset_id'))
JOIN tag t ON at.tag_id = t.id
WHERE lc.status = 'published'
GROUP BY lc.content_type_id, t.type, t.name;
```

**The schema supports multi-dimensional inventory. Implementation is Phase 7.**

---

## 21. Migration Changes Required

Based on the review, the following changes must be made to PHASE1_DESIGN.md before migration implementation:

### 21.1 New Table: `generation_attempt`

```sql
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
```

### 21.2 New Fields on `media_asset`

```sql
ALTER TABLE "media_asset" ADD COLUMN "status" text DEFAULT 'generated' NOT NULL;
ALTER TABLE "media_asset" ADD COLUMN "audio_status" text DEFAULT 'unknown' NOT NULL;
ALTER TABLE "media_asset" ADD COLUMN "generation_version" text;
ALTER TABLE "media_asset" ADD COLUMN "visual_quality_score" real;
ALTER TABLE "media_asset" ADD COLUMN "technical_quality_score" real;
ALTER TABLE "media_asset" ADD COLUMN "audio_quality_score" real;
ALTER TABLE "media_asset" ADD COLUMN "composition_quality_score" real;
ALTER TABLE "media_asset" ADD COLUMN "semantic_quality_score" real;
ALTER TABLE "media_asset" ADD COLUMN "safety_quality_score" real;
ALTER TABLE "media_asset" ADD COLUMN "deleted_at" timestamp;
```

### 21.3 New Fields on `generation_job`

```sql
ALTER TABLE "generation_job" ADD COLUMN "estimated_cost" real;
ALTER TABLE "generation_job" ADD COLUMN "actual_cost" real;
ALTER TABLE "generation_job" ADD COLUMN "cost_currency" text DEFAULT 'USD';
ALTER TABLE "generation_job" ADD COLUMN "cost_units" text;
ALTER TABLE "generation_job" ADD COLUMN "processing_version" text;
```

### 21.4 New Fields on `content_composition`

```sql
ALTER TABLE "content_composition" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
```

### 21.5 New Fields on `asset_tag`

```sql
ALTER TABLE "asset_tag" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
```

### 21.6 New Fields on `asset_usage`

```sql
ALTER TABLE "asset_usage" ADD COLUMN "usage_context" jsonb DEFAULT '{}'::jsonb;
```

### 21.7 CHECK Constraints

```sql
-- media_asset
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_origin_type_check"
  CHECK ("origin_type" IN ('ai_generated', 'ai_enhanced', 'user_uploaded', 'imported', 'system_generated'));
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_status_check"
  CHECK ("status" IN ('generated', 'processing', 'validated', 'tagged', 'available', 'quarantined', 'rejected', 'archived'));
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_audio_status_check"
  CHECK ("audio_status" IN ('unknown', 'pending_validation', 'valid', 'invalid'));
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_quality_score_check"
  CHECK ("quality_score" >= 0 AND "quality_score" <= 1);

-- library_content
ALTER TABLE "library_content" ADD CONSTRAINT "library_content_status_check"
  CHECK ("status" IN ('draft', 'processing', 'quality_check', 'pending_review', 'ready', 'approved', 'scheduled', 'rejected', 'published', 'archived'));

-- generation_job
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_status_check"
  CHECK ("status" IN ('planned', 'queued', 'submitted', 'generating', 'provider_complete', 'downloading', 'processing', 'quality_check', 'tagging', 'ready', 'failed', 'rejected', 'cancelled'));
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_attempts_check"
  CHECK ("attempts" >= 0);
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_credits_reserved_check"
  CHECK ("credits_reserved" >= 0);
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_credits_charged_check"
  CHECK ("credits_charged" >= 0);

-- model
ALTER TABLE "model" ADD CONSTRAINT "model_cost_per_call_check"
  CHECK ("cost_per_call" >= 0);
ALTER TABLE "model" ADD CONSTRAINT "model_cost_per_second_check"
  CHECK ("cost_per_second" >= 0);

-- asset_tag
ALTER TABLE "asset_tag" ADD CONSTRAINT "asset_tag_confidence_check"
  CHECK ("confidence" >= 0 AND "confidence" <= 1);
```

### 21.8 Unique Constraints

```sql
-- Prevent duplicate sibling tags
CREATE UNIQUE INDEX IF NOT EXISTS "tag_parent_name_unique_idx" ON "tag" ("parent_id", "name")
  WHERE "parent_id" IS NOT NULL;

-- Prevent duplicate generation attempts per job
CREATE UNIQUE INDEX IF NOT EXISTS "generation_attempt_job_number_unique_idx" ON "generation_attempt" ("job_id", "attempt_number");
```

### 21.9 Indexes for New Table

```sql
CREATE INDEX IF NOT EXISTS "generation_attempt_job_id_idx" ON "generation_attempt" ("job_id");
CREATE INDEX IF NOT EXISTS "generation_attempt_status_idx" ON "generation_attempt" ("status");
CREATE INDEX IF NOT EXISTS "generation_attempt_provider_id_idx" ON "generation_attempt" ("provider_id");
```

### 21.10 RLS for New Table

```sql
ALTER TABLE "generation_attempt" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ga_service_role_all" ON "generation_attempt" FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### 21.11 Remove Redundant Field

```sql
-- Remove audio_is_silent — redundant with audio_status = 'invalid'
-- Note: Drizzle doesn't support DROP COLUMN; must be raw SQL
ALTER TABLE "media_asset" DROP COLUMN IF EXISTS "audio_is_silent";
```

---

## 22. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| CHECK constraints not generated by Drizzle | Migration must include raw SQL | Use `migrations/0061_*.sql` with raw SQL |
| `generation_attempt` adds complexity | 11th table, more joins | Worth it for attempt history |
| Conditional NOT NULL (origin_type → generation_job_id) | Cannot enforce at DB level | Application validation + tests |
| HNSW index creation locks tables | Brief lock on empty tables | Acceptable — tables are new and empty |
| `audio_is_silent` removal | Existing code references | Check codebase before migration |
| Quality dimension fields add width to media_asset | More columns | Acceptable — justified by quality gate needs |

---

## 23. Decisions Requiring Human Approval

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | `generation_attempt` table | Add now vs. later | **Add now** — attempt history is critical for provider evaluation |
| D2 | Quality dimension decomposition | 6 fields vs. JSONB | **6 fields** — queryable, indexable, explicit |
| D3 | `audio_is_silent` removal | Remove vs. keep | **Remove** — redundant with `audio_status` |
| D4 | Conditional NOT NULL enforcement | DB trigger vs. application | **Application** — simpler, sufficient |
| D5 | `library_content.composition_id` nullability | Nullable vs. required | **Nullable** — some content types don't need composition |
| D6 | Global vs. org-scoped content | Dedicated org vs. NULL org_id | **NULL org_id** for global — cleaner |

---

## PHASE 1.5 STATUS

```
[ ] BLOCKED
[x] CHANGES REQUIRED
[ ] APPROVED FOR MIGRATION
```

**Status: CHANGES REQUIRED**

The schema review identified 7 critical gaps and 9 moderate gaps. All are addressable with the changes outlined in Section 21. The architectural foundation is sound — no structural changes needed, only field additions, CHECK constraints, and one new table.

**Next step:** Update PHASE1_DESIGN.md with the changes from Section 21, then re-submit for approval.
