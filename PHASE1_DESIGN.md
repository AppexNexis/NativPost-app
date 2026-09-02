# Content Intelligence Engine — Phase 1 Design Document

**Version:** 1.0.0
**Date:** 2026-08-31
**Status:** DESIGN REVIEW (not yet implemented)
**Migration Number:** 0061

---

## Conventions (from existing codebase audit)

| Convention | Pattern | Example |
|---|---|---|
| **UUID PK** | `uuid('id').primaryKey().defaultRandom()` | `gen_random_uuid()` |
| **Org FK** | `text('org_id').references(() => organizationSchema.id, { onDelete: 'cascade' }).notNull()` | Clerk org ID (text) |
| **Timestamps** | `timestamp('created_at', { mode: 'date' }).defaultNow().notNull()` | Always `now()` |
| **UpdatedAt** | `timestamp('updated_at', { mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull()` | Auto-update |
| **JSONB default** | `jsonb('field').default({})` or `.default([])` | `'{}'::jsonb` or `'[]'::jsonb` in SQL |
| **Boolean** | `boolean('field').default(true)` | Never `.notNull()` on booleans |
| **Text enums** | `text('status').default('draft').notNull()` | No pgEnum — TypeScript unions |
| **FK naming** | `{table}_{column}_{ref_table}_{ref_column}_fk` | `cmp_org_id_organization_id_fk` |
| **Index naming** | `{table}_{columns}_idx` | `ai_studio_job_org_created_at_idx` |
| **Unique index** | `{table}_{columns}_idx` with `uniqueIndex()` | `stripe_customer_id_idx` |
| **Partial index** | `WHERE condition` on index | `WHERE "fal_request_id" IS NOT NULL` |
| **Migration style** | `CREATE TABLE IF NOT EXISTS` + `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN null; END $$;` for FKs | Drizzle-generated |
| **RLS** | `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` for `service_role` and `authenticated` | Pattern in 0060 |

---

## A. Entity Relationship Diagram

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
│ name            │    │ slug             │    │ name             │
│ type            │    │ name             │    │ slug (UNIQUE)    │
│ config          │    │ description      │    │ parent_id (FK→tag)│
│ is_active       │    │ slot_schema      │    │ type             │
│ priority        │    │ qualification    │    │ color            │
│ created_at      │    │ construction     │    │ description      │
│ updated_at      │    │ render_config    │    │ usage_count      │
└────────┬────────┘    │ is_active        │    │ is_system        │
         │             │ created_at       │    │ embedding        │
         │             └──────────────────┘    │ created_at       │
         │                                     └────────┬─────────┘
         ▼                                              │
┌─────────────────┐                                     │
│     model       │                                     │
│                 │                                     │
│ id (PK)         │                                     │
│ provider_id(FK) │                                     │
│ name            │                                     │
│ type            │                                     │
│ input_schema    │                                     │
│ output_schema   │                                     │
│ cost_per_call   │                                     │
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
│ input (JSONB)                    │                    │
│ output (JSONB)                   │                    │
│ external_job_id                  │                    │
│ credits_reserved                 │                    │
│ credits_charged                  │                    │
│ error_message                    │                    │
│ webhook_received_at              │                    │
│ duration_ms                      │                    │
│ media_asset_id (FK→media_asset)  │                    │
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
│ generation_job_id (FK→gen_job)   │
│ provider_id (FK→provider)        │
│ model_id (FK→model)              │
│ origin_type                      │
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
│ audio_duration_ms                │
│ audio_codec                      │
│ audio_sample_rate                │
│ audio_channels                   │
│ audio_source                     │
│ audio_loudness_lufs              │
│ file_hash                        │
│ perceptual_hash                  │
│ quality_score                    │
│ quality_flags (JSONB)            │
│ embedding (vector 1536)          │
│ visual_embedding (vector 512)    │
│ embedding_model                  │
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
│ created_at │  │ composition_id (FK)  │
└────────────┘  │ campaign_id (FK)     │
                │ usage_type           │
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

## B. Table-by-Table Schema

### B.1 `provider` — Who can generate for us

```sql
CREATE TABLE IF NOT EXISTS "provider" (
  "id" text PRIMARY KEY,                           -- 'fal', 'elevenlabs', 'openai', 'anthropic', 'nativpost-image-engine', 'nativpost-video-engine'
  "name" text NOT NULL,                             -- 'Fal.ai', 'ElevenLabs', 'OpenAI', etc.
  "type" text NOT NULL,                             -- 'media_generation' | 'text_generation' | 'audio_generation'
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,      -- provider-specific config (env var names, base URLs, feature flags)
  "is_active" boolean DEFAULT true NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,            -- higher = preferred when multiple providers match
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
```

**Drizzle:**
```typescript
export const providerSchema = pgTable('provider', {
  id: text('id').primaryKey(),                      -- NOT uuid — external identifier
  name: text('name').notNull(),
  type: text('type').notNull(),                     -- ProviderType enum
  config: jsonb('config').default({}).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  priority: integer('priority').default(0).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
```

---

### B.2 `model` — What each provider can do

```sql
CREATE TABLE IF NOT EXISTS "model" (
  "id" text PRIMARY KEY,                            -- 'flux-dev', 'kling-v3-turbo-pro-i2v', 'claude-sonnet-4-6'
  "provider_id" text NOT NULL,                      -- FK → provider.id
  "name" text NOT NULL,                             -- 'FLUX.1 [dev]', 'Kling V3 Turbo Pro'
  "type" text NOT NULL,                             -- 'image' | 'video' | 'audio' | 'text' | 'image-edit' | 'video-lipsync'
  "input_schema" jsonb,                             -- { prompt: { type: 'string', required: true }, image_url: { type: 'string', required: false }, ... }
  "output_schema" jsonb,                            -- { url: 'string', duration: 'number', ... }
  "cost_per_call" real,                             -- USD cost per generation
  "cost_per_second" real,                           -- USD cost per second (video models)
  "capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL, -- { max_duration, max_resolution, supports_style, supports_audio, aspects, ... }
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
```

**Drizzle:**
```typescript
export const modelSchema = pgTable('model', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').references(() => providerSchema.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),                     -- ModelType enum
  inputSchema: jsonb('input_schema'),
  outputSchema: jsonb('output_schema'),
  costPerCall: real('cost_per_call'),
  costPerSecond: real('cost_per_second'),
  capabilities: jsonb('capabilities').default({}).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});
```

---

### B.3 `media_asset` — Every file we store (NEW — replaces old media_asset)

