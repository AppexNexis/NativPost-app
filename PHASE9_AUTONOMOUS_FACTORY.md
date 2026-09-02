# Phase 9: Autonomous Content Factory

**Status:** ✅ COMPLETE  
**Date:** 2026-09-01  
**Type errors:** 0

---

## Overview

Phase 9 makes the Content Intelligence Engine run continuously without manual intervention. The factory evaluates inventory, generates demand, dispatches jobs, recovers failures, and replenishes content — all autonomously.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AUTONOMOUS LOOP                           │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 1. CHECK INVENTORY                                      ││
│  │    • Content counts vs targets                          ││
│  │    • Freshness scores                                   ││
│  │    • Diversity dimensions                               ││
│  └─────────────────────────────────────────────────────────┘│
│                          ↓                                   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 2. CALCULATE DEMAND                                     ││
│  │    • Inventory gaps                                     ││
│  │    • Diversity imbalances                               ││
│  │    • Freshness decay                                    ││
│  └─────────────────────────────────────────────────────────┘│
│                          ↓                                   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 3. CHECK BUDGET                                         ││
│  │    • Daily/Monthly limits                               ││
│  │    • Provider/Model budgets                             ││
│  │    • Hard stops                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                          ↓                                   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 4. PRIORITIZE                                           ││
│  │    • Deficit × importance × velocity × freshness        ││
│  │    • Diversity contribution                             ││
│  │    • Cost efficiency                                    ││
│  └─────────────────────────────────────────────────────────┘│
│                          ↓                                   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 5. DISPATCH JOBS                                        ││
│  │    • Batch by priority                                  ││
│  │    • Respect budget limits                              ││
│  │    • Track provenance                                   ││
│  └─────────────────────────────────────────────────────────┘│
│                          ↓                                   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 6. MONITOR PROGRESS                                     ││
│  │    • Track job status                                   ││
│  │    • Record costs                                       ││
│  │    • Update metrics                                     ││
│  └─────────────────────────────────────────────────────────┘│
│                          ↓                                   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 7. QUALITY RECOVERY                                     ││
│  │    • Retry failed jobs                                  ││
│  │    • Modify parameters                                  ││
│  │    • Switch models                                      ││
│  │    • Quarantine after N failures                        ││
│  └─────────────────────────────────────────────────────────┘│
│                          ↓                                   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 8. UPDATE INVENTORY                                     ││
│  │    • Take snapshot                                      ││
│  │    • Calculate coverage                                 ││
│  │    • Assess health                                      ││
│  └─────────────────────────────────────────────────────────┘│
│                          ↓                                   │
│                    REPEAT                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Factory Scheduler (`factory-scheduler.ts`)

The heartbeat of the autonomous system.

```typescript
const scheduler = getFactoryScheduler({
  scheduler: {
    enabled: true,
    intervalMinutes: 30,
    quietHoursStart: 2,
    quietHoursEnd: 6,
  },
});

scheduler.start(); // Runs every 30 minutes
```

**Features:**
- Configurable interval (default: 30 minutes)
- Quiet hours (default: 2-6 AM UTC)
- Concurrent run prevention
- Run history tracking
- Health monitoring

### 2. Demand Prioritizer (`demand-prioritizer.ts`)

Decides what to generate next.

```typescript
const prioritizer = getDemandPrioritizer();
const plan = await prioritizer.getGenerationPlan(orgId, 50);

// Returns:
// {
//   critical: [{ demand, batchSize: 50 }],
//   high: [{ demand, batchSize: 37 }],
//   medium: [{ demand, batchSize: 25 }],
//   low: [{ demand, batchSize: 12 }],
//   totalEstimatedCost: 12.50
// }
```

**Priority Formula:**
```
Priority = deficit × 0.30
         + importance × 0.20
         + velocity × 0.15
         + freshness × 0.15
         + diversity × 0.10
         + cost × 0.10
```

### 3. Budget Controller (`budget-controller.ts`)

Economic governor with hard stops.

```typescript
const budget = getBudgetController({
  dailyBudget: 25.00,
  monthlyBudget: 500.00,
  perProviderBudget: 100.00,
  perModelBudget: 50.00,
  hardStopThreshold: 0.95,
});

const status = await budget.checkBudget(orgId);
// {
//   daily: { budget: 25, spent: 21.40, remaining: 3.60 },
//   monthly: { budget: 500, spent: 142.30, remaining: 357.70 },
//   canGenerate: true
// }
```

**Budget Levels:**
- Daily: $25
- Monthly: $500
- Per Provider: $100
- Per Model: $50
- Hard Stop: 95% utilization

### 4. Model Learner (`model-learner.ts`)

Learns which models produce the best results.

```typescript
const learner = getModelLearner();
const recommendations = await learner.getRecommendations(orgId, 'talking_head', 10);

// Returns models sorted by cost per accepted asset:
// Model B: $0.04, 61% usable → $0.066/accepted ✅ BEST
// Model A: $0.08, 94% usable → $0.085/accepted
// Model C: $0.12, 98% usable → $0.122/accepted
```

**Key Metric:** Cost per accepted asset (not cost per generation)

### 5. Quality Recovery (`quality-recovery.ts`)

Retries failed content intelligently.

```typescript
const recovery = getQualityRecovery(3); // Max 3 retries

const attempt = await recovery.recoverJob(jobId, 'NO_AUDIO');
// RecoveryStrategy for NO_AUDIO:
//   Attempt 1: retry_same (enable audio)
//   Attempt 2: retry_different_model (ElevenLabs)
//   Attempt 3: quarantine
```

