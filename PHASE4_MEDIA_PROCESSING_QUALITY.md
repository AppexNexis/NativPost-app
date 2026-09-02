# PHASE 4: MEDIA PROCESSING + HARD QUALITY GATES

## Overview

Phase 4 implements the **Media Processing Pipeline** and **Hard Quality Gates** — the critical boundary between "generated" and "eligible for library."

**Core principle:** GENERATION SUCCESS != MEDIA ACCEPTANCE

A provider returning a successful generation result does NOT mean the asset is valid. This phase is the gate.

---

## Architecture

```
GENERATED MEDIA
       │
       ▼
MediaProcessor
       │
       ├── download/acquire
       │
       ├── probe (FFprobe)
       │
       ├── normalize metadata
       │
       ├── validate
       │   ├── AudioValidator
       │   ├── VideoValidator
       │   └── ImageValidator
       │
       ├── compute quality scores
       │
       ├── QualityGate.evaluate()
       │
       └── return QualityGateResult
              │
              ├── passed → AVAILABLE
              └── failed → QUARANTINED
```

---

## Files Created

| File | Purpose |
|------|---------|
| `quality/types.ts` | Core types, failure taxonomy, configurations |
| `quality/audio-validator.ts` | Authoritative audio validation |
| `quality/video-validator.ts` | Technical video validation |
| `quality/image-validator.ts` | Technical image validation |
| `quality/quality-gate.ts` | Hard quality gate evaluation |
| `quality/media-processor.ts` | Orchestration layer |
| `quality/index.ts` | Barrel exports |

---

## HARD INVARIANT: Video Audio is Non-Negotiable

**Every generated video entering the Content Library MUST have usable audio.**

There is NO exception for:
- Reel
- UGC
- Talking Head
- Green Screen
- Wall of Text
- Any other video type

**A video with no audio must fail.**
**A video with silent audio must fail.**
**A video with corrupt/unreadable audio must fail.**

---

## Failure Taxonomy

### Hard Failures (Asset Cannot Proceed)

| Code | Description |
|------|-------------|
| `NO_AUDIO` | No audio stream found |
| `SILENT_AUDIO` | Audio stream exists but is silent |
| `INVALID_AUDIO` | Audio stream exists but is corrupt |
| `TRUNCATED_AUDIO` | Audio appears truncated |
| `AUDIO_DURATION_MISMATCH` | Audio duration differs significantly from video |
| `VIDEO_CORRUPTED` | Video is corrupt or undecodable |
| `VIDEO_UNDECODABLE` | No decodable video stream |
| `INVALID_VIDEO_CONTAINER` | Container format invalid |
| `UNSUPPORTED_VIDEO_CODEC` | Codec not supported |
| `INVALID_FPS` | Frame rate invalid |
| `ZERO_FRAMES` | No frames in video |
| `IMAGE_CORRUPTED` | Image is corrupt |
| `IMAGE_UNDECODABLE` | Cannot decode image |
| `INVALID_IMAGE_MIME` | MIME type not supported |
| `INVALID_DIMENSIONS` | Width/height invalid |
| `INVALID_DURATION` | Duration invalid |
| `INVALID_FILE_SIZE` | File size invalid |
| `INVALID_MIME_TYPE` | MIME type invalid |
| `METADATA_MISSING` | Required metadata missing |
| `PROCESSING_FAILED` | Processing crashed |
| `STORAGE_FAILED` | Storage retrieval failed |
| `DOWNLOAD_FAILED` | Download failed |
| `SAFETY_VIOLATION` | Content policy violation |
| `NSFW_CONTENT` | NSFW content detected |
| `HATEFUL_CONTENT` | Hateful content detected |
| `VIOLENT_CONTENT` | Violent content detected |

### Retryable Failures

| Code | Description |
|------|-------------|
| `PROCESSING_FAILED` | May succeed on retry |
| `STORAGE_FAILED` | May be transient |
| `DOWNLOAD_FAILED` | May be transient |
| `TIMEOUT` | May be transient |

---

## Audio Validation

The `AudioValidator` determines:

- Audio stream exists
- Audio duration
- Audio codec
- Sample rate
- Channels
- Effective loudness
- Silence ratio
- Audio duration vs video duration

### Detection States

| State | Meaning |
|-------|---------|
| `valid` | Audio is present and usable |
| `no_audio` | No audio stream found |
| `silent_audio` | Audio stream exists but is silent |
| `invalid_audio` | Audio stream exists but is corrupt |
| `truncated_audio` | Audio appears truncated |
| `unknown` | Cannot determine |

### Thresholds (Configurable)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `minLoudnessLufs` | -60 | Minimum loudness to consider non-silent |
| `maxSilenceRatio` | 0.95 | Maximum silence ratio to consider valid |
| `minDurationSeconds` | 0.1 | Minimum audio duration |
| `maxDurationMismatchRatio` | 0.1 | Max mismatch between audio/video duration |
| `minSampleRate` | 8000 | Minimum sample rate |

---

## Video Validation

