# Content Intelligence Engine — Architecture Gap Analysis

**Date:** 2026-08-31
**Scope:** Full repository audit of NativPost codebase to assess readiness for Content Intelligence Engine rebuild

---

## 1. CURRENT SYSTEM INVENTORY

### 1.1 Database (53 tables in `public` schema)

| Feature Area | Tables | Status |
|---|---|---|
| **Content Library (core)** | `content_item`, `content_template`, `content_calendar`, `content_plan`, `content_feedback`, `content_angle`, `content_edit`, `publishing_queue`, `media_asset`, `media_set`, `blitz_media_usage`, `blitz_template_usage`, `engine_request_log`, `automation_rule`, `apify_seed_run` | **15 tables** — mostly empty after DB wipe |
| **Organizations & Billing** | `organization`, `user_settings` | **2 tables** — 1 org row exists |
| **Brand Identity** | `brand_profile` | **1 table** |
| **Social Accounts** | `social_account` | **1 table** |
| **Campaigns** | `campaign`, `campaign_content`, `campaign_job` | **3 tables** |
| **AI Influencers** | `ai_influencer`, `influencer_angle`, `voice_clone` | **3 tables** |
| **AI Studio** | `ai_studio_job` | **1 table** |
| **Long-Form Video** | `long_form_project` | **1 table** |
| **Support** | `support_ticket`, `support_message`, `support_attachment`, `knowledge_article` | **4 tables** |
| **Notifications** | `notification` | **1 table** |
| **Onboarding** | `onboarding_progress` | **1 table** |
| **API & Webhooks** | `api_key`, `webhook_endpoint`, `webhook_delivery` | **3 tables** |
| **MSI (Managed Social)** | `authorization_grant`, `msi_provisioning_order`, `managed_account`, `msi_operator`, `msi_device`, `msi_device_assignment`, `msi_job`, `msi_task`, `msi_account_review`, `msi_activity_log`, `msi_capacity_reservation`, `msi_credential`, `msi_billable_publish_event`, `msi_addon_subscription`, `msi_analytics_report`, `msi_ad_campaign`, `msi_community_reply` | **17 tables** |

### 1.2 Provider Integrations (Active)

| Provider | Purpose | Method | Fallback |
|---|---|---|---|
| **Fal.ai** | Image/video generation (12 models) | Direct REST queue + webhooks | Credit refund on failure |
| **Anthropic Claude** | Text generation (scripts, captions) | SDK `@anthropic-ai/sdk` | DeepSeek → OpenAI |
| **DeepSeek** | Text generation (fallback) | REST OpenAI-compat | OpenAI |
| **OpenAI** | Text + images (via Fal gateway) | REST + Fal-hosted | None |
| **ElevenLabs** | TTS + voice cloning | Direct REST | Circuit breaker (10min) |
| **Cloudinary** | All media storage | SDK `cloudinary` v2 | None |
| **Unsplash** | Stock photos | REST | None |

**Providers NOT integrated:** Replicate, Runway, HeyGen, Synthesia, Suno, Udio, Google Gemini/Vertex, Stability AI

### 1.3 Job/Queue Systems (13 systems)

| System | Trigger | Status |
|---|---|---|
| Campaign generation drain | Cron (2min) + Inngest | ✅ Working |
| Publishing scheduler | Cron (5min) | ✅ Working |
| Analytics sync | Cron (6h) | ✅ Working |
| MSI worker | Cron | ✅ Working |
| AI Studio jobs (Fal) | Webhook + poll + stale sweep (15min) | ✅ Working |
| LoRA training webhook | Fal push | ✅ Working |
| Editor video render | Poll | ✅ Working |
| Seed trending | Cron (4 routes) | ✅ Working |
| Credit monitor | Cron | ✅ Working |
| Paystack activation | Cron (daily) | ✅ Working |
| Outgoing webhooks | Event-driven + waitUntil | ✅ Working |
| Incoming webhooks | Clerk, Cloudinary, Stripe, Paystack, Polar | ✅ Working |
| Concurrency utils | Helper | ✅ Working |

### 1.4 Storage Architecture

