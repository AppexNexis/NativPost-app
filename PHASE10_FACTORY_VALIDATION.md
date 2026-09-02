# Phase 10: Factory Validation & Production Hardening

**Status:** ✅ COMPLETE  
**Date:** 2026-09-01  
**Type errors:** 0

---

## Overview

Phase 10 proves the factory works end-to-end before any autonomous spending. The architecture exists — now we verify it's safe.

> The code for an autonomous factory exists. That does not yet mean we should trust it to autonomously spend money and populate the production library.

---

## Components

### 10.1 Dry Run (`dry-run.ts`)

Preview what the factory would do without spending money.

```typescript
const dryRun = getDryRunEngine();
const result = await dryRun.execute(orgId);

// Dashboard shows:
// "If enabled right now, the factory would generate 150 assets
//  at an estimated cost of $7.50"
```

**What it shows:**
- Inventory status with gaps
- Demand calculation
- Prioritized tasks with scores
- Budget projection (would it exceed limits?)
- Model selections with cost estimates
- Warnings for potential issues

### 10.2 Sandbox (`sandbox.ts`)

Actual generation with hard caps.

```typescript
const sandbox = getSandboxExecutor({
  enabled: true,
  maxJobs: 5,          // Don't unleash 1000
  maxSpend: 1.00,      // Don't spend $25
  maxAttempts: 2,
  allowedProviders: ['fal'],
  allowedModels: ['kling_video', 'flux_image'],
  dryRunFirst: true,
});

const result = await sandbox.execute(orgId);
// {
//   execution: { jobsAttempted: 5, jobsSucceeded: 4, totalSpent: 0.20 },
//   outcomes: { assetsAccepted: 3, costPerAcceptedAsset: 0.067 }
// }
```

### 10.3 Kill Switch (`kill-switch.ts`)

Emergency stop for the autonomous factory.

```typescript
const killSwitch = getKillSwitch();

// Pause (allows in-flight to complete)
killSwitch.pause('Testing complete', 'admin');

// Emergency stop (blocks everything)
killSwitch.emergencyStop('system');

// Resume
killSwitch.deactivate('admin');
```

**States:**
- `active: false` — Factory running normally
- `active: true, allowsInFlight: true` — Paused, existing jobs finish
- `active: true, allowsInFlight: false` — Emergency stop, all new submissions blocked

### 10.4 Provenance Auditor (`provenance-auditor.ts`)

Trace any library item back to its origin.

```typescript
const auditor = getProvenanceAuditor();

// Single item audit
const chain = await auditor.auditMediaAsset(assetId);
// {
//   chain: [
//     { level: 'media_asset', id: '...', createdAt: ... },
//     { level: 'generation_job', id: '...', metadata: { providerId: 'fal' } },
//     { level: 'provider', id: 'fal', type: 'fal' },
//     { level: 'model', id: 'kling_video', type: 'video' },
//     { level: 'generation_attempt', id: '...', attemptNumber: 1 },
//     { level: 'tags', id: '...', tagCount: 5 },
//   ],
//   isComplete: true,
//   hasGaps: []
// }

// Org-wide audit
const audit = await auditor.auditOrganization(orgId);
// {
//   totalLibraryItems: 500,
//   itemsWithCompleteProvenance: 487,
//   itemsWithGaps: 13,
//   gapsByType: { 'no_tags': 8, 'provider_not_found': 5 }
// }
```

### 10.5 Quality Invariant Tester (`quality-invariant-tester.ts`)

Test the hardest invariants — no invalid content reaches library.

```typescript
const tester = getQualityInvariantTester();
const suite = await tester.runAllTests(orgId);
// {
//   totalTests: 9,
//   passedTests: 9,
//   failedTests: 0,
//   allInvariantsHeld: true
// }
```

**Invariants tested:**
| Test | Expected | Description |
|------|----------|-------------|
| NO_AUDIO | quarantine | Video without audio never enters library |
| SILENT_AUDIO | quarantine | Silent audio never enters library |
| INVALID_AUDIO | quarantine | Corrupted audio never enters library |
| TRUNCATED_AUDIO | quarantine | Audio shorter than video never enters library |
| AUDIO_CODEC_FAILURE | quarantine | Unsupported codec never enters library |
| VIDEO_TOO_SHORT | retry | Too short retries or quarantines |
| VIDEO_TOO_LONG | retry | Too long retries or quarantines |
| NO_FACE | retry | Talking head without face retries |
| QUALITY_TOO_LOW | retry | Low quality retries with different model |