```sql
CREATE TABLE IF NOT EXISTS "media_asset" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,

  -- Ownership
  "org_id" text,                                    -- NULL = system/global asset (shared catalog)

  -- Provenance (THE critical invariant)
  "origin_type" text NOT NULL DEFAULT 'user_uploaded', -- 'ai_generated' | 'ai_enhanced' | 'user_uploaded' | 'imported' | 'system_generated'
  "generation_job_id" uuid,                         -- REQUIRED for ai_generated; NULL for uploads
  "provider_id" text,                               -- FK → provider.id (NULL for uploads)
  "model_id" text,                                  -- FK → model.id (NULL for uploads)
  "provider_job_id" text,                           -- External provider's job/run ID (fal_request_id, etc.)
  "generation_input" jsonb,                         -- Snapshot of the generation prompt/params

  -- Storage
  "cloudinary_public_id" text,
  "url" text NOT NULL,
  "thumbnail_url" text,

  -- Media properties
  "asset_type" text NOT NULL,                       -- 'image' | 'video' | 'audio'
  "mime_type" text,
  "file_size" integer,                              -- bytes
  "width" integer,
  "height" integer,
  "aspect_ratio" text,                              -- '9:16', '16:9', '1:1', '4:5'
  "duration_seconds" real,                          -- video/audio duration

  -- Audio metadata (HARD REQUIREMENT for video)
  "has_audio" boolean DEFAULT false NOT NULL,
  "audio_duration_ms" integer,                      -- precise audio duration
  "audio_codec" text,                               -- 'aac', 'mp3', 'opus', etc.
  "audio_sample_rate" integer,                      -- 44100, 48000, etc.
  "audio_channels" integer,                         -- 1=mono, 2=stereo
  "audio_source" text,                              -- 'native' (generated with video) | 'added' (post-processing) | 'background_music'
  "audio_loudness_lufs" real,                       -- integrated loudness (EBU R128)
  "audio_is_silent" boolean DEFAULT false,          -- detected silence/invalid audio

  -- Deduplication
  "file_hash" text,                                 -- SHA-256 of file bytes
  "perceptual_hash" text,                           -- pHash for visual similarity

  -- Quality
  "quality_score" real,                             -- 0.0–1.0 computed quality gate score
  "quality_flags" jsonb DEFAULT '[]'::jsonb,        -- ['no_audio', 'too_short', 'low_resolution', 'nsfw', 'corrupted', 'duplicate', ...]
  "quality_checked_at" timestamp,

  -- Embeddings
  "embedding" vector(1536),                         -- semantic embedding (OpenAI text-embedding-3-small)
  "visual_embedding" vector(512),                   -- optional visual embedding (CLIP)
  "embedding_model" text,                           -- 'text-embedding-3-small', 'clip-vit-b-32', etc.
  "embedding_version" text,                         -- model version for re-embedding
  "embedded_at" timestamp,

  -- Metadata
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,    -- { transcription, scene_description, subject检测, ... }

  -- Usage
  "usage_count" integer DEFAULT 0 NOT NULL,
  "last_used_at" timestamp,

  -- Timestamps
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
```

**Drizzle:**
```typescript
export const mediaAssetSchema = pgTable('media_asset', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').references(() => organizationSchema.id, { onDelete: 'cascade' }),
  originType: text('origin_type').default('user_uploaded').notNull(),
  generationJobId: uuid('generation_job_id'),
  providerId: text('provider_id').references(() => providerSchema.id, { onDelete: 'set null' }),
  modelId: text('model_id').references(() => modelSchema.id, { onDelete: 'set null' }),
  providerJobId: text('provider_job_id'),
  generationInput: jsonb('generation_input'),
  cloudinaryPublicId: text('cloudinary_public_id'),
  url: text('url').notNull(),
  thumbnailUrl: text('thumbnail_url'),
  assetType: text('asset_type').notNull(),
  mimeType: text('mime_type'),
  fileSize: integer('file_size'),
  width: integer('width'),
  height: integer('height'),
  aspectRatio: text('aspect_ratio'),
  durationSeconds: real('duration_seconds'),
  hasAudio: boolean('has_audio').default(false).notNull(),
  audioDurationMs: integer('audio_duration_ms'),
  audioCodec: text('audio_codec'),
  audioSampleRate: integer('audio_sample_rate'),
  audioChannels: integer('audio_channels'),
  audioSource: text('audio_source'),
  audioLoudnessLufs: real('audio_loudness_lufs'),
  audioIsSilent: boolean('audio_is_silent').default(false),
  fileHash: text('file_hash'),
  perceptualHash: text('perceptual_hash'),
  qualityScore: real('quality_score'),
  qualityFlags: jsonb('quality_flags').default([]),
  qualityCheckedAt: timestamp('quality_checked_at', { mode: 'date' }),
  embedding: vector('embedding', { dimensions: 1536 }),
  visualEmbedding: vector('visual_embedding', { dimensions: 512 }),
  embeddingModel: text('embedding_model'),
  embeddingVersion: text('embedding_version'),
  embeddedAt: timestamp('embedded_at', { mode: 'date' }),
  metadata: jsonb('metadata').default({}).notNull(),
  usageCount: integer('usage_count').default(0).notNull(),
  lastUsedAt: timestamp('last_used_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
```

---

### B.4 `tag` — Hierarchical taxonomy

```sql
CREATE TABLE IF NOT EXISTS "tag" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,                              -- URL-safe, unique
  "parent_id" uuid,                                 -- self-referential FK for hierarchy
  "type" text NOT NULL,                              -- 'person' | 'business' | 'industry' | 'intent' | 'visual' | 'style' | 'audience' | 'format' | 'emotion' | 'custom'
  "color" text,                                     -- hex color for UI badges
  "description" text,
  "embedding" vector(1536),                         -- for tag similarity
  "usage_count" integer DEFAULT 0 NOT NULL,
  "is_system" boolean DEFAULT false NOT NULL,       -- system tags can't be deleted
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
```

**Drizzle:**
```typescript
export const tagSchema = pgTable('tag', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  parentId: uuid('parent_id'),
  type: text('type').notNull(),                     -- TagType enum
  color: text('color'),
  description: text('description'),
  embedding: vector('embedding', { dimensions: 1536 }),
  usageCount: integer('usage_count').default(0).notNull(),
  isSystem: boolean('is_system').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});
```

---

### B.5 `asset_tag` — Many-to-many: assets ↔ tags

```sql
CREATE TABLE IF NOT EXISTS "asset_tag" (
  "asset_id" uuid NOT NULL,                         -- FK → media_asset.id
  "tag_id" uuid NOT NULL,                           -- FK → tag.id
  "confidence" real DEFAULT 1.0 NOT NULL,           -- 0.0–1.0 (AI-assigned tags get confidence score)
  "source" text DEFAULT 'manual' NOT NULL,          -- 'manual' | 'ai_auto' | 'ai_suggested'
  "created_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("asset_id", "tag_id")
);
```

**Drizzle:**
```typescript
export const assetTagSchema = pgTable('asset_tag', {
  assetId: uuid('asset_id').references(() => mediaAssetSchema.id, { onDelete: 'cascade' }).notNull(),
  tagId: uuid('tag_id').references(() => tagSchema.id, { onDelete: 'cascade' }).notNull(),
  confidence: real('confidence').default(1.0).notNull(),
  source: text('source').default('manual').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.assetId, t.tagId] }),
}));
```

---

### B.6 `content_type` — Content format definitions (configuration-driven)

```sql
CREATE TABLE IF NOT EXISTS "content_type" (
  "id" text PRIMARY KEY,                            -- 'single_image', 'slideshow', 'reel', 'ugc', 'wall_of_text', 'talking_head', 'green_screen'
  "slug" text NOT NULL UNIQUE,
  "name" text NOT NULL,                             -- 'Single Image', 'Slideshow', etc.
  "description" text,

  -- Slot schema
  "min_assets" integer DEFAULT 1 NOT NULL,
  "max_assets" integer DEFAULT 1 NOT NULL,
  "requires_video" boolean DEFAULT false NOT NULL,
  "requires_audio" boolean DEFAULT true NOT NULL,   -- ALL content requires audio
  "requires_text_overlay" boolean DEFAULT false NOT NULL,
  "requires_caption" boolean DEFAULT true NOT NULL,

  -- Rules (JSONB for flexibility)
  "slot_schema" jsonb NOT NULL,                     -- { hook_video: { type: 'video', required: true }, background: { type: 'image', required: true }, ... }
  "qualification_rules" jsonb DEFAULT '{}'::jsonb NOT NULL, -- { min_duration: 3, max_duration: 60, min_resolution: '720p', ... }
  "construction_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,  -- { similarity_required: true, diversity_required: true, ... }
  "render_config" jsonb DEFAULT '{}'::jsonb NOT NULL,       -- { default_aspect: '9:16', supported_aspects: [...], ... }

  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
```

