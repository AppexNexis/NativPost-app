# Phase 6: Content Qualification + Construction Engine

**Status:** ✅ COMPLETE  
**Date:** 2026-09-01  
**Type errors:** 0

---

## Overview

Phase 6 transforms validated, tagged MediaAssets into actual LibraryContent. This is the core engine that defines what NativPost manages — the UI is downstream.

### The Critical Distinction

```
MediaAsset ≠ LibraryContent
```

**MediaAsset:**
> "Here is a generated piece of media."

**LibraryContent:**
> "Here is a complete, usable piece of social content that NativPost can recommend/publish."

---

## Architecture

```
MEDIA ASSETS (from Phase 4/5)
      ↓
┌─────────────────────┐
│  CONTENT TYPE       │
│  QUALIFICATION      │ ← "Does this asset qualify?"
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  ELIGIBLE ASSET     │
│  POOL               │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  CONSTRUCTION       │
│  PLANNER            │ ← "How do we combine these?"
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  CONTENT            │
│  COMPOSITION        │ ← "What's the blueprint?"
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  COMPOSITION        │
│  QUALITY            │ ← "Is this good enough?"
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  LIBRARY CONTENT    │ ← Ready for the library
└─────────────────────┘
```

---

## Content Types (Seeded in DB)

| ID | Name | Assets | Video | Audio | Text Overlay | Caption |
|----|------|--------|-------|-------|--------------|---------|
| `single_image` | Single Image | 1 | No | Yes | No | Yes |
| `slideshow` | Slideshow | 3-5 | No | Yes | Yes | Yes |
| `reel` | Reel | 1 | Yes | Yes | Yes | Yes |
| `ugc` | UGC | 1 | Yes | Yes | Yes | Yes |
| `wall_of_text` | Wall of Text | 1 | No | Yes | Yes | Yes |
| `talking_head` | Talking Head | 1 | Yes | Yes | Yes | Yes |
| `green_screen` | Green Screen | 1 | Yes | Yes | Yes | Yes |

Each content type has:
- **slot_schema** — Defines what assets/slots are needed
- **qualification_rules** — Rules for qualifying assets
- **construction_rules** — Rules for combining assets
- **render_config** — Configuration for rendering

---

## Components

### 1. Content Qualification Engine (`qualification-engine.ts`)

Determines whether an asset qualifies for a content type.

**Key Principle:** "Asset has tags" ≠ "Asset qualifies for content type"

A talking-head video may have `person` + `fitness` tags but not actually be a talking-head video. Qualification examines the underlying media.

```typescript
const result = await qualificationEngine.qualify(
  assetId,
  'talking_head',
  qualificationRules,
  slotSchema,
);

// result:
// {
//   eligible: true,
//   score: 0.85,
//   hardFailures: [],
//   warnings: [],
//   matchedRules: ['has_audio', 'duration in range', 'face detected'],
//   missingRequirements: [],
//   reasoning: 'Asset matches talking-head requirements',
//   qualificationVersion: '1.0.0'
// }
```

**Checks performed:**
- Slot type compatibility (image/video/audio)
- Quality score threshold
- Duration range
- Audio presence and non-silence
- Face/person detection (for talking-head, UGC)
- Aspect ratio compatibility
- Required/excluded tags
- File size

---

### 2. Slideshow Matcher (`slideshow-matcher.ts`)

Handles compatibility scoring and sequencing for slideshow content.

**Constraints:**
- MINIMUM: 3 assets
- MAXIMUM: 5 assets
- Never construct 2-slide content

**Compatibility Scoring:**
```typescript
const compatibility = slideshowMatcher.scoreCompatibility(assets);

// Scored dimensions:
// - Tag overlap (shared tags across all assets)
// - Style compatibility (visual quality consistency)
// - Subject compatibility (semantic tag overlap)
// - Visual similarity (embedding cosine similarity — placeholder)
```

**Sequencing Strategy (attention-first):**
```
Slide 1: attention / strongest visual
Slide 2: supporting context
Slide 3: supporting idea
Slide 4: optional expansion
Slide 5: optional conclusion
```

---

### 3. Text Generator (`text-generator.ts`)

Generates text overlays and captions for content.

**Rules:**
- Text must correspond to actual visual content
- Do not generate unrelated copy
- Use asset intelligence + slide role + overall concept