The `VideoValidator` validates:

- Playable container
- Decodable video stream
- Dimensions
- Aspect ratio
- FPS
- Duration
- Bitrate/file integrity
- No corruption
- No zero-frame video
- Audio stream (delegates to AudioValidator)

### Thresholds (Configurable)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `minDurationSeconds` | 0.5 | Minimum video duration |
| `maxDurationSeconds` | 300 | Maximum video duration |
| `minWidth` | 256 | Minimum width |
| `minHeight` | 256 | Minimum height |
| `maxFileSizeBytes` | 500MB | Maximum file size |
| `minFps` | 1 | Minimum FPS |
| `maxFps` | 120 | Maximum FPS |

---

## Image Validation

The `ImageValidator` validates:

- Image decodes successfully
- MIME type valid
- Dimensions valid
- File not corrupted
- Image not effectively blank
- File size sensible

### Thresholds (Configurable)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `minWidth` | 64 | Minimum width |
| `minHeight` | 64 | Minimum height |
| `maxFileSizeBytes` | 50MB | Maximum file size |
| `maxBlankRatio` | 0.99 | Maximum blank pixel ratio |

---

## Quality Dimensions

The six quality dimensions from Phase 1:

| Dimension | Phase 4 Evaluation | NULL Means |
|-----------|-------------------|------------|
| `technical` | YES | Not evaluated |
| `audio` | YES | Not evaluated |
| `visual` | NO (requires AI) | Not evaluated |
| `safety` | WHERE INFRASTRUCTURE EXISTS | Not evaluated |
| `composition` | NO (for raw assets) | Not evaluated |
| `semantic` | NO (requires AI) | Not evaluated |

**NULL means "not evaluated" — NOT zero.**

---

## Hard Quality Gate

The `QualityGate` returns structured results:

```typescript
{
  passed: boolean,
  failures: FailureCode[],    // Hard failures
  warnings: string[],          // Non-blocking issues
  assessment: QualityAssessment,
  gateVersion: string,
  evaluatedAt: Date
}
```

**Separate HARD FAILURES from WARNINGS.**

A hard failure means the asset cannot proceed.
Warnings do not automatically mean rejection.

---

## Status Transitions

```
GENERATED (Phase 3)
    ↓
PROCESSING (Phase 4 starts)
    ↓
VALIDATED (Phase 4 passes)
    ↓
TAGGED (Phase 5)
    ↓
AVAILABLE (Phase 8)

Failure:
PROCESSING
    ↓
QUARANTINED (Phase 4 fails)
    ↓
REJECTED (explicit rejection)
```

---

## Quarantine

Failed assets are quarantined, not deleted. Persisted:

- Failure reasons (structured FailureCodes)
- Generation job reference
- Generation attempt reference
- Provider reference
- Model reference

This data is important for provider/model evaluation.

---

## Quality Gate Versioning

Every gate evaluation records:

```typescript
gateVersion: string  // e.g., "1.0.0"
```

This identifies the ruleset/implementation version.
We need to answer: "Why did this asset pass six months ago?"

---

## Reprocessing

Support reprocessing:

```
old asset
    ↓
new processing run
    ↓
new quality evaluation
```

Historical evaluation information is preserved if schema supports it.

---

## Processing vs Media Failure

**Distinguish:**

| Type | Example | Retryable? |
|------|---------|------------|
| MEDIA IS INVALID | Video has no audio | No (definitive) |
| PROCESSING FAILED | FFmpeg crashed | Yes |

This distinction is important.
A processing failure may be retried.
A definitive media failure should not be blindly retried.

---

## Usage Example

```typescript
import { getMediaProcessor } from '@/lib/content-engine';

const processor = getMediaProcessor();

// Process a generated video
const result = await processor.process(
  'video',
  'https://storage.example.com/video.mp4',
);

// Check gate result
if (result.gate.passed) {
  // Video is technically valid
  console.log('PASSED:', result.quality.scores);
} else {
  // Video failed validation
  console.log('FAILED:', result.gate.failures);
  // e.g., ['NO_AUDIO', 'SILENT_AUDIO']
}

// Quality scores (NULL = not evaluated)
console.log('Technical:', result.quality.scores.technical);
console.log('Audio:', result.quality.scores.audio);
console.log('Visual:', result.quality.scores.visual); // NULL
console.log('Safety:', result.quality.scores.safety); // NULL
```

---

## What Phase 4 Does NOT Do

- Does NOT determine visual quality (requires AI scoring)
- Does NOT tag or embed media (Phase 5)
- Does NOT build content compositions (Phase 7)
- Does NOT deduplicate media (Phase 6)
- Does NOT make content appropriateness decisions (Phase 6)
- Does NOT perform inventory intelligence (Phase 9)

---

## Typecheck Result

```
npx tsc --noEmit → 0 errors
```

---

## Next Phase

**Phase 5: Tagging & Embeddings**
- Automated tagging from media analysis
- Embedding generation for similarity search
- Keyword extraction
- Category classification