**Drizzle:**
```typescript
export const contentTypeSchema = pgTable('content_type', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  minAssets: integer('min_assets').default(1).notNull(),
  maxAssets: integer('max_assets').default(1).notNull(),
  requiresVideo: boolean('requires_video').default(false).notNull(),
  requiresAudio: boolean('requires_audio').default(true).notNull(),
  requiresTextOverlay: boolean('requires_text_overlay').default(false).notNull(),
  requiresCaption: boolean('requires_caption').default(true).notNull(),
  slotSchema: jsonb('slot_schema').notNull(),
  qualificationRules: jsonb('qualification_rules').default({}).notNull(),
  constructionRules: jsonb('construction_rules').default({}).notNull(),
  renderConfig: jsonb('render_config').default({}).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});
```

---

### B.7 `content_composition` — How assets combine into content

```sql
CREATE TABLE IF NOT EXISTS "content_composition" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "content_type_id" text NOT NULL,                  -- FK → content_type.id
  "org_id" text,                                    -- FK → organization.id (NULL = system composition)
  "name" text,                                      -- optional human-readable name
  "slots" jsonb NOT NULL,                           -- { hook_video: { asset_id: '...', start: 0, end: 5, ... }, ... }
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,    -- { style, timing, transitions, font, colors, ... }
  "quality_score" real,                             -- composition-level quality
  "is_complete" boolean DEFAULT false NOT NULL,     -- all required slots filled + passes qualification
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
```

**Drizzle:**
```typescript
export const contentCompositionSchema = pgTable('content_composition', {
  id: uuid('id').primaryKey().defaultRandom(),
  contentTypeId: text('content_type_id').references(() => contentTypeSchema.id, { onDelete: 'restrict' }).notNull(),
  orgId: text('org_id').references(() => organizationSchema.id, { onDelete: 'cascade' }),
  name: text('name'),
  slots: jsonb('slots').notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  qualityScore: real('quality_score'),
  isComplete: boolean('is_complete').default(false).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
```

---

### B.8 `library_content` — The final searchable/recommendable library item

```sql
CREATE TABLE IF NOT EXISTS "library_content" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" text NOT NULL,                           -- FK → organization.id
  "content_type_id" text NOT NULL,                  -- FK → content_type.id
  "composition_id" uuid,                            -- FK → content_composition.id
  "campaign_id" uuid,                               -- FK → campaign.id (nullable)

  -- Content
  "title" text,
  "caption" text,
  "hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL,    -- ["#saas", "#b2b", ...]
  "target_platforms" jsonb DEFAULT '[]'::jsonb NOT NULL, -- ['instagram', 'tiktok', 'linkedin']
  "target_account_ids" jsonb DEFAULT '[]'::jsonb NOT NULL, -- specific social_account IDs

  -- Status
  "status" text DEFAULT 'draft' NOT NULL,           -- ContentStatus enum
  "scheduled_for" timestamp,
  "published_at" timestamp,

  -- Quality
  "quality_score" real,
  "quality_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "anti_slop_score" real,

  -- Metadata
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,    -- platform-specific data, enrichment, engagement, etc.

  -- Timestamps
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
```

**Drizzle:**
```typescript
export const libraryContentSchema = pgTable('library_content', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').references(() => organizationSchema.id, { onDelete: 'cascade' }).notNull(),
  contentTypeId: text('content_type_id').references(() => contentTypeSchema.id, { onDelete: 'restrict' }).notNull(),
  compositionId: uuid('composition_id').references(() => contentCompositionSchema.id, { onDelete: 'set null' }),
  campaignId: uuid('campaign_id').references(() => campaignSchema.id, { onDelete: 'set null' }),
  title: text('title'),
  caption: text('caption'),
  hashtags: jsonb('hashtags').default([]).notNull(),
  targetPlatforms: jsonb('target_platforms').default([]).notNull(),
  targetAccountIds: jsonb('target_account_ids').default([]).notNull(),
  status: text('status').default('draft').notNull(),
  scheduledFor: timestamp('scheduled_for', { mode: 'date' }),
  publishedAt: timestamp('published_at', { mode: 'date' }),
  qualityScore: real('quality_score'),
  qualityFlags: jsonb('quality_flags').default([]).notNull(),
  antiSlopScore: real('anti_slop_score'),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
```

---

### B.9 `generation_job` — Every AI generation request

```sql
CREATE TABLE IF NOT EXISTS "generation_job" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" text NOT NULL,                           -- FK → organization.id
  "provider_id" text NOT NULL,                      -- FK → provider.id
  "model_id" text NOT NULL,                         -- FK → model.id
  "kind" text NOT NULL,                             -- 'image' | 'video' | 'audio' | 'text' | 'image-edit' | 'video-lipsync'

  -- Lifecycle
  "status" text DEFAULT 'planned' NOT NULL,         -- GenerationJobStatus enum
  "step" text,                                      -- current processing step for UI display

  -- Input/Output
  "input" jsonb NOT NULL,                           -- model-specific input params (prompt, image_url, duration, etc.)
  "output" jsonb,                                   -- model-specific output (URLs, text, etc.)

  -- External reference
  "external_job_id" text,                           -- fal_request_id, ElevenLabs request ID, etc.
  "external_status" text,                           -- raw status from provider

  -- Credits
  "credits_reserved" integer DEFAULT 0 NOT NULL,
  "credits_charged" integer DEFAULT 0,

  -- Error handling
  "error_message" text,
  "error_code" text,                                -- 'content_policy_violation', 'rate_limit_exceeded', etc.
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 3 NOT NULL,
  "next_attempt_at" timestamp,                      -- for retry backoff

  -- Result link
  "media_asset_id" uuid,                            -- FK → media_asset.id (set on success)

  -- Timing
  "webhook_received_at" timestamp,
  "started_at" timestamp,
  "completed_at" timestamp,
  "duration_ms" integer,

  -- Timestamps
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
```

**Drizzle:**
```typescript
export const generationJobSchema = pgTable('generation_job', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').references(() => organizationSchema.id, { onDelete: 'cascade' }).notNull(),
  providerId: text('provider_id').references(() => providerSchema.id, { onDelete: 'restrict' }).notNull(),
  modelId: text('model_id').references(() => modelSchema.id, { onDelete: 'restrict' }).notNull(),
  kind: text('kind').notNull(),
  status: text('status').default('planned').notNull(),
  step: text('step'),
  input: jsonb('input').notNull(),
  output: jsonb('output'),
  externalJobId: text('external_job_id'),
  externalStatus: text('external_status'),
  creditsReserved: integer('credits_reserved').default(0).notNull(),
  creditsCharged: integer('credits_charged').default(0),
  errorMessage: text('error_message'),
  errorCode: text('error_code'),
  attempts: integer('attempts').default(0).notNull(),
  maxAttempts: integer('max_attempts').default(3).notNull(),
  nextAttemptAt: timestamp('next_attempt_at', { mode: 'date' }),
  mediaAssetId: uuid('media_asset_id').references(() => mediaAssetSchema.id, { onDelete: 'set null' }),
  webhookReceivedAt: timestamp('webhook_received_at', { mode: 'date' }),
  startedAt: timestamp('started_at', { mode: 'date' }),
  completedAt: timestamp('completed_at', { mode: 'date' }),
  durationMs: integer('duration_ms'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
```

