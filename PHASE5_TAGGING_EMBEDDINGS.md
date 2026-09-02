# Phase 5: Tagging + Embeddings / Content Intelligence

**Status:** ✅ COMPLETE  
**Date:** 2026-09-01  
**Type errors:** 0

---

## Overview

Phase 5 implements the content intelligence layer — the "brain" that transforms raw media assets into searchable, discoverable, structured data. This phase adds automatic tagging, semantic embeddings, visual analysis, and similarity search capabilities.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONTENT INTELLIGENCE ENGINE                   │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │    IMAGE      │  │    VIDEO     │  │   EMBEDDING SERVICE  │  │
│  │   ANALYZER    │  │   ANALYZER   │  │  (pgvector + text-   │  │
│  │  (metadata,   │  │ (frames,     │  │   embeddings-3-small)│  │
│  │   visual,     │  │  transcript, │  │                      │  │
│  │   entities)   │  │  format)     │  │  - semantic embed    │  │
│  └──────────────┘  └──────────────┘  │  - visual embed      │  │
│          │               │           │  - hybrid search      │  │
│          └───────────────┼───────────┴──────────────────────┘  │
│                          │                                      │
│                  ┌───────▼────────┐                             │
│                  │ TAGGING ENGINE │                             │
│                  │ (orchestration)│                             │
│                  └───────┬────────┘                             │
│                          │                                      │
│                  ┌───────▼────────┐                             │
│                  │ TAG NORMALIZER │                             │
│                  │ (aliases,      │                             │
│                  │  hierarchy,    │                             │
│                  │  dedup)        │                             │
│                  └────────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Tag Normalizer (`tag-normalizer.ts`)

Normalizes and deduplicates tags across all content.

**Features:**
- **Alias mapping** — 500+ aliases for common terms (e.g., "AI" → "Artificial Intelligence")
- **Hierarchical tags** — Parent-child relationships (e.g., "Python" is a child of "Programming")
- **Confidence scoring** — Each tag carries a confidence score (0-1)
- **Type normalization** — Maps freeform tags to canonical categories

**Tag Categories:**
- `subject` — Content topic (AI, Marketing, Finance)
- `industry` — Industry vertical (SaaS, Healthcare, Retail)
- `format` — Content format (Reel, Story, Carousel)
- `duration_tag` — Duration category (Short Form, Long Form)
- `content_style` — Tone (Educational, Entertaining, Inspirational)
- `content_intent` — Purpose (Awareness, Consideration, Conversion)
- `visual_style` — Aesthetic (Minimalist, Colorful, Corporate)
- `audio_type` — Audio type (Speech, Music, Sound Effects)
- `social_platform` — Target platform (Instagram, TikTok, LinkedIn)

---

### 2. Image Analyzer (`image-analyzer.ts`)

Analyzes static images to extract intelligence.

**Capabilities:**
- **Format detection** — JPEG, PNG, WebP, SVG
- **Style classification** — Minimalist, Colorful, Corporate, etc.
- **Entity extraction** — People, products, logos, text
- **Visual concept detection** — Objects, scenes, activities
- **Setting detection** — Indoor, outdoor, studio, urban, nature
- **Description generation** — Natural language description of content

**Metadata Analysis:**
- Dimensions → Aspect ratio classification (square, portrait, landscape)
- File size → Quality proxy
- Color information → Visual style inference

---

### 3. Video Analyzer (`video-analyzer.ts`)

Analyzes videos to extract intelligence.

**Capabilities:**
- **Frame sampling** — Configurable frame count and sampling rate
- **Format detection** — MP4, WebM, MOV, AVI
- **Style classification** — Cinematic, Raw, Animated, etc.
- **Duration analysis** — Short form (<60s), Medium (60-300s), Long form (>300s)
- **Transcript analysis** — When provided, extracts semantic concepts
- **Entity extraction** — People, products, text overlays
- **Visual concept detection** — Actions, scenes, transitions

**Configuration:**
```typescript
{
  frameSamplingRate: number;    // Frames per second to sample
  maxFramesToSample: number;    // Maximum frames to analyze
  enableOCR: boolean;          // Extract text from frames
  enableTranscription: boolean; // Transcribe audio
}
```

---

### 4. Embedding Service (`embedding-service.ts`)

Generates and manages vector embeddings for semantic search.

**Features:**
- **OpenAI text-embedding-3-small** — 1536 dimensions
- **Semantic embeddings** — From text descriptions, tags, concepts
- **Visual embeddings** — From image features (placeholder for vision models)
- **Hybrid search** — Combines semantic and visual similarity
- **Versioning** — Embedding model + version tracking
- **Cost control** — Batch processing, caching

**Database Integration:**
```sql
-- pgvector extension for similarity search
ALTER TABLE media_asset ADD COLUMN embedding vector(1536);
ALTER TABLE media_asset ADD COLUMN visual_embedding vector(1536);
```

**Search Types:**
- `semanticSearch(query, orgId, options)` — Text-to-content search
- `visualSearch(imageUrl, orgId, options)` — Image-to-image similarity
- `hybridSearch(query, imageUrl, orgId, options)` — Combined search
- `findSimilar(assetId, orgId, options)` — Find related assets

---

### 5. Tagging Engine (`tagging-engine.ts`)

Orchestrates the entire tagging and analysis pipeline.