### 10.6 Cost Accuracy Tracker (`cost-accuracy.ts`)

Measure estimated vs actual cost.

```typescript
const tracker = getCostAccuracyTracker();
const report = await tracker.generateReport(orgId, startDate, endDate);
// {
//   totalJobs: 100,
//   totalEstimatedCost: 8.40,
//   totalActualCost: 8.25,
//   accuracyPercent: 98.2,
//   costPerUsableContent: 0.117,
//   totalUsableContent: 72
// }
```

**Key metric:** `costPerUsableContent`

```
Total factory cost ÷ library-eligible content produced
= $0.117 per usable content
```

### 10.7 Safety Limits (`safety-limits.ts`)

Minimum observations before models are trusted.

```typescript
const safety = getSafetyLimitsEngine();
const limits = safety.getLimits();
// {
//   minimumObservationsPerModel: 50,
//   minimumSuccessfulGenerationsPerModel: 20,
//   minimumQualitySamples: 30,
//   minimumDaysOfHistory: 7,
//   maxDailySpend: 25.00,
//   maxMonthlySpend: 500.00,
//   maxJobsPerRun: 100,
//   requireManualApprovalAbove: 10.00
// }

// Check if a model is trusted
const trusted = await safety.isModelTrusted(orgId, 'fal', 'kling_video');
// { trusted: false, observations: 12, issues: ['Only 12 observations (minimum: 50)'] }
```

**Prevents:**
```
Model B
1 generation
1 success
100% success rate
→ incorrectly routes everything to it
```

### 10.8 Production Activation Guard (`production-activation.ts`)

Controls when the factory is allowed to run autonomously.

```typescript
const guard = getProductionActivationGuard();
const status = await guard.getStatus(orgId);
// {
//   status: 'limited',
//   readyForProduction: false,
//   requiredTests: ['minimum_history', 'kill_switch_available', 'quality_invariants'],
//   passedTests: ['kill_switch_available', 'quality_invariants'],
//   blockedBy: ['minimum_history']
// }

// Check all gates
const gates = await guard.checkGates(orgId);
// [
//   { gate: 'minimum_history', status: 'failed', message: 'Only 12 jobs — need at least 50' },
//   { gate: 'kill_switch_available', status: 'passed' },
//   { gate: 'quality_invariants', status: 'passed' },
//   { gate: 'cost_accuracy', status: 'pending' },
//   { gate: 'safety_limits_configured', status: 'passed' },
//   { gate: 'dry_run_valid', status: 'passed' },
// ]
```

**Activation status:**
- `dry_run_only` — No gates passed
- `sandbox` — Some gates passed
- `limited` — Most gates passed, still blocked
- `full` — All gates passed, ready for production

### 10.9 End-to-End Test (`end-to-end-test.ts`)

Test the complete pipeline from demand to library.

```typescript
const test = getEndToEndAcceptanceTest();
const result = await test.run(orgId);
// {
//   status: 'passed',
//   steps: [
//     { order: 1, name: 'create_demand', status: 'passed' },
//     { order: 2, name: 'create_generation_job', status: 'passed' },
//     ...
//     { order: 16, name: 'inventory_update', status: 'passed' },
//   ],
//   totalDuration: 1250
// }
```

**Pipeline steps tested:**
```
1. create_demand
2. create_generation_job
3. provider_submission
4. generation_attempt
5. generated_media
6. media_processing
7. audio_validation
8. quality_gate
9. tagging
10. embedding
11. qualification
12. construction
13. composition_quality
14. deduplication
15. library_content
16. inventory_update
```

---