---

### B.10 `asset_usage` — Track where assets are used

```sql
CREATE TABLE IF NOT EXISTS "asset_usage" (
  "id" serial PRIMARY KEY,
  "asset_id" uuid NOT NULL,                         -- FK → media_asset.id
  "org_id" text NOT NULL,                           -- FK → organization.id
  "content_id" uuid,                                -- FK → library_content.id
  "composition_id" uuid,                            -- FK → content_composition.id
  "campaign_id" uuid,                               -- FK → campaign.id
  "usage_type" text NOT NULL,                       -- 'composition' | 'content' | 'campaign' | 'template'
  "used_at" timestamp DEFAULT now() NOT NULL
);
```

**Drizzle:**
```typescript
export const assetUsageSchema = pgTable('asset_usage', {
  id: serial('id').primaryKey(),
  assetId: uuid('asset_id').references(() => mediaAssetSchema.id, { onDelete: 'cascade' }).notNull(),
  orgId: text('org_id').references(() => organizationSchema.id, { onDelete: 'cascade' }).notNull(),
  contentId: uuid('content_id').references(() => libraryContentSchema.id, { onDelete: 'set null' }),
  compositionId: uuid('composition_id').references(() => contentCompositionSchema.id, { onDelete: 'set null' }),
  campaignId: uuid('campaign_id').references(() => campaignSchema.id, { onDelete: 'set null' }),
  usageType: text('usage_type').notNull(),
  usedAt: timestamp('used_at', { mode: 'date' }).defaultNow().notNull(),
});
```

---

## C. Indexes

```sql
-- ============================================================
-- PROVIDER
-- ============================================================
-- No additional indexes needed (text PK is already indexed)

-- ============================================================
-- MODEL
-- ============================================================
CREATE INDEX IF NOT EXISTS "model_provider_id_idx" ON "model" ("provider_id");
CREATE INDEX IF NOT EXISTS "model_type_idx" ON "model" ("type");

-- ============================================================
-- MEDIA_ASSET
-- ============================================================
CREATE INDEX IF NOT EXISTS "media_asset_org_id_idx" ON "media_asset" ("org_id");
CREATE INDEX IF NOT EXISTS "media_asset_generation_job_id_idx" ON "media_asset" ("generation_job_id");
CREATE INDEX IF NOT EXISTS "media_asset_provider_id_idx" ON "media_asset" ("provider_id");
CREATE INDEX IF NOT EXISTS "media_asset_model_id_idx" ON "media_asset" ("model_id");
CREATE INDEX IF NOT EXISTS "media_asset_origin_type_idx" ON "media_asset" ("origin_type");
CREATE INDEX IF NOT EXISTS "media_asset_asset_type_idx" ON "media_asset" ("asset_type");
CREATE INDEX IF NOT EXISTS "media_asset_file_hash_idx" ON "media_asset" ("file_hash") WHERE "file_hash" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "media_asset_quality_score_idx" ON "media_asset" ("quality_score") WHERE "quality_score" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "media_asset_org_asset_type_idx" ON "media_asset" ("org_id", "asset_type");
CREATE INDEX IF NOT EXISTS "media_asset_org_created_at_idx" ON "media_asset" ("org_id", "created_at" DESC);

-- HNSW index for semantic search (embedding)
CREATE INDEX IF NOT EXISTS "media_asset_embedding_idx" ON "media_asset"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- HNSW index for visual similarity (visual_embedding)
CREATE INDEX IF NOT EXISTS "media_asset_visual_embedding_idx" ON "media_asset"
  USING hnsw ("visual_embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================
-- TAG
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS "tag_slug_idx" ON "tag" ("slug");
CREATE INDEX IF NOT EXISTS "tag_parent_id_idx" ON "tag" ("parent_id");
CREATE INDEX IF NOT EXISTS "tag_type_idx" ON "tag" ("type");
CREATE INDEX IF NOT EXISTS "tag_usage_count_idx" ON "tag" ("usage_count" DESC);

-- HNSW index for tag similarity
CREATE INDEX IF NOT EXISTS "tag_embedding_idx" ON "tag"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================
-- ASSET_TAG
-- ============================================================
-- Composite PK already creates index on (asset_id, tag_id)
CREATE INDEX IF NOT EXISTS "asset_tag_tag_id_idx" ON "asset_tag" ("tag_id");
CREATE INDEX IF NOT EXISTS "asset_tag_source_idx" ON "asset_tag" ("source");

-- ============================================================
-- CONTENT_TYPE
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS "content_type_slug_idx" ON "content_type" ("slug");

-- ============================================================
-- CONTENT_COMPOSITION
-- ============================================================
CREATE INDEX IF NOT EXISTS "content_composition_content_type_id_idx" ON "content_composition" ("content_type_id");
CREATE INDEX IF NOT EXISTS "content_composition_org_id_idx" ON "content_composition" ("org_id");
CREATE INDEX IF NOT EXISTS "content_composition_is_complete_idx" ON "content_composition" ("is_complete") WHERE "is_complete" = true;

-- ============================================================
-- LIBRARY_CONTENT
-- ============================================================
CREATE INDEX IF NOT EXISTS "library_content_org_id_idx" ON "library_content" ("org_id");
CREATE INDEX IF NOT EXISTS "library_content_content_type_id_idx" ON "library_content" ("content_type_id");
CREATE INDEX IF NOT EXISTS "library_content_composition_id_idx" ON "library_content" ("composition_id");
CREATE INDEX IF NOT EXISTS "library_content_campaign_id_idx" ON "library_content" ("campaign_id");
CREATE INDEX IF NOT EXISTS "library_content_status_idx" ON "library_content" ("status");
CREATE INDEX IF NOT EXISTS "library_content_org_status_idx" ON "library_content" ("org_id", "status");
CREATE INDEX IF NOT EXISTS "library_content_org_content_type_idx" ON "library_content" ("org_id", "content_type_id");
CREATE INDEX IF NOT EXISTS "library_content_quality_score_idx" ON "library_content" ("quality_score") WHERE "quality_score" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "library_content_scheduled_for_idx" ON "library_content" ("scheduled_for") WHERE "scheduled_for" IS NOT NULL;

-- ============================================================
-- GENERATION_JOB
-- ============================================================
CREATE INDEX IF NOT EXISTS "generation_job_org_id_idx" ON "generation_job" ("org_id");
CREATE INDEX IF NOT EXISTS "generation_job_provider_id_idx" ON "generation_job" ("provider_id");
CREATE INDEX IF NOT EXISTS "generation_job_model_id_idx" ON "generation_job" ("model_id");
CREATE INDEX IF NOT EXISTS "generation_job_status_idx" ON "generation_job" ("status");
CREATE INDEX IF NOT EXISTS "generation_job_org_created_at_idx" ON "generation_job" ("org_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "generation_job_status_updated_at_idx" ON "generation_job" ("status", "updated_at");
CREATE INDEX IF NOT EXISTS "generation_job_media_asset_id_idx" ON "generation_job" ("media_asset_id");

-- Partial index: webhook lookup by external job ID
CREATE UNIQUE INDEX IF NOT EXISTS "generation_job_external_job_id_idx" ON "generation_job" ("external_job_id")
  WHERE "external_job_id" IS NOT NULL;

-- ============================================================
-- ASSET_USAGE
-- ============================================================
CREATE INDEX IF NOT EXISTS "asset_usage_asset_id_idx" ON "asset_usage" ("asset_id");
CREATE INDEX IF NOT EXISTS "asset_usage_org_id_idx" ON "asset_usage" ("org_id");
CREATE INDEX IF NOT EXISTS "asset_usage_content_id_idx" ON "asset_usage" ("content_id");
CREATE INDEX IF NOT EXISTS "asset_usage_composition_id_idx" ON "asset_usage" ("composition_id");
CREATE INDEX IF NOT EXISTS "asset_usage_campaign_id_idx" ON "asset_usage" ("campaign_id");
CREATE INDEX IF NOT EXISTS "asset_usage_usage_type_idx" ON "asset_usage" ("usage_type");
```