| System | Location | Status |
|---|---|---|
| **Cloudinary (primary)** | `nativpost/{orgId}/`, `nativpost/templates/`, `nativpost/audio/`, `nativpost/renders/` | ✅ Active |
| **Uploadcare (legacy)** | Uploadcare CDN | ⚠️ Co-existing, not primary |
| **Supabase Storage** | `vault` bucket (credentials only) | ✅ Active |

### 1.5 Search & Intelligence

| Capability | Status |
|---|---|
| Vector database (pgvector) | ❌ Not present |
| Embedding generation | ❌ Not present |
| Semantic search | ❌ Not present |
| Full-text search | ⚠️ Basic `ILIKE` only |
| Tag taxonomy | ⚠️ Flat JSONB arrays, no hierarchy |
| Similarity/clustering | ❌ Not present |
| Dedicated search API | ❌ Not present |

### 1.6 Admin UI

| Surface | Route | Components |
|---|---|---|
| **Admin Ops Shell** | `/admin/*` | Curation queue, Bulk import, Curation stats, MSI operations |
| **Content Library** | `/dashboard/content-library` | Template browser, filter, remix |
| **Media Library** | `/dashboard/media-library` | Cloudinary assets, sets, upload |
| **Posts Grid** | `/dashboard/posts` | Post cards, grid/table views |
| **Content Detail** | `/dashboard/content/[id]` | Preview, actions, scheduling |
| **AI Studio** | `/dashboard/ai-studio` | Generation UI |
| **Editor** | `/dashboard/editor` | Visual content editor |

---

## 2. WHAT WE KEEP (Infrastructure Layer)

### 2.1 Database Foundation
- **`organization`** — root entity, FK cascade pattern (keep as-is)
- **`brand_profile`** — brand identity (keep as-is)
- **`social_account`** — platform connections (keep as-is)
- **`campaign`** / `campaign_content` / `campaign_job` — campaign engine (keep as-is, will consume new content engine)
- **`ai_influencer`** / `influencer_angle` / `voice_clone` — influencer system (keep as-is)
- **`publishing_queue`** — publish pipeline (keep as-is, will consume new content)
- **`api_key`** / `webhook_endpoint` / `webhook_delivery` — API infrastructure (keep as-is)
- **All MSI tables** (17) — completely separate subsystem (keep as-is)
- **All support tables** (4) — completely separate subsystem (keep as-is)
- **`notification`** / `user_settings` / `onboarding_progress` — platform utilities (keep as-is)

### 2.2 Provider Infrastructure
- **Fal.ai client** (`src/lib/ai-studio/fal.ts`) — queue submit, status, result, cancel, webhook verification
- **Fal model registry** (`src/lib/ai-studio/models.ts`) — 12 model definitions with input builders
- **Reconciliation** (`src/lib/ai-studio/reconcile.ts`) — webhook → Cloudinary → media_asset pipeline
- **ElevenLabs TTS** (`src/lib/ai-studio/elevenlabs.ts`) — text → audio → Cloudinary
- **Cloudinary storage** — all upload/delivery/enhance utilities
- **Anthropic SDK** — text generation (reuse for content engine)
- **DeepSeek** — fallback LLM (reuse for content engine)

### 2.3 Job Infrastructure
- **Campaign drain** — battle-tested queue pattern (atomic claim, chunk checkpointing, stale sweep)
- **Fal webhook + poll + sweep** — 3-layer resilience (reuse pattern for new generation jobs)
- **Outgoing webhook dispatcher** — event-driven notifications (extend with new events)
- **Concurrency utils** — bounded-concurrency map (reuse)

### 2.4 UI Components (Reusable)
- `ContentLibraryBrowser` — filter/grid/pagination shell
- `TemplateCard` — media card with hover-to-play
- `GalleryPreview` / `SlideView` — WYSIWYG slide renderer
- `RemotionPreviewPlayer` — video preview
- `PostCard` — grid card with intersection observer
- `MediaUploader` — Cloudinary upload widget
- `CommandPalette` — Cmd+K navigation
- TanStack Table setup — for data tables

### 2.5 Auth & Gating
- **Clerk auth** — org-based, middleware-gated
- **Admin shell** — role-based nav, `isNativPostStaff` gating
- **Billing gate** — subscription status checking

