# PHASE 3: GENERATION FACTORY

## Overview

Phase 3 implements the **Generation Factory** — the orchestration layer for media generation. This layer sits between the Content Request API and the Provider Abstraction Layer (Phase 2).

**Core responsibility:** "Did we successfully generate and acquire the media?"

**NOT responsible:** "Is this media technically and qualitatively acceptable?" (Phase 4)

---

## Architecture

```
GENERATION REQUEST
       │
       ▼
GenerationFactory
       │
       ├── validateRequest()
       │
       ├── ModelRouter.findModel()
       │
       ├── createJob()
       │
       ├── submitJob()
       │
       ├── createAttempt()
       │
       ├── Provider.submitJob()
       │
       ├── persist externalJobId
       │
       ├── webhook / polling
       │
       ├── processResult()
       │
       ├── createMediaAsset()
       │
       └── hand off to Phase 4
```

---

## Files Created

| File | Purpose |
|------|---------|
| `generation/types.ts` | Core types, state machines, error codes |
| `generation/factory.ts` | GenerationFactory class (orchestration) |
| `generation/index.ts` | Barrel exports |

---

## Job State Machine

```
PLANNED → QUEUED → SUBMITTING → SUBMITTED → PROCESSING → COMPLETED → READY
                          ↓            ↓           ↓
                       FAILED       FAILED      FAILED
                          ↓            ↓           ↓
                       (retry)      (retry)     (retry)
                          ↓            ↓           ↓
                       SUBMITTING  SUBMITTING  SUBMITTING

Any state → CANCELLED
Any state → REJECTED (content policy)
```

### Valid Transitions

```typescript
const VALID_TRANSITIONS: Record<GenerationJobStatus, GenerationJobStatus[]> = {
  planned:     ['queued', 'cancelled'],
  queued:      ['submitting', 'cancelled', 'failed'],
  submitting:  ['submitted', 'failed', 'cancelled'],
  submitted:   ['processing', 'failed', 'cancelled'],
  processing:  ['completed', 'failed', 'cancelled', 'rejected'],
  completed:   ['ready', 'failed'],
  ready:       [],  // Terminal state
  failed:      ['queued', 'cancelled'],  // Can retry by re-queuing
  cancelled:   [],  // Terminal state
  rejected:    ['queued', 'cancelled'],  // Can retry with different input
};
```

---

## Attempt State Machine

```
PENDING → SUBMITTING → SUBMITTED → PROCESSING → COMPLETED
                                    ↓
                                 FAILED / TIMED_OUT
```

Each retry creates a **new attempt**. Previous attempts are preserved as immutable history.

---

## Retry Strategy

- **Retryable errors:** `PROVIDER_TIMEOUT`, `PROVIDER_RATE_LIMITED`, `PROVIDER_SUBMIT_FAILED`, `STORAGE_FAILED`, `DATABASE_ERROR`, `UNKNOWN_ERROR`
- **Non-retryable errors:** `CONTENT_POLICY_VIOLATION`, `PROVIDER_AUTH_ERROR`, `PROVIDER_QUOTA_EXCEEDED`, `VALIDATION_ERROR`, `ROUTING_FAILED`
- **Backoff:** Exponential with base 5s, max 5 minutes
- **Max attempts:** Configurable (default: 3)

---

## Idempotency

- **Job creation:** Each job gets a unique UUID
- **Webhook deduplication:** If job is already `completed` or `ready`, webhook is ignored
- **Result processing:** Only processes results for jobs in valid states
- **Provider idempotency:** Relies on provider-specific idempotency keys (e.g., Fal's `requestId`)

---

## Webhook Handling

```typescript
processWebhook(event: WebhookEvent): Promise<GenerationJobRecord | null>
```

1. Find job by `externalJobId`
2. Deduplicate (skip if already completed/ready)
3. Update `webhookReceivedAt`
4. Handle based on event type:
   - `completed` → processResult()
   - `failed` → handleJobFailure()
   - `cancelled` → update status
   - `status_change` → update externalStatus

---

## Polling Fallback

```typescript
pollJobStatus(jobId: string): Promise<GenerationJobRecord | null>
```

For providers without webhooks or when webhooks are delayed:
1. Get current job state
2. Only poll if status is `submitted` or `processing`
3. Call `provider.getJobStatus()`
4. If completed, call `provider.getJobResult()` and processResult()
5. If failed, handleJobFailure()

---

## MediaAsset Creation

When generation succeeds, a `media_asset` is created with:

- `status: 'pending_review'` — Phase 4 will validate
- `originType: 'generated'`
- `assetType` — from output
- `url` — primary output URL
- `generationJobId` — link back to job
- `generationVersion` — pipeline version
- `audioStatus: 'unknown'` — Phase 4 will validate audio

**Phase 3 does NOT declare the asset as valid.** Generation success ≠ quality success.

---

## Cost Tracking

- `estimatedCost` — from provider submission
- `actualCost` — from provider result (if available)
- `costCurrency` — default 'USD'
- `creditsCharged` — internal credits

---

## Error Taxonomy

| Error Code | Retryable | Description |
|------------|-----------|-------------|
| `VALIDATION_ERROR` | No | Invalid request parameters |
| `ROUTING_FAILED` | No | No model found for requirements |
| `PROVIDER_SUBMIT_FAILED` | Yes | Submission to provider failed |
| `PROVIDER_TIMEOUT` | Yes | Provider timed out |
| `PROVIDER_RATE_LIMITED` | Yes | Rate limit exceeded |
| `PROVIDER_AUTH_ERROR` | No | Authentication failed |
| `PROVIDER_QUOTA_EXCEEDED` | No | Quota exceeded |
| `CONTENT_POLICY_VIOLATION` | No | Content rejected by policy |
| `STORAGE_FAILED` | Yes | Storage/Cloudinary failed |
| `DATABASE_ERROR` | Yes | Database operation failed |
| `UNKNOWN_ERROR` | Yes | Unclassified error |

---

## Usage Example

```typescript
import { getFactory } from '@/lib/content-engine';

const factory = getFactory();

// 1. Create a job
const job = await factory.createJob({
  orgId: 'org_123',
  mediaType: 'video',
  prompt: 'A sunset over the ocean',
  aspectRatio: '9:16',
  duration: 5,
  requiresAudio: true,
  requiresNativeAudio: true,
});

// 2. Submit to provider
const submitted = await factory.submitJob(job.id);

// 3. Poll or wait for webhook
const updated = await factory.pollJobStatus(job.id);

// 4. Process result (when ready)
const completed = await factory.processResult(job.id, {
  urls: ['https://cloudinary.com/video.mp4'],
  assetType: 'video',
  durationSeconds: 5,
  hasAudio: true,
  audio: {
    status: 'unknown',  // Phase 4 will validate
    durationMs: 5000,
  },
});

// 5. MediaAsset is now created with status='pending_review'
```

---

## What Phase 3 Does NOT Do

- Does NOT validate media quality (Phase 4)
- Does NOT tag or embed media (Phase 5)
- Does NOT build content compositions (Phase 7)
- Does NOT deduplicate media (Phase 4)
- Does NOT perform content construction (Phase 7)

---

## Typecheck Result

```
npx tsc --noEmit → 0 errors
```

---

## Next Phase

**Phase 4: Processing & Quality Gate**
- Technical validation (codec, resolution, audio)
- Quality scoring
- Deduplication (file hash, perceptual hash)
- Status transitions from `pending_review` → `valid`/`invalid`