---

## D. Foreign Keys

```sql
-- ============================================================
-- MODEL → PROVIDER
-- ============================================================
DO $$ BEGIN
  ALTER TABLE "model" ADD CONSTRAINT "model_provider_id_provider_id_fk"
    FOREIGN KEY ("provider_id") REFERENCES "provider"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- MEDIA_ASSET → ORGANIZATION
-- ============================================================
DO $$ BEGIN
  ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_org_id_organization_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- MEDIA_ASSET → GENERATION_JOB
-- ============================================================
DO $$ BEGIN
  ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_generation_job_id_generation_job_id_fk"
    FOREIGN KEY ("generation_job_id") REFERENCES "generation_job"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- MEDIA_ASSET → PROVIDER
-- ============================================================
DO $$ BEGIN
  ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_provider_id_provider_id_fk"
    FOREIGN KEY ("provider_id") REFERENCES "provider"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- MEDIA_ASSET → MODEL
-- ============================================================
DO $$ BEGIN
  ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_model_id_model_id_fk"
    FOREIGN KEY ("model_id") REFERENCES "model"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- TAG → TAG (self-referential)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE "tag" ADD CONSTRAINT "tag_parent_id_tag_id_fk"
    FOREIGN KEY ("parent_id") REFERENCES "tag"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- ASSET_TAG → MEDIA_ASSET
-- ============================================================
DO $$ BEGIN
  ALTER TABLE "asset_tag" ADD CONSTRAINT "asset_tag_asset_id_media_asset_id_fk"
    FOREIGN KEY ("asset_id") REFERENCES "media_asset"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- ASSET_TAG → TAG
-- ============================================================
DO $$ BEGIN
  ALTER TABLE "asset_tag" ADD CONSTRAINT "asset_tag_tag_id_tag_id_fk"
    FOREIGN KEY ("tag_id") REFERENCES "tag"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- CONTENT_COMPOSITION → CONTENT_TYPE
-- ============================================================
DO $$ BEGIN
  ALTER TABLE "content_composition" ADD CONSTRAINT "content_composition_content_type_id_content_type_id_fk"
    FOREIGN KEY ("content_type_id") REFERENCES "content_type"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- CONTENT_COMPOSITION → ORGANIZATION
-- ============================================================
DO $$ BEGIN
  ALTER TABLE "content_composition" ADD CONSTRAINT "content_composition_org_id_organization_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- LIBRARY_CONTENT → ORGANIZATION
-- ============================================================
DO $$ BEGIN
  ALTER TABLE "library_content" ADD CONSTRAINT "library_content_org_id_organization_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- LIBRARY_CONTENT → CONTENT_TYPE
-- ============================================================
DO $$ BEGIN
  ALTER TABLE "library_content" ADD CONSTRAINT "library_content_content_type_id_content_type_id_fk"
    FOREIGN KEY ("content_type_id") REFERENCES "content_type"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- LIBRARY_CONTENT → CONTENT_COMPOSITION
-- ============================================================
DO $$ BEGIN
  ALTER TABLE "library_content" ADD CONSTRAINT "library_content_composition_id_content_composition_id_fk"
    FOREIGN KEY ("composition_id") REFERENCES "content_composition"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- LIBRARY_CONTENT → CAMPAIGN
-- ============================================================
DO $$ BEGIN
  ALTER TABLE "library_content" ADD CONSTRAINT "library_content_campaign_id_campaign_id_fk"
    FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- GENERATION_JOB → ORGANIZATION
-- ============================================================
DO $$ BEGIN
  ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_org_id_organization_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- GENERATION_JOB → PROVIDER
-- ============================================================
DO $$ BEGIN
  ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_provider_id_provider_id_fk"
    FOREIGN KEY ("provider_id") REFERENCES "provider"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- GENERATION_JOB → MODEL
-- ============================================================
DO $$ BEGIN
  ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_model_id_model_id_fk"
    FOREIGN KEY ("model_id") REFERENCES "model"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- GENERATION_JOB → MEDIA_ASSET
-- ============================================================
DO $$ BEGIN
  ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_media_asset_id_media_asset_id_fk"
    FOREIGN KEY ("media_asset_id") REFERENCES "media_asset"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- ASSET_USAGE → MEDIA_ASSET
-- ============================================================
DO $$ BEGIN
  ALTER TABLE "asset_usage" ADD CONSTRAINT "asset_usage_asset_id_media_asset_id_fk"
    FOREIGN KEY ("asset_id") REFERENCES "media_asset"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- ASSET_USAGE → ORGANIZATION
-- ============================================================
DO $$ BEGIN
  ALTER TABLE "asset_usage" ADD CONSTRAINT "asset_usage_org_id_organization_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- ASSET_USAGE → LIBRARY_CONTENT
-- ============================================================
DO $$ BEGIN
  ALTER TABLE "asset_usage" ADD CONSTRAINT "asset_usage_content_id_library_content_id_fk"
    FOREIGN KEY ("content_id") REFERENCES "library_content"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- ASSET_USAGE → CONTENT_COMPOSITION
-- ============================================================
DO $$ BEGIN
  ALTER TABLE "asset_usage" ADD CONSTRAINT "asset_usage_composition_id_content_composition_id_fk"
    FOREIGN KEY ("composition_id") REFERENCES "content_composition"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- ASSET_USAGE → CAMPAIGN
-- ============================================================
DO $$ BEGIN
  ALTER TABLE "asset_usage" ADD CONSTRAINT "asset_usage_campaign_id_campaign_id_fk"
    FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
```

---

## E. Uniqueness Constraints

| Table | Constraint | Type | Condition |
|---|---|---|---|
| `tag.slug` | `tag_slug_idx` | UNIQUE INDEX | — |
| `content_type.slug` | `content_type_slug_idx` | UNIQUE INDEX | — |
| `generation_job.external_job_id` | `generation_job_external_job_id_idx` | UNIQUE INDEX (partial) | `WHERE "external_job_id" IS NOT NULL` |
| `asset_tag.(asset_id, tag_id)` | Composite PK | PRIMARY KEY | — |

---