**Slide Roles:**
- `attention` — Hook text (Slide 1)
- `context` — Supporting context (Slide 2)
- `expansion` — Expanding on idea (Slide 3)
- `reinforcement` — Key takeaway (Slide 4)
- `conclusion` — CTA / save prompt (Slide 5)

---

### 4. Audio Selector (`audio-selector.ts`)

Selects background audio for compositions.

**Principles:**
- Audio should be reusable across compositions
- Do not generate music unnecessarily for every asset
- Prefer library audio over generated

**Volume by Content Type:**
- Talking Head/UGC: 0.2 (low, behind speech)
- Reel: 0.4
- Slideshow/Single Image: 0.6

---

### 5. Composition Quality (`composition-quality.ts`)

Post-construction quality evaluation.

**Successful construction ≠ good content.**

**Quality Dimensions:**
- Visual coherence
- Text placement
- Text readability
- Asset compatibility (for slideshows)
- Audio quality
- Duration fit
- Aspect ratio fit
- Content completeness

---

### 6. Construction Engine (`construction-engine.ts`)

Orchestrates the entire pipeline.

```typescript
const composition = await constructionEngine.construct(
  ['asset-1', 'asset-2', 'asset-3'],
  'slideshow',
  'org_123',
  'My Slideshow',
);
```

**Specialized slideshow construction:**
```typescript
const slideshow = await constructionEngine.constructSlideshow(
  ['image-1', 'image-2', 'image-3', 'image-4', 'image-5'],
  'org_123',
  'Fitness Tips',
);
```

---

## Provenance Chain

Every LibraryContent preserves full traceability:

```
LibraryContent
    ↓
Composition
    ↓
MediaAssets
    ↓
GenerationAttempts
    ↓
GenerationJob
    ↓
Provider
    ↓
Model
```

This provenance chain is part of NativPost's data moat.

---

## Construction Versioning

Every composition contains `construction_version`.

If construction logic changes later, new content can be generated with a new version. This makes debugging and regeneration possible.

---

## Failed Constructions

Failures are stored with:
- Failure reason
- Content type
- Asset IDs
- Construction version
- Timestamp

This data helps determine:
- Which assets fail most often
- Which tags produce poor combinations
- Which models produce unusable media
- Which content types are difficult to construct

---

## Files Created

```
src/lib/content-engine/construction/
├── types.ts                    # Qualification rules, construction rules, slot schema
├── qualification-engine.ts     # ContentQualificationEngine
├── construction-engine.ts      # ConstructionEngine orchestration
├── slideshow-matcher.ts        # Slideshow compatibility + sequencing
├── text-generator.ts           # Text overlay generation
├── audio-selector.ts           # Background audio selection
├── composition-quality.ts      # Post-construction quality gate
└── index.ts                    # Barrel exports
```

---

## Pipeline Summary

```
Generate → Validate → Understand → Qualify → Construct → Evaluate → Index → Learn → Generate again
```

```
                 ┌──────────────────────┐
                 │   CONTENT INVENTORY   │
                 └──────────┬───────────┘
                            │
                            ▼
                    What are we missing?
                            │
                            ▼
                    GENERATION FACTORY
                            │
                            ▼
                       VALIDATION
                            │
                            ▼
                        TAGGING
                            │
                            ▼
                      CONSTRUCTION  ← YOU ARE HERE
                            │
                            ▼
                    QUALITY EVALUATION
                            │
                            ▼
                     CONTENT LIBRARY
                            │
                            └───────────────┐
                                            │
                                            ▼
                                  INVENTORY INTELLIGENCE
                                            │
                                            └──────► GENERATION
```

---

## Next Steps

Phase 7 will implement:
- **Deduplication** — Prevent duplicate content
- **Diversity** — Ensure content variety
- **Inventory Intelligence** — What content is missing?

---

## Verification

✅ Typecheck: 0 errors  
✅ All components implemented  
✅ 7 content types configured  
✅ Qualification rules defined  
✅ Slideshow compatibility scoring  
✅ Text generation by slide role  
✅ Audio selection by content type  
✅ Composition quality evaluation  
✅ Provenance chain preserved  
✅ Construction versioning  
✅ Failed constructions tracked  