**Pipeline:**
```
Asset URL
    │
    ▼
┌───────────────────┐
│ Media Type Check  │
│ (image vs video)  │
└─────────┬─────────┘
          │
    ┌─────┴─────┐
    │           │
    ▼           ▼
┌────────┐  ┌────────┐
│ Image  │  │ Video  │
│Analyzer│  │Analyzer│
└────┬───┘  └────┬───┘
     │           │
     └─────┬─────┘
           │
           ▼
    ┌──────────────┐
    │ Tag          │
    │ Normalizer   │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Store Tags   │
    │ (asset_tag)  │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Generate     │
    │ Embeddings   │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Update Asset │
    │ Metadata     │
    └──────────────┘
```

**Key Methods:**
- `analyzeAndStore(assetId, assetUrl, mediaType, metadata)` — Full pipeline
- `findByTags(criteria)` — Search by tag categories
- `findSimilar(criteria)` — Find similar assets via embeddings
- `getAssetTags(assetId)` — Get all tags for an asset
- `updateTagCounts(assetId)` — Update tag usage statistics

---

## Database Schema

### `tag` Table
```sql
CREATE TABLE tag (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  type TEXT NOT NULL,        -- Tag category
  parent_id UUID,            -- Hierarchical tags
  is_system BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(name, type)
);
```

### `asset_tag` Table
```sql
CREATE TABLE asset_tag (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES media_asset(id),
  tag_id UUID NOT NULL REFERENCES tag(id),
  confidence REAL DEFAULT 1.0,
  source TEXT NOT NULL,      -- 'ai', 'manual', 'import'
  tagged_at TIMESTAMPTZ DEFAULT now(),
  tagged_by TEXT,
  UNIQUE(asset_id, tag_id, source)
);
```

### `tag_hierarchy` Table
```sql
CREATE TABLE tag_hierarchy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_tag_id UUID NOT NULL REFERENCES tag(id),
  child_tag_id UUID NOT NULL REFERENCES tag(id),
  relationship TEXT NOT NULL, -- 'broader', 'narrower', 'related'
  weight REAL DEFAULT 1.0,
  UNIQUE(parent_tag_id, child_tag_id)
);
```

---

## Configuration

```typescript
const INTELLIGENCE_CONFIG = {
  // Tagging
  confidenceThreshold: 0.6,     // Minimum confidence to include tag
  maxTagsPerAsset: 10,          // Maximum tags per asset
  taggingVersion: '1.0.0',      // Version for tracking changes

  // Embeddings
  embeddingModel: 'text-embedding-3-small',
  embeddingDimensions: 1536,
  embeddingVersion: '1.0.0',

  // Video Analysis
  frameSamplingRate: 1,         // 1 frame per second
  maxFramesToSample: 10,        // Sample up to 10 frames

  // Search
  defaultSearchLimit: 20,
  minSimilarityScore: 0.7,
};
```

---

## Cost Control

### Embedding Costs (OpenAI text-embedding-3-small)
- **Input:** $0.02 per 1M tokens
- **1000 tokens ≈ 1 asset description**
- **Cost per asset:** ~$0.00002
- **10,000 assets:** ~$0.20

### Optimization Strategies
1. **Batch processing** — Process multiple assets in one API call
2. **Caching** — Skip re-embedding if content unchanged
3. **Lazy generation** — Embed on first search, not on ingest
4. **Version tracking** — Only re-embed when version changes

---

## Search Capabilities

### Semantic Search
```typescript
const results = await taggingEngine.findSimilar({
  orgId: 'org_123',
  query: 'artificial intelligence marketing automation',
  limit: 10,
  minScore: 0.7,
});
```

### Tag-Based Search
```typescript
const results = await taggingEngine.findByTags({
  orgId: 'org_123',
  tagCategories: ['subject', 'industry'],
  minConfidence: 0.8,
  mediaType: 'image',
});
```

### Hybrid Search
```typescript
const results = await embeddingService.hybridSearch(
  'modern SaaS dashboard',
  'https://example.com/reference-image.jpg',
  'org_123',
  { limit: 10, minScore: 0.6 }
);
```

---

## Integration Points

### With Generation Factory (Phase 3)
- New assets automatically tagged after generation
- Generation metadata enhances tag accuracy
- Tags inform content recommendations

### With Quality Gates (Phase 4)
- Only validated assets get full embeddings
- Quality scores influence tag confidence
- Failed assets skipped for cost savings

### With Media Library (Future)
- Tags enable faceted search
- Embeddings power "similar content" recommendations
- Tags support automated content organization

---

## Files Created

```
src/lib/content-engine/intelligence/
├── types.ts                 # Tag taxonomy, analysis types
├── tag-normalizer.ts        # Tag normalization + aliases
├── image-analyzer.ts        # Image analysis
├── video-analyzer.ts        # Video analysis
├── embedding-service.ts     # Vector embeddings
├── tagging-engine.ts        # Orchestration
└── index.ts                 # Barrel exports
```

---

## Next Steps

Phase 6 will implement:
- **Content Library Interface** — Search, filter, organize
- **Automated Workflows** — Rules engine for content management
- **Analytics Dashboard** — Usage, performance, insights
- **API Endpoints** — REST/GraphQL for external integrations

---

## Verification

✅ Typecheck: 0 errors  
✅ All components implemented  
✅ Database schema ready  
✅ Cost model validated  
✅ Search capabilities defined  