## F. Enums (TypeScript — stored as text)

```typescript
// Provider type
type ProviderType = 'media_generation' | 'text_generation' | 'audio_generation';

// Model type
type ModelType = 'image' | 'video' | 'audio' | 'text' | 'image-edit' | 'video-lipsync';

// Asset origin
type OriginType = 'ai_generated' | 'ai_enhanced' | 'user_uploaded' | 'imported' | 'system_generated';

// Asset type
type AssetType = 'image' | 'video' | 'audio';

// Tag type
type TagType = 'person' | 'business' | 'industry' | 'intent' | 'visual' | 'style' | 'audience' | 'format' | 'emotion' | 'custom';

// Content status
type ContentStatus = 'draft' | 'pending_review' | 'approved' | 'scheduled' | 'rejected' | 'published';

// Generation job status
type GenerationJobStatus = 'planned' | 'queued' | 'submitted' | 'generating' | 'provider_complete' | 'downloading' | 'processing' | 'quality_check' | 'tagging' | 'ready' | 'failed' | 'rejected' | 'cancelled';

// Asset usage type
type UsageType = 'composition' | 'content' | 'campaign' | 'template';

// Tag source
type TagSource = 'manual' | 'ai_auto' | 'ai_suggested';

// Audio source
type AudioSource = 'native' | 'added' | 'background_music';
```

---

## G. JSONB Fields and Their Schemas

### `provider.config`
```json
{
  "env_var": "FAL_KEY",
  "base_url": "https://queue.fal.run",
  "webhook_secret_env": "FAL_WEBHOOK_SECRET",
  "features": ["image", "video", "lipsync"]
}
```

### `model.input_schema`
```json
{
  "prompt": { "type": "string", "required": true, "description": "Text prompt" },
  "image_url": { "type": "string", "required": false, "description": "Reference image for i2v" },
  "duration": { "type": "number", "required": false, "default": 5, "min": 3, "max": 15 },
  "aspect_ratio": { "type": "string", "required": false, "enum": ["9:16", "16:9", "1:1", "4:5"] }
}
```

### `model.capabilities`
```json
{
  "max_duration": 15,
  "max_resolution": "1080p",
  "supports_style": true,
  "supports_audio": true,
  "supports_image_input": true,
  "aspects": ["9:16", "1:1", "16:9", "4:5"],
  "durations": [5, 8, 10, 12, 15]
}
```

### `media_asset.generation_input`
```json
{
  "prompt": "Professional woman talking about productivity in modern office",
  "image_url": "https://...",
  "duration": 8,
  "aspect_ratio": "9:16",
  "seed": 42
}
```

### `media_asset.quality_flags`
```json
["no_audio", "too_short", "low_resolution", "nsfw", "corrupted", "duplicate", "silent_audio", "invalid_codec"]
```

### `media_asset.metadata`
```json
{
  "transcription": "Hello, let me talk about...",
  "scene_description": "Professional woman in modern office...",
  "subject_detection": { "primary": "woman", "secondary": ["laptop", "desk"] },
  "unsafe_content": { "score": 0.02, "labels": [] }
}
```

### `content_type.slot_schema`
```json
{
  "hook_video": { "type": "video", "required": true, "max_duration": 5 },
  "demo_video": { "type": "video", "required": false, "max_duration": 10 },
  "background": { "type": "image", "required": false },
  "text_overlay": { "type": "text", "required": true }
}
```

### `content_type.qualification_rules`
```json
{
  "min_duration": 3,
  "max_duration": 60,
  "min_resolution": "720p",
  "min_quality_score": 0.6,
  "require_audio": true,
  "require_non_silent_audio": true,
  "max_file_size_mb": 100
}
```

### `content_type.construction_rules`
```json
{
  "similarity_required": true,
  "diversity_required": true,
  "min_tag_overlap": 1,
  "max_visual_similarity": 0.85,
  "require_text_overlay": true,
  "require_caption": true
}
```

### `content_composition.slots`
```json
{
  "hook_video": {
    "asset_id": "uuid-of-media-asset",
    "start": 0,
    "end": 5,
    "trim": { "start": 0.5, "end": 5.5 }
  },
  "background_music": {
    "asset_id": "uuid-of-audio-asset",
    "volume": 0.3,
    "fade_in": 0.5,
    "fade_out": 1.0
  },
  "text_overlay": {
    "text": "10x Your Productivity",
    "position": "center",
    "font": "Inter",
    "size": "large",
    "color": "#FFFFFF",
    "shadow": true
  }
}
```

### `library_content.metadata`
```json
{
  "platform_specific": {
    "instagram": { "hashtags": ["#saas", "#b2b"], "location": "New York" },
    "tiktok": { "sound_id": "..." }
  },
  "enrichment": {
    "ai_suggested_caption": "...",
    "ai_suggested_hashtags": ["#saas", "#b2b"]
  },
  "engagement": {
    "views": 18421,
    "likes": 1291,
    "shares": 45,
    "comments": 23
  }
}
```

### `generation_job.input`
```json
{
  "prompt": "Professional woman talking about productivity in modern office, cinematic lighting",
  "image_url": "https://...",
  "duration": 8,
  "aspect_ratio": "9:16"
}
```

### `generation_job.output`
```json
{
  "url": "https://fal.media/...",
  "duration": 8.0,
  "width": 1080,
  "height": 1920,
  "has_audio": true
}
```

---

## H. pgvector Configuration

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- HNSW indexes (created in Section C)
-- media_asset.embedding: vector(1536) — text-embedding-3-small
-- media_asset.visual_embedding: vector(512) — CLIP
-- tag.embedding: vector(1536) — tag semantic similarity

-- HNSW parameters
-- m = 16 (connections per layer — balance between accuracy and speed)
-- ef_construction = 64 (build-time search width — higher = better index, slower build)
-- For 10K–100K vectors: m=16, ef_construction=64 is well-proven
-- Can be increased later if quality degrades at scale
```

---

## I. Migration Order

The migration must be applied in this exact order to respect foreign key dependencies:

```sql
-- Step 1: Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: provider (no FK dependencies)
CREATE TABLE IF NOT EXISTS "provider" (...);

-- Step 3: model (depends on provider)
CREATE TABLE IF NOT EXISTS "model" (...);
-- FK: model → provider

-- Step 4: generation_job (depends on provider, model)
CREATE TABLE IF NOT EXISTS "generation_job" (...);
-- FK: generation_job → organization, provider, model

-- Step 5: media_asset (depends on generation_job, provider, model)
CREATE TABLE IF NOT EXISTS "media_asset" (...);
-- FK: media_asset → organization, generation_job, provider, model

-- Step 6: tag (depends on tag — self-referential)
CREATE TABLE IF NOT EXISTS "tag" (...);
-- FK: tag → tag (parent)

-- Step 7: asset_tag (depends on media_asset, tag)
CREATE TABLE IF NOT EXISTS "asset_tag" (...);
-- FK: asset_tag → media_asset, tag

-- Step 8: content_type (no FK dependencies)
CREATE TABLE IF NOT EXISTS "content_type" (...);

-- Step 9: content_composition (depends on content_type, organization)
CREATE TABLE IF NOT EXISTS "content_composition" (...);
-- FK: content_composition → content_type, organization

-- Step 10: library_content (depends on content_type, content_composition, campaign, organization)
CREATE TABLE IF NOT EXISTS "library_content" (...);
-- FK: library_content → organization, content_type, content_composition, campaign