---

## 3. WHAT WE DELETE (Content Library Tables)

These tables are **empty** (DB was wiped) and will be **replaced** by the new Content Intelligence Engine schema:

| Table | Reason for Deletion |
|---|---|
| `content_item` | Replaced by `library_content` + `content_composition` |
| `content_template` | Replaced by `library_content` (type=`template`) |
| `content_calendar` | Replaced by content scheduling in `library_content` |
| `content_plan` | Replaced by demand engine (not a table — computed) |
| `content_feedback` | Replaced by quality scores on `library_content` |
| `content_angle` | Replaced by hierarchical `tag` system |
| `content_edit` | Replaced by editor state in `library_content.metadata` |
| `media_asset` | Replaced by new `media_asset` (same name, new schema) |
| `media_set` | Replaced by composition-based grouping |
| `blitz_media_usage` | Replaced by `asset_usage` tracking |
| `blitz_template_usage` | Replaced by `asset_usage` tracking |
| `engine_request_log` | Replaced by `generation_job` audit trail |
| `automation_rule` | Replaced by content engine rules (later phase) |
| `apify_seed_run` | Replaced by content engine ingestion |
| `ai_studio_job` | Replaced by `generation_job` |
| `long_form_project` | Replaced by content engine long-form pipeline |

**Total: 16 tables deleted**

---

## 4. NEW DOMAIN MODEL — Content Intelligence Engine

### 4.1 New Tables (10 tables)

