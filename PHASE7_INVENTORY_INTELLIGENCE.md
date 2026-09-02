# Phase 7: Deduplication + Diversity + Inventory Intelligence

**Status:** ✅ COMPLETE  
**Date:** 2026-09-01  
**Type errors:** 0

---

## Overview

Phase 7 is the intelligence layer that transforms NativPost from a Content Library into a **Content Operating System**. It determines:

- What content do we have?
- What content do we lack?
- What should we generate next?
- What combinations perform best?
- What inventory is unhealthy?
- What should the factory produce automatically?

This is the feedback loop that makes NativPost self-improving.

---

## The Loop

```
┌─────────────────────┐
│  CONTENT INVENTORY  │
└──────────┬──────────┘
           │
           ▼
   What are we missing?
           │
           ▼
  INVENTORY INTELLIGENCE  ← PHASE 7
           │
           ▼
   GENERATION DEMAND
           │
           ▼
   CONTENT FACTORY
           │
           ▼
      VALIDATION
           │
           ▼
        TAGGING
           │
           ▼
     CONSTRUCTION
           │
           ▼
   QUALITY EVALUATION
           │
           ▼
    CONTENT LIBRARY
           │
           └──────────────► GENERATION
```

---

## Four Engines

### 1. Deduplication Engine

Without deduplication:
```
1000 assets → looks like 120 unique assets
```

**Types of duplicates:**

| Type | Detection | Threshold |
|------|-----------|-----------|
| Exact | sha256 / phash | 1.0 |
| Visual | visual embedding cosine similarity | 0.95 |
| Semantic | semantic embedding cosine similarity | 0.90 |
| Composition | asset overlap + order | 0.95 |

**Composition Signature:**
```typescript
sha256(asset_ids + order + text)
```

---

### 2. Diversity Engine

You don't want:
```
1000 B2B men
```

You want:
```
men, women, africans, americans, asians,
founders, fitness, fashion, ugc, ai, finance,
agency, coaches, creators
```

**Diversity Dimensions:**

- Industry
- Audience
- Gender
- Visual style
- Country
- Content type
- Creator type
- Emotion
- Offer type
- Hook style
- Audio style
- Aspect ratio
- Color palette
- Setting
- Language

**Scoring:**
- Entropy-based (0-100)
- Higher = more diverse
- Imbalance detection with severity levels

---

### 3. Inventory Engine

The real business engine.

```
Target: 1000 per type

Current:
  Talking Head: 241
  UGC: 183
  Reels: 900
  Slideshows: 62

Need:
  759 Talking Heads
  817 UGC
  938 Slideshows
```

**Health Status:**

| Status | Coverage |
|--------|----------|
| Healthy | >= 80% |
| Low | 50-79% |
| Critical | < 50% |
| Overstocked | > 120% |

**Freshness Tracking:**

- Fresh: < 30 days
- Mature: 30-90 days
- Aging: 90-180 days
- Stale: 180-365 days
- Expired: > 365 days

**Industry Decay Rates:**

| Industry | Half-Life | Refresh |
|----------|-----------|---------|
| AI | 30 days | 14 days |
| Marketing | 60 days | 30 days |
| Crypto | 45 days | 21 days |
| Finance | 90 days | 60 days |
| Health | 120 days | 90 days |
| Fitness | 180 days | 120 days |

---

### 4. Demand Engine

Where autonomy begins.

**Generation Brief:**
```json
{
  "content_type": "ugc",
  "audience": "saas",
  "gender": "female",
  "tone": "authentic",
  "count": 50
}
```

**Priority Levels:**

| Priority | Trigger |
|----------|---------|
| Critical | Coverage < 30% |
| High | Coverage < 50% |
| Medium | Coverage < 80% |
| Low | Coverage >= 80% |

**Batching:**
- Default batch size: 50
- Max concurrent tasks: 5

---

## Architecture

```
src/lib/content-engine/inventory/
├── types.ts                  # All types for dedup, diversity, inventory, demand
├── deduplication-engine.ts   # Exact, visual, semantic, composition dedup
├── diversity-engine.ts       # Distribution tracking, imbalance detection
├── inventory-engine.ts       # Counts, targets, health, freshness
├── demand-engine.ts          # Generation task creation
└── index.ts                  # Barrel exports
```

---

## Configuration

```typescript
const INVENTORY_CONFIG = {
  deduplication: {
    exactThreshold: 1.0,
    visualThreshold: 0.95,
    semanticThreshold: 0.90,
    compositionThreshold: 0.95,
    maxGroupSize: 10,
  },
  diversity: {
    minEntropy: 0.7,
    maxDominance: 0.4,
    imbalanceThreshold: 50,
  },
  inventory: {
    healthyThreshold: 0.8,
    lowThreshold: 0.5,
    overstockedThreshold: 1.2,
    freshnessDecayDays: 90,
    criticalDecayDays: 180,
    defaultTargetPerType: 1000,
  },
  demand: {
    batchSize: 50,
    maxConcurrentTasks: 5,
    priorityThresholds: {
      critical: 0.3,
      high: 0.5,
      medium: 0.8,
    },
  },
};
```

---

## Dashboards (Future)

**Supply vs Demand:**
```
CONTENT TYPE

Talking Head: 241 / 1000
UGC: 183 / 1000
Slides: 62 / 1000
```

**Coverage:**
```
Fitness: 72%
AI: 95%
Finance: 21%
Healthcare: 5%
```

**Factory Queue:**
```
Missing:
- 200 AI reels
- 300 female UGC
- 100 green screens
```

---

## Integration Points

### With Phase 3 (Generation Factory)
- Demand engine creates generation tasks
- Factory processes demands automatically

### With Phase 4 (Quality Gates)
- Only validated assets count toward inventory
- Failed assets don't inflate counts

### With Phase 5 (Tagging)
- Tags feed diversity dimensions
- Embeddings enable deduplication

### With Phase 6 (Construction)
- Compositions tracked for dedup
- Construction quality affects inventory health

---

## Key Metrics

| Metric | Description |
|--------|-------------|
| Coverage | currentCount / targetCount |
| Freshness | Exponential decay based on half-life |
| Diversity | Shannon entropy across dimensions |
| Imbalance | Deficit count per dimension |
| Demand | Generation tasks created |

---

## Files Created

```
src/lib/content-engine/inventory/
├── types.ts                  # All types
├── deduplication-engine.ts   # Dedup engine
├── diversity-engine.ts       # Diversity engine
├── inventory-engine.ts       # Inventory engine
├── demand-engine.ts          # Demand engine
└── index.ts                  # Barrel exports
```

---

## Verification

✅ Typecheck: 0 errors  
✅ All 4 engines implemented  
✅ Deduplication: exact, visual, semantic, composition  
✅ Diversity: 15 dimensions tracked  
✅ Inventory: health, freshness, decay rates  
✅ Demand: batched generation tasks  
✅ Configuration: all thresholds configurable  
✅ Integration: ready for Phase 8 (UI)