-- Step 11: asset_usage (depends on media_asset, library_content, content_composition, campaign, organization)
CREATE TABLE IF NOT EXISTS "asset_usage" (...);
-- FK: asset_usage → media_asset, library_content, content_composition, campaign, organization

-- Step 12: All indexes (after all tables created)
-- (see Section C)

-- Step 13: All foreign keys (after all tables created)
-- (see Section D — but Drizzle generates them inline with DO blocks)

-- Step 14: RLS policies (see Section M)
```

---

## J. Seed Data

### J.1 Providers

```sql
INSERT INTO "provider" ("id", "name", "type", "config", "is_active", "priority") VALUES
  ('fal', 'Fal.ai', 'media_generation', '{"env_var": "FAL_KEY", "base_url": "https://queue.fal.run", "webhook_secret_env": "FAL_KEY"}', true, 10),
  ('elevenlabs', 'ElevenLabs', 'audio_generation', '{"env_var": "ELEVENLABS_API_KEY", "base_url": "https://api.elevenlabs.io"}', true, 10),
  ('anthropic', 'Anthropic', 'text_generation', '{"env_var": "ANTHROPIC_API_KEY", "sdk": "@anthropic-ai/sdk"}', true, 10),
  ('deepseek', 'DeepSeek', 'text_generation', '{"env_var": "DEEPSEEK_API_KEY", "base_url": "https://api.deepseek.com"}', true, 5),
  ('openai', 'OpenAI', 'text_generation', '{"env_var": "OPENAI_API_KEY", "base_url": "https://api.openai.com"}', true, 3),
  ('nativpost-image-engine', 'NativPost Image Engine', 'media_generation', '{"env_var": "NATIVPOST_IMAGE_URL", "api_key_env": "NATIVPOST_ENGINE_API_KEY"}', true, 8),
  ('nativpost-video-engine', 'NativPost Video Engine', 'media_generation', '{"env_var": "NATIVPOST_VIDEO_URL", "api_key_env": "NATIVPOST_ENGINE_API_KEY"}', true, 8),
  ('unsplash', 'Unsplash', 'media_generation', '{"env_var": "UNSPLASH_ACCESS_KEY", "base_url": "https://api.unsplash.com"}', true, 2);
```

### J.2 Models (from existing `AI_STUDIO_MODELS`)

```sql
INSERT INTO "model" ("id", "provider_id", "name", "type", "cost_per_call", "capabilities", "is_active") VALUES
  -- Fal.ai image models
  ('flux-dev', 'fal', 'FLUX.1 [dev]', 'image', 0.025, '{"aspects": ["1:1", "9:16", "16:9", "4:5"]}', true),
  ('krea-2-turbo', 'fal', 'Krea 2 Turbo', 'image', 0.01, '{"aspects": ["1:1", "9:16", "16:9", "4:5"]}', true),
  ('krea-2-turbo-style', 'fal', 'Krea 2 Turbo (Style)', 'image', 0.012, '{"aspects": ["1:1", "9:16", "16:9", "4:5"], "requires_image": true}', true),
  ('gpt-image-2', 'fal', 'GPT Image 2', 'image', 0.15, '{"aspects": ["1:1", "9:16", "16:9"]}', true),
  ('gpt-image-2-edit', 'fal', 'GPT Image 2 Edit', 'image', 0.20, '{"aspects": ["1:1", "9:16", "16:9"], "requires_image": true}', true),

  -- Fal.ai video models
  ('pixverse-v6-i2v', 'fal', 'Pixverse V6', 'video', 0.50, '{"max_duration": 8, "aspects": ["9:16", "1:1", "16:9"], "requires_image": true}', true),
  ('kling-v3-turbo-pro-i2v', 'fal', 'Kling V3 Turbo Pro', 'video', 0.14, '{"max_duration": 15, "per_second": true, "aspects": ["9:16", "1:1", "16:9"], "requires_image": true}', true),
  ('happy-horse-i2v', 'fal', 'Happy Horse v1.1', 'video', 0.90, '{"max_duration": 15, "per_second": true, "aspects": ["9:16", "1:1", "16:9", "4:5"], "requires_image": true, "native_audio": true, "multilingual_lipsync": true}', true),
  ('kling-v3-pro-i2v', 'fal', 'Kling V3 Pro', 'video', 0.84, '{"max_duration": 15, "per_second": true, "aspects": ["9:16", "1:1", "16:9", "4:5"], "requires_image": true, "native_audio": true}', true),
  ('seedance-2-i2v', 'fal', 'Seedance 2.0 Pro', 'video', 1.51, '{"max_duration": 12, "aspects": ["9:16", "1:1", "16:9"], "requires_image": true}', true),

  -- Fal.ai lipsync
  ('veed-lipsync', 'fal', 'Veed Lipsync', 'video-lipsync', 0.30, '{"aspects": ["9:16", "1:1", "16:9"], "requires_image": true, "requires_audio": true}', true),

  -- ElevenLabs
  ('elevenlabs-tts', 'elevenlabs', 'ElevenLabs TTS', 'audio', 0.01, '{"max_chars": 5000, "voices": "library"}', true),

  -- LLM models
  ('claude-sonnet-4-6', 'anthropic', 'Claude Sonnet 4.6', 'text', 0.003, '{"max_tokens": 8192, "context_window": 200000}', true),
  ('claude-haiku-4-5', 'anthropic', 'Claude Haiku 4.5', 'text', 0.00025, '{"max_tokens": 8192, "context_window": 200000}', true),
  ('deepseek-chat', 'deepseek', 'DeepSeek Chat', 'text', 0.00014, '{"max_tokens": 8192, "context_window": 128000}', true),

  -- NativPost engines
  ('nativpost-puppeteer', 'nativpost-image-engine', 'Puppeteer Template Renderer', 'image', 0.001, '{"templates": ["quote-card", "announcement-card", "stat-card"]}', true),
  ('nativpost-flux-scene', 'nativpost-image-engine', 'FLUX Scene Generator', 'image', 0.025, '{"aspects": ["9:16", "16:9"]}', true),
  ('nativpost-video-render', 'nativpost-video-engine', 'Video Renderer', 'video', 0.01, '{"templates": ["slideshow", "ugc-ad", "data-story", "text-motion"]}', true);
```

### J.3 Content Types

```sql
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
   '{"default_aspect": "9:16", "supported_aspects": ["9:16"]}');