```sql
-- 1. PROVIDERS: Who can generate for us
CREATE TABLE provider (
  id TEXT PRIMARY KEY,                    -- 'fal', 'elevenlabs', 'openai', 'anthropic'
  name TEXT NOT NULL,
  type TEXT NOT NULL,                     -- 'media_generation', 'text_generation', 'audio_generation'
  config JSONB DEFAULT '{}',             -- env vars, base URLs, feature flags
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,            -- higher = preferred
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. MODELS: What each provider can do
CREATE TABLE model (
  id TEXT PRIMARY KEY,                    -- 'flux-dev', 'kling-v3-turbo-pro-i2v', 'claude-sonnet-4-6'
  provider_id TEXT NOT NULL REFERENCES provider(id),
  name TEXT NOT NULL,                     -- 'FLUX Dev', 'Kling V3 Turbo Pro'
  type TEXT NOT NULL,                     -- 'image', 'video', 'audio', 'text'
  input_schema JSONB,                    -- what parameters this model accepts
  output_schema JSONB,                   -- what it returns
  cost_per_call REAL,                    -- credit cost
  capabilities JSONB DEFAULT '{}',       -- { max_duration, max_resolution, supports_style, ... }
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. MEDIA_ASSET: Every file we store
CREATE TABLE media_asset (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT REFERENCES organization(id),
  provider_id TEXT REFERENCES provider(id),  -- NULL if user upload
  model_id TEXT REFERENCES model(id),        -- NULL if user upload
  cloudinary_public_id TEXT,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  asset_type TEXT NOT NULL,               -- 'image', 'video', 'audio', 'lottie'
  mime_type TEXT,
  file_size INTEGER,
  width INTEGER,
  height INTEGER,
  aspect_ratio TEXT,
  duration_seconds REAL,
  source TEXT NOT NULL,                   -- 'upload', 'ai_generated', 'template', 'stock'
  generation_job_id UUID,                -- link to generation_job if AI-generated
  quality_score REAL,                     -- computed quality gate score
  quality_flags JSONB DEFAULT '[]',      -- ['too_short', 'low_resolution', 'nsfw', ...]
  embedding VECTOR(1536),                -- pgvector for semantic search
  metadata JSONB DEFAULT '{}',           -- AI analysis results, transcription, etc.
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. TAG: Hierarchical taxonomy
CREATE TABLE tag (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  parent_id UUID REFERENCES tag(id),     -- hierarchical (niche > sub-niche)
  type TEXT NOT NULL,                     -- 'niche', 'angle', 'format', 'mood', 'industry', 'custom'
  color TEXT,
  description TEXT,
  embedding VECTOR(1536),                -- for tag similarity
  usage_count INTEGER DEFAULT 0,
  is_system BOOLEAN DEFAULT false,       -- system tags can't be deleted
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. ASSET_TAG: Many-to-many
CREATE TABLE asset_tag (
  asset_id UUID NOT NULL REFERENCES media_asset(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  confidence REAL DEFAULT 1.0,           -- AI-assigned tags get confidence score
  source TEXT DEFAULT 'manual',          -- 'manual', 'ai_auto', 'ai_suggested'
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (asset_id, tag_id)
);

-- 6. CONTENT_TYPE: Content format definitions
CREATE TABLE content_type (
  id TEXT PRIMARY KEY,                    -- 'slideshow', 'talking_head', 'green_screen_meme', ...
  name TEXT NOT NULL,
  description TEXT,
  slot_schema JSONB NOT NULL,            -- { hook_video: { required: true, type: 'video' }, ... }
  render_config JSONB DEFAULT '{}',      -- aspect ratio, duration range, resolution
  qualification_rules JSONB DEFAULT '{}', -- what makes a valid instance of this type
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. CONTENT_COMPOSITION: How assets combine into content
CREATE TABLE content_composition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type_id TEXT NOT NULL REFERENCES content_type(id),
  org_id TEXT REFERENCES organization(id),
  name TEXT,
  slots JSONB NOT NULL,                  -- { hook_video: { asset_id: '...', start: 0, end: 5 }, ... }
  metadata JSONB DEFAULT '{}',           -- style, timing, transitions
  quality_score REAL,
  is_complete BOOLEAN DEFAULT false,     -- all required slots filled + passes qualification
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. LIBRARY_CONTENT: The actual content item (replaces content_item)
CREATE TABLE library_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL REFERENCES organization(id),
  content_type_id TEXT NOT NULL REFERENCES content_type(id),
  composition_id UUID REFERENCES content_composition(id),
  campaign_id UUID REFERENCES campaign(id),
  title TEXT,
  caption TEXT,
  hashtags JSONB DEFAULT '[]',
  target_platforms JSONB DEFAULT '[]',
  target_account_ids JSONB DEFAULT '[]',
  status TEXT DEFAULT 'draft',            -- draft, pending_review, approved, scheduled, rejected, published
  scheduled_for TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  quality_score REAL,
  quality_flags JSONB DEFAULT '[]',
  anti_slop_score REAL,
  metadata JSONB DEFAULT '{}',           -- platform-specific data, enrichment, etc.
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 9. GENERATION_JOB: Every AI generation request (replaces ai_studio_job)
CREATE TABLE generation_job (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL REFERENCES organization(id),
  provider_id TEXT NOT NULL REFERENCES provider(id),
  model_id TEXT NOT NULL REFERENCES model(id),
  kind TEXT NOT NULL,                     -- 'image', 'video', 'audio', 'text', 'lipsync'
  status TEXT DEFAULT 'queued',           -- queued, processing, succeeded, failed, cancelled
  input JSONB NOT NULL,                  -- model-specific input params
  output JSONB,                          -- model-specific output (URLs, text, etc.)
  fal_request_id TEXT,                   -- external job reference
  credits_reserved INTEGER DEFAULT 0,
  credits_charged INTEGER DEFAULT 0,
  error_message TEXT,
  webhook_received_at TIMESTAMPTZ,
  duration_ms INTEGER,
  media_asset_id UUID REFERENCES media_asset(id),  -- result asset
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 10. ASSET_USAGE: Track where assets are used (replaces blitz_media_usage + blitz_template_usage)
CREATE TABLE asset_usage (
  id SERIAL PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES media_asset(id),
  org_id TEXT NOT NULL REFERENCES organization(id),
  content_id UUID REFERENCES library_content(id),
  campaign_id UUID REFERENCES campaign(id),
  usage_type TEXT NOT NULL,              -- 'composition', 'content', 'campaign', 'template'
  used_at TIMESTAMPTZ DEFAULT now()
);
```

### 4.2 New Enums (TypeScript — stored as text)