**Recovery Strategies:**
| Failure Code | Strategy | Max Retries |
|--------------|----------|-------------|
| NO_AUDIO | retry_modified | 3 |
| SILENT_AUDIO | retry_different_model | 2 |
| INVALID_AUDIO | retry_modified | 2 |
| VIDEO_TOO_SHORT | retry_modified | 2 |
| NO_FACE | retry_different_model | 2 |
| QUALITY_TOO_LOW | retry_different_model | 2 |

### 6. Diversity Controller (`diversity-controller.ts`)

Ensures inventory stays diverse.

```typescript
const controller = getDiversityController({
  targetDiversityScore: 0.8,
  minDiversityPerDimension: 0.6,
});

const result = await controller.analyzeAndControl(orgId);
// {
//   actions: [
//     { type: 'generate', dimension: 'gender', category: 'female', count: 50 },
//     { type: 'suppress', dimension: 'industry', category: 'b2b', count: 0 }
//   ],
//   overallDiversityScore: 72,
//   dimensionsImproved: ['gender', 'audience']
// }
```

### 7. Self-Replenisher (`self-replenisher.ts`)

The autonomous loop orchestrator.

```typescript
const replenisher = getSelfReplenisher();
const result = await replenisher.executeCycle(orgId);
// {
//   success: true,
//   metrics: {
//     demandsCreated: 12,
//     jobsQueued: 50,
//     jobsCompleted: 47,
//     assetsAccepted: 38,
//     costPerAcceptedAsset: 0.082
//   },
//   actions: [
//     'Inventory health: 5 healthy, 2 gaps',
//     'Budget: $3.60 daily remaining',
//     'Dispatched 50 jobs',
//     'Recovery: 3 recovered, 1 escalated'
//   ]
// }
```

---

## The Complete Loop

```
                 CONTENT FACTORY
                        │
                        ↓
                  Check inventory
                        │
             ┌──────────┴──────────┐
             ↓                     ↓
          Healthy                Gap
             │                     │
             │                     ↓
             │              Create demand
             │                     │
             │                     ↓
             │              Prioritize
             │                     │
             │                     ↓
             │              Check budget
             │                     │
             │                     ↓
             │              Dispatch jobs
             │                     │
             │                     ↓
             │              Monitor progress
             │                     │
             │                     ↓
             │              Quality recovery
             │                     │
             │                     ↓
             │              Update inventory
             │                     │
             └─────────────────────┘
```

---

## Key Metrics

### Cost per Usable Content

The most important metric:

```
1,000 generations
↓
812 assets pass quality
↓
694 become valid content
↓
81 duplicates removed
↓
613 new library contents

Total cost: $74.20

Cost / usable content:
$0.121
```

### Other Metrics

| Metric | Description |
|--------|-------------|
| Success Rate | Completed / Total generations |
| Acceptance Rate | Accepted / Completed generations |
| Recovery Rate | Recovered / Failed generations |
| Diversity Score | 0-100 entropy-based |
| Budget Utilization | Spent / Budget |

---

## Files Created

```
src/lib/content-engine/autonomous/
├── types.ts                 # All autonomous factory types
├── factory-scheduler.ts     # Recurring orchestrator
├── demand-prioritizer.ts    # Smart prioritization
├── budget-controller.ts     # Cost management
├── model-learner.ts         # Routing optimization
├── quality-recovery.ts      # Failed content recovery
├── diversity-controller.ts  # Inventory diversity
├── self-replenisher.ts      # The autonomous loop
└── index.ts                 # Barrel exports
```

---

## Usage

### Start the Factory

```typescript
import { getFactoryScheduler } from '@/lib/content-engine';

const scheduler = getFactoryScheduler();
scheduler.start();
```

### Run a Single Cycle

```typescript
import { getSelfReplenisher } from '@/lib/content-engine';

const replenisher = getSelfReplenisher();
const result = await replenisher.executeCycle(orgId);
```

### Check Health

```typescript
import { getFactoryScheduler } from '@/lib/content-engine';

const scheduler = getFactoryScheduler();
const health = await scheduler.getHealth();
```

### Get Cost Intelligence

```typescript
import { getModelLearner } from '@/lib/content-engine';

const learner = getModelLearner();
const insights = await learner.getInsights(orgId);
```

---

## Integration Points

### With Phase 3 (Generation Factory)
- Dispatches jobs through the factory
- Tracks job status and results

### With Phase 4 (Quality Gates)
- Quality recovery handles failures
- Retry strategies based on failure codes

### With Phase 5 (Tagging)
- Tags drive diversity dimensions
- Embeddings enable similarity search

### With Phase 6 (Construction)
- Construction quality affects acceptance
- Composition tracking for provenance

### With Phase 7 (Inventory Intelligence)
- Inventory status drives demand
- Diversity engine provides imbalance data

### With Phase 8 (Control Plane)
- Factory scheduler exposes health metrics
- Budget controller provides cost data

---

## Verification

✅ Typecheck: 0 errors  
✅ All 7 components implemented  
✅ Factory scheduler with configurable interval  
✅ Demand prioritization with weighted scoring  
✅ Budget controller with hard stops  
✅ Model learning for cost optimization  
✅ Quality recovery with retry strategies  
✅ Diversity controller for inventory balance  
✅ Self-replenisher orchestrating the complete loop  

---

## What's Next

Phase 9 makes the system autonomous. The next phases should focus on:

1. **Phase 10: Production Hardening** — Error handling, monitoring, alerts
2. **Phase 11: Performance / Learning Loop** — A/B testing, optimization
3. **Phase 12: Customer-facing Content Delivery** — API for content consumption

The factory can now run continuously, generating and replenishing content at predictable cost without human intervention.