```

---

## K. Backward/Dependency Analysis

### K.1 Tables that depend on NEW tables

| Existing Table | New FK | Impact |
|---|---|---|
| `campaign` | — | No change (library_content references campaign, not vice versa) |
| `campaign_content` | — | Will eventually reference library_content instead of content_item |
| `publishing_queue` | — | Will eventually reference library_content instead of content_item |
| `ai_studio_job` | — | Will be replaced by generation_job (but not deleted in this migration) |

### K.2 Tables that NEW tables depend on

| New Table | Depends On | Status |
|---|---|---|
| `provider` | — | No dependencies |
| `model` | `provider` | Created after provider |
| `generation_job` | `organization`, `provider`, `model` | Created after all three |
| `media_asset` | `organization`, `generation_job`, `provider`, `model` | Created after all four |
| `tag` | `tag` (self) | Self-referential, no issue |
| `asset_tag` | `media_asset`, `tag` | Created after both |
| `content_type` | — | No dependencies |
| `content_composition` | `content_type`, `organization` | Created after both |
| `library_content` | `organization`, `content_type`, `content_composition`, `campaign` | Created after all four |
| `asset_usage` | `media_asset`, `library_content`, `content_composition`, `campaign`, `organization` | Created last |

### K.3 Coexistence with existing tables

**This migration is ADDITIVE ONLY.** It creates 10 new tables. It does NOT:
- Drop any existing tables
- Modify any existing columns
- Change any existing FKs
- Alter any existing indexes

The old `content_item`, `content_template`, `media_asset`, `ai_studio_job`, etc. remain untouched. They will be deprecated and eventually dropped in a future migration once all code paths have been migrated to the new tables.

**Existing code continues to work unchanged.** New code can begin using the new tables immediately.

---

## L. Rollback Strategy

### L.1 Forward rollback (if migration fails mid-way)

```sql
-- Drop in reverse dependency order
DROP TABLE IF EXISTS "asset_usage" CASCADE;
DROP TABLE IF EXISTS "library_content" CASCADE;
DROP TABLE IF EXISTS "content_composition" CASCADE;
DROP TABLE IF EXISTS "content_type" CASCADE;
DROP TABLE IF EXISTS "asset_tag" CASCADE;
DROP TABLE IF EXISTS "tag" CASCADE;
DROP TABLE IF EXISTS "media_asset" CASCADE;
DROP TABLE IF EXISTS "generation_job" CASCADE;
DROP TABLE IF EXISTS "model" CASCADE;
DROP TABLE IF EXISTS "provider" CASCADE;

-- pgvector extension can remain (used by future migrations)
-- DROP EXTENSION IF EXISTS "vector";
```

### L.2 Full rollback (if we need to revert completely)

The migration is idempotent (`CREATE TABLE IF NOT EXISTS`). If it fails partway, the remaining tables can be dropped manually using the SQL above.

### L.3 Data rollback

**No existing data is affected.** This migration creates new empty tables. There is nothing to rollback data-wise.

### L.4 Code rollback

**No existing code is modified.** If the new tables cause issues, simply stop using them. The old tables remain fully functional.

---

## M. RLS Policies (for new tables)

```sql
-- ============================================================
-- PROVIDER
-- ============================================================
ALTER TABLE "provider" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prov_service_role_all" ON "provider" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "prov_authenticated_select" ON "provider" FOR SELECT TO authenticated USING (true);

-- ============================================================
-- MODEL
-- ============================================================
ALTER TABLE "model" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mod_service_role_all" ON "model" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "mod_authenticated_select" ON "model" FOR SELECT TO authenticated USING (true);

-- ============================================================
-- GENERATION_JOB
-- ============================================================
ALTER TABLE "generation_job" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gj_service_role_all" ON "generation_job" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- MEDIA_ASSET
-- ============================================================
ALTER TABLE "media_asset" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ma_service_role_all" ON "media_asset" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- TAG
-- ============================================================
ALTER TABLE "tag" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tag_service_role_all" ON "tag" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "tag_authenticated_select" ON "tag" FOR SELECT TO authenticated USING (true);

-- ============================================================
-- ASSET_TAG
-- ============================================================
ALTER TABLE "asset_tag" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "at_service_role_all" ON "asset_tag" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- CONTENT_TYPE
-- ============================================================
ALTER TABLE "content_type" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ct_service_role_all" ON "content_type" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "ct_authenticated_select" ON "content_type" FOR SELECT TO authenticated USING (true);

-- ============================================================
-- CONTENT_COMPOSITION
-- ============================================================
ALTER TABLE "content_composition" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cc_service_role_all" ON "content_composition" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- LIBRARY_CONTENT
-- ============================================================
ALTER TABLE "library_content" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lc_service_role_all" ON "library_content" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- ASSET_USAGE
-- ============================================================
ALTER TABLE "asset_usage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "au_service_role_all" ON "asset_usage" FOR ALL TO service_role USING (true) WITH CHECK (true);
```

---

## N. Invariants (Database-Level Enforcement)

### N.1 Video must be AI-generated for library eligibility

This is enforced at the application layer (quality gate), not DB constraint, because:
- `media_asset.generation_job_id` is nullable (uploads don't have it)
- DB-level CHECK constraints can't reference other tables
- The quality gate runs before `library_content` creation

**Application invariant:**
```typescript
// Before creating library_content with a video asset:
if (asset.assetType === 'video' && asset.originType !== 'ai_generated') {
  throw new Error('Video must be AI-generated to enter the library');
}
if (asset.assetType === 'video' && !asset.hasAudio) {
  throw new Error('Video must have audio to enter the library');
}
```

### N.2 Audio required for all video

**Application invariant:**
```typescript
// Quality gate checks:
if (asset.assetType === 'video') {
  if (!asset.hasAudio) qualityFlags.push('no_audio');
  if (asset.audioIsSilent) qualityFlags.push('silent_audio');
  if (asset.audioDurationMs && asset.audioDurationMs < 1000) qualityFlags.push('audio_too_short');
}
```

### N.3 Content type consistency

**DB-level:** `content_composition.content_type_id` has `ON DELETE RESTRICT` — can't delete a content type that has compositions.

**Application invariant:**
```typescript
// When filling slots:
const contentType = await getContentType(composition.contentTypeId);
const slotCount = Object.keys(composition.slots).length;
if (slotCount < contentType.minAssets || slotCount > contentType.maxAssets) {
  throw new Error(`Content type requires ${contentType.minAssets}-${contentType.maxAssets} assets`);
}
```

### N.4 Generation job → media asset link

**DB-level:** `generation_job.media_asset_id` FK to `media_asset.id` with `ON DELETE SET NULL`.

**Application invariant:** On generation success, the reconcile function must:
1. Create `media_asset` row
2. Update `generation_job.media_asset_id` to link them
3. Never create a `library_content` with a video that has no `generation_job_id`

---

## O. What This Migration Does NOT Do

1. **Does NOT drop any existing tables** — old content_item, content_template, etc. remain
2. **Does NOT modify any existing columns** — purely additive
3. **Does NOT change any existing code paths** — old API routes continue working
4. **Does NOT create any API routes** — those come in Phase 2+
5. **Does NOT create any UI** — that comes in Phase 8
6. **Does NOT enable pgvector usage** — that comes in Phase 5 (embedding generation)
7. **Does NOT implement quality gates** — that comes in Phase 4
8. **Does NOT implement the construction engine** — that comes in Phase 6
9. **Does NOT seed the tag taxonomy** — that comes in Phase 5
10. **Does NOT implement deduplication** — that comes in Phase 7

---

## P. Acceptance Criteria for Phase 1

Before marking Phase 1 complete, verify:

- [ ] Migration applies cleanly on fresh database
- [ ] Migration applies cleanly on existing database (with 53 existing tables)
- [ ] All 10 new tables created with correct schemas
- [ ] All foreign keys created and valid
- [ ] All indexes created (B-tree + HNSW)
- [ ] pgvector extension enabled
- [ ] RLS policies applied on all new tables
- [ ] Seed data inserted (providers, models, content types)
- [ ] Drizzle schema file updated with new table definitions
- [ ] `drizzle-kit generate` produces clean migration
- [ ] No existing tests broken
- [ ] Rollback SQL works cleanly
- [ ] No existing API routes affected