```typescript
type ProviderType = 'media_generation' | 'text_generation' | 'audio_generation';
type ModelType = 'image' | 'video' | 'audio' | 'text';
type AssetType = 'image' | 'video' | 'audio' | 'lottie';
type AssetSource = 'upload' | 'ai_generated' | 'template' | 'stock';
type TagType = 'niche' | 'angle' | 'format' | 'mood' | 'industry' | 'custom';
type ContentStatus = 'draft' | 'pending_review' | 'approved' | 'scheduled' | 'rejected' | 'published';
type JobStatus = 'queued' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
type UsageType = 'composition' | 'content' | 'campaign' | 'template';
```

### 4.3 Relationships

```
organization (1) ──< (N) media_asset
organization (1) ──< (N) library_content
organization (1) ──< (N) generation_job
organization (1) ──< (N) content_composition

provider (1) ──< (N) model
provider (1) ──< (N) generation_job
model (1) ──< (N) generation_job

media_asset (1) ──< (N) asset_tag
tag (1) ──< (N) asset_tag
tag (1) ──< (N) tag (self-referential parent)

media_asset (1) ──< (N) asset_usage
library_content (1) ──< (N) asset_usage
campaign (1) ──< (N) asset_usage

content_type (1) ──< (N) content_composition
content_type (1) ──< (N) library_content
content_composition (1) ──< (N) library_content

generation_job (1) ──> (0..1) media_asset
media_asset (0..1) ──< (N) generation_job
```

---

## 5. CAPABILITY GAP ANALYSIS

### 5.1 Content Type System

| Requirement | Current State | Gap |
|---|---|---|
| Content type definitions with slot schemas | ❌ Hardcoded in TypeScript enums | Need `content_type` table |
| Dynamic slot validation | ❌ Manual per-route checks | Need schema-driven validation |
| Slot schema (hook_video, demo_video, background, etc.) | ⚠️ Partially in `media-resolvers.ts` | Need formal definition |
| Content type qualification rules | ❌ Not present | Need `qualification_rules` on content_type |
| Composition builder (fill slots → validate → publish) | ⚠️ Ad-hoc in editor | Need `content_composition` engine |

### 5.2 Asset Intelligence

| Requirement | Current State | Gap |
|---|---|---|
| Every asset tagged with provider + model | ❌ No provider tracking on media_asset | Need `provider_id` + `model_id` FK |
| Quality scoring pipeline | ❌ Only anti-slop on content_item | Need `quality_score` + `quality_flags` on media_asset |
| Usage tracking per asset | ⚠️ Only `usage_count` (no detail) | Need `asset_usage` table |
| Audit trail (who generated what, when, cost) | ⚠️ Only in `ai_studio_job` | Need `generation_job` linked to `media_asset` |
| Semantic search via embeddings | ❌ Not present | Need pgvector + embedding generation |
| Deduplication via embedding similarity | ❌ Not present | Need similarity search |

### 5.3 Provider Abstraction

| Requirement | Current State | Gap |
|---|---|---|
| Provider registry (DB-driven) | ❌ Hardcoded in TypeScript | Need `provider` + `model` tables |
| Model router (select best model for task) | ❌ Manual model selection in each route | Need model router with capability matching |
| Unified generation API | ❌ Per-provider direct calls | Need `POST /api/content-engine/generate` |
| Webhook aggregation | ⚠️ Separate routes per provider | Need unified webhook handler |
| Credit management per provider | ⚠️ Per-route reservation | Need provider-level credit tracking |
| Retry/fallback at provider level | ⚠️ Per-route implementation | Need model router fallback chain |

### 5.4 Search & Discovery

| Requirement | Current State | Gap |
|---|---|---|
| Semantic asset search | ❌ `ILIKE` only | Need pgvector + embeddings |
| Tag hierarchy (niche > sub-niche) | ❌ Flat arrays | Need hierarchical `tag` table |
| Multi-field search (caption, tags, description) | ⚠️ Single-field ILIKE | Need full-text search |
| Similar asset recommendations | ❌ Not present | Need embedding similarity |
| "Find me X similar to Y" | ❌ Not present | Need semantic search API |

### 5.5 Content Construction