## Validation Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    PHASE 10 VALIDATION                       │
│                                                              │
│  Step 1: DRY RUN                                            │
│    "What would the factory do?"                             │
│    Preview demand, prioritization, costs                     │
│    DO NOT SUBMIT                                             │
│                          ↓                                   │
│  Step 2: SANDBOX                                            │
│    Actual generation with tiny caps                          │
│    Max 5 jobs, $1 spend, 2 attempts                         │
│                          ↓                                   │
│  Step 3: QUALITY INVARIANT TESTING                          │
│    Verify NO_AUDIO, SILENT_AUDIO, etc.                      │
│    Must NEVER reach library                                  │
│                          ↓                                   │
│  Step 4: PROVENANCE AUDIT                                   │
│    Trace every item to its origin                            │
│    Verify complete chain                                     │
│                          ↓                                   │
│  Step 5: COST ACCURACY                                      │
│    Estimated vs actual cost                                  │
│    Cost per usable content                                   │
│                          ↓                                   │
│  Step 6: END-TO-END TEST                                    │
│    Complete pipeline validation                              │
│    All 16 steps pass                                         │
│                          ↓                                   │
│  Step 7: PRODUCTION GATE                                    │
│    All gates pass before autonomous mode                     │
│                          ↓                                   │
│  PRODUCTION READY                                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Production Gates

| Gate | Required | Description |
|------|----------|-------------|
| `minimum_history` | ✅ | 50+ jobs in history |
| `kill_switch_available` | ✅ | Emergency stop is operational |
| `quality_invariants` | ✅ | All quality invariants hold |
| `safety_limits_configured` | ✅ | Limits properly set |
| `cost_accuracy` | ❌ | Cost accuracy ≥80% |
| `dry_run_valid` | ❌ | Dry run produces valid output |

**All required gates must pass before production activation.**

---

## Files Created

```
src/lib/content-engine/validation/
├── types.ts                    # All validation types
├── dry-run.ts                  # Preview without spending
├── sandbox.ts                  # Actual generation with caps
├── kill-switch.ts              # Emergency stop
├── provenance-auditor.ts       # Trace items to origin
├── quality-invariant-tester.ts # Test quality rules
├── cost-accuracy.ts            # Estimated vs actual cost
├── safety-limits.ts            # Min observations before trust
├── production-activation.ts    # Controlled activation
├── end-to-end-test.ts          # Full pipeline test
└── index.ts                    # Barrel exports
```

---

## Usage

### Run Dry Run

```typescript
import { getDryRunEngine } from '@/lib/content-engine';

const dryRun = getDryRunEngine();
const result = await dryRun.execute(orgId);
console.log(`Would generate ${result.preview.estimatedTotalJobs} jobs`);
```

### Run Sandbox

```typescript
import { getSandboxExecutor } from '@/lib/content-engine';

const sandbox = getSandboxExecutor({ maxJobs: 5, maxSpend: 1.00 });
const result = await sandbox.execute(orgId);
```

### Check Kill Switch

```typescript
import { getKillSwitch } from '@/lib/content-engine';

const killSwitch = getKillSwitch();
killSwitch.pause('Testing', 'admin');
```

### Audit Provenance

```typescript
import { getProvenanceAuditor } from '@/lib/content-engine';

const auditor = getProvenanceAuditor();
const chain = await auditor.auditMediaAsset(assetId);
```

### Check Production Readiness

```typescript
import { getProductionActivationGuard } from '@/lib/content-engine';

const guard = getProductionActivationGuard();
const status = await guard.getStatus(orgId);
if (status.readyForProduction) {
  // Enable autonomous mode
}
```

---

## Verification

✅ Typecheck: 0 errors  
✅ All 10 components implemented  
✅ Dry run previews without spending  
✅ Sandbox caps actual spending  
✅ Kill switch provides emergency stop  
✅ Provenance auditor traces items to origin  
✅ Quality invariant tester verifies NO_AUDIO etc.  
✅ Cost accuracy tracker measures estimated vs actual  
✅ Safety limits prevent premature model trust  
✅ Production guard blocks unauthorized activation  
✅ End-to-end test validates complete pipeline  

---

## What's Next

Phase 10 proves the factory is safe. Phase 11 makes it smart (performance learning). Phase 12 delivers to customers.

**Phase 10 proves that the factory is safe. Phase 11 makes the factory smart.**