| Requirement | Current State | Gap |
|---|---|---|
| Content type definitions with slot schemas | ❌ Hardcoded | Need `content_type` table |
| Slot filling from asset library | ⚠️ Manual in editor | Need composition engine |
| Auto-qualification (valid slots + duration + quality) | ❌ Not present | Need qualification rules |
| Publishing gate (only complete, qualified content) | ⚠️ Basic status checks | Need gate enforcement |

### 5.6 Admin UI

| Requirement | Current State | Gap |
|---|---|---|
| Content Factory dashboard | ❌ Not present | Need new admin page |
| Provider health monitoring | ❌ Not present | Need provider status UI |
| Model performance tracking | ❌ Not present | Need metrics dashboard |
| Content type management | ❌ Not present | Need CRUD UI |
| Tag taxonomy management | ⚠️ Inline only in curation | Need dedicated UI |
| Asset quality review queue | ❌ Not present | Need review queue UI |

---

## 6. EXISTING CODE TO REUSE/ADAPT

### 6.1 Fal.ai Integration (HIGH REUSE)

| File | Reuse | Adaptation Needed |
|---|---|---|
| `src/lib/ai-studio/fal.ts` | Queue submit, status, result, cancel, webhook verify | Extract into provider adapter |
| `src/lib/ai-studio/models.ts` | 12 model definitions | Move to DB, keep as seed data |
| `src/lib/ai-studio/reconcile.ts` | Webhook → Cloudinary → asset pipeline | Generalize for any provider |
| `src/lib/ai-studio/job-helpers.ts` | Per-model input builders | Keep, extend for new models |
| `src/lib/ai-studio/cloudinary.ts` | storeImageRender, storeVideoRender, storeAudioRender | Keep as-is |

### 6.2 Anthropic/DeepSeek Integration (MEDIUM REUSE)

| File | Reuse | Adaptation Needed |
|---|---|---|
| `src/lib/ai-studio/copilot.ts` | Claude → DeepSeek fallback chain | Extract into LLM provider adapter |
| `src/lib/template-seed/ai.ts` | callLLM() with 3-provider cascade | Keep, generalize |
| `src/lib/blitz/apply-brand-voice.ts` | Brand voice rewriting | Keep as content engine utility |

### 6.3 ElevenLabs Integration (HIGH REUSE)

| File | Reuse | Adaptation Needed |
|---|---|---|
| `src/lib/ai-studio/elevenlabs.ts` | TTS generation + Cloudinary upload | Extract into audio provider adapter |
| `src/lib/blitz/generate-audio.ts` | Duration validation, circuit breaker, truncation | Keep as quality gate |

### 6.4 Cloudinary Storage (FULL REUSE)

| File | Reuse | Adaptation Needed |
|---|---|---|
| `src/lib/cloudinary.ts` | URL generation, optimization | Keep as-is |
| `src/lib/cloudflare-helpers.ts` | cldImageUrl, cldThumbnail, cldVideoSrc | Keep as-is |
| `src/lib/cloudinary-enhance.ts` | Image enhancement | Keep as-is |
| `src/lib/cloudinary-storage.ts` | Storage usage accounting | Keep as-is |

### 6.5 Job Infrastructure (HIGH REUSE)

| File | Reuse | Adaptation Needed |
|---|---|---|
| `src/lib/campaigns/drain-job.ts` | Atomic claim, chunk checkpoint, stale sweep | Adapt for generation jobs |
| `src/lib/webhook-dispatcher.ts` | Outgoing webhook delivery | Extend with new events |
| `src/lib/concurrency.ts` | mapWithConcurrency | Keep as-is |

### 6.6 UI Components (MEDIUM REUSE)

| File | Reuse | Adaptation Needed |
|---|---|---|
| `ContentLibraryBrowser` | Filter/grid/pagination shell | Retarget to new API |
| `TemplateCard` | Media card with hover-to-play | Generalize for any asset |
| `GalleryPreview` / `SlideView` | WYSIWYG slide renderer | Keep for content preview |
| `PostCard` | Grid card with intersection observer | Generalize for content items |
| `MediaUploader` | Cloudinary upload widget | Keep as-is |
| `CurationQueue` | Admin table with bulk actions | Adapt for asset review |

---

## 7. IMPLEMENTATION ROADMAP

### Phase 1: Database + Domain Model (Foundation)
- Create migration with 10 new tables
- Seed `provider` and `model` tables with current Fal/ElevenLabs/Anthropic config
- Seed `content_type` table with 7 current content types + slot schemas
- Enable `pgvector` extension
- Create indexes (GIN for JSONB, HNSW for vectors)
- **Zero existing code changes** — additive only

### Phase 2: Provider Registry + Generation Abstraction
- Create `src/lib/content-engine/providers/` adapter layer
- Implement Fal adapter (wrap existing `fal.ts`)
- Implement ElevenLabs adapter (wrap existing `elevenlabs.ts`)
- Implement LLM adapter (wrap existing Claude/DeepSeek cascade)
- Create model router: select model by type + capabilities + cost
- Create unified generation API: `POST /api/content-engine/generate`
- **This replaces the per-route direct calls, not the existing providers**

### Phase 3: Generation Jobs + Async Processing
- Create `generation_job` CRUD API
- Migrate AI Studio job lifecycle to new table
- Implement webhook aggregation (single handler for all providers)
- Implement stale job sweep (reuse 15min pattern)
- Implement credit reservation + commit/refund lifecycle

### Phase 4: Media Processing + Quality Gate
- Implement quality scoring pipeline (resolution, duration, aspect ratio, NSFW)
- Implement audio validation (duration cap, format check)
- Implement `quality_flags` accumulation
- Implement asset usage tracking
- Implement embedding generation on asset creation

### Phase 5: Tag Taxonomy + Tagging Engine
- Implement tag CRUD with hierarchy
- Implement AI auto-tagging (niche, mood, content type detection)
- Implement tag similarity via embeddings
- Migrate existing flat niches/angles to hierarchical tags
- Implement confidence scoring on AI-assigned tags

### Phase 6: Content Type Definitions + Construction
- Implement content type CRUD
- Implement slot schema validation
- Implement composition builder (fill slots → validate → score)
- Implement content qualification engine
- Implement publishing gate (only complete compositions)

### Phase 7: Deduplication + Diversity + Inventory
- Implement embedding-based dedup (cosine similarity threshold)
- Implement diversity scoring (tag coverage across content)
- Implement inventory tracking (what content types do we have enough of)
- Implement demand forecasting (what content types are needed)

### Phase 8: Admin Content Factory UI
- Provider health dashboard
- Model performance metrics
- Content type management
- Tag taxonomy management
- Asset quality review queue
- Generation job history + retry

---

## 8. RISK ASSESSMENT

| Risk | Impact | Mitigation |
|---|---|---|
| DB wipe already happened — empty tables | Low | New tables are additive; existing empty tables can be dropped safely |
| pgvector extension not enabled | Low | `CREATE EXTENSION IF NOT EXISTS vector;` in migration |
| Fal.ai is single gateway for all media | Medium | Provider abstraction makes adding others straightforward |
| No existing test suite found | High | Add tests for provider adapters + quality gate before shipping |
| 61 existing migrations — migration complexity | Low | New tables in single clean migration |
| Vercel serverless timeouts (300s) | Medium | Reuse chunk checkpointing pattern from campaign drain |
| Free tier Supabase — connection limits | Medium | Connection pooling via pooler already configured |

---

## 9. SUCCESS CRITERIA

After implementation, the Content Intelligence Engine should:

1. **Every asset knows its origin**: provider, model, input params, generation cost, timestamp
2. **Every asset is scored**: quality flags, resolution, duration, NSFW, completeness
3. **Every asset is searchable**: semantic search via embeddings, hierarchical tags, multi-field search
4. **Every asset is tracked**: usage count, where used, last used, campaign association
5. **Content types are schema-driven**: not hardcoded — add new type = insert row
6. **Generation is provider-agnostic**: swap FLUX for Stability without code changes
7. **Compositions are validated**: can't publish incomplete content
8. **Admins have visibility**: provider health, model performance, content inventory, quality queue
9. **Zero breaking changes**: existing campaigns, publishing, MSI all continue working
10. **Database is the source of truth**: not TypeScript enums, not hardcoded arrays
