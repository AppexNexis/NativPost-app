import { and, eq, or } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { textToSpeech } from '@/lib/ai-studio/elevenlabs';
import { extractMediaFromFalPayload, getFalResult, getFalStatus, submitFalJob } from '@/lib/ai-studio/fal';
import { buildFalInput, buildWebhookUrl, falImageSizeFor } from '@/lib/ai-studio/job-helpers';
import { estimateCredits, getModel } from '@/lib/ai-studio/models';
import { reserveCredits } from '@/lib/ai-studio/server';
import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { aiInfluencerSchema, aiStudioJobSchema } from '@/models/Schema';

type RouteParams = { params: Promise<{ id: string }> };

const FAL_FLUX_LORA = 'fal-ai/flux-2/lora';

const IMAGE_ENGINE_URL = process.env.NATIVPOST_IMAGE_URL || 'http://localhost:4000';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

const VALID_ASPECTS = ['9:16', '1:1', '16:9'] as const;
const VALID_DURATIONS = [5, 10] as const;

// Default i2v model for the chained talking-head pipeline.
// Kling Turbo Pro — 1080p, no AI-face restrictions, $0.35/video.
const DEFAULT_I2V_MODEL = 'kling-v3-turbo-pro-i2v';
const FACE_STILL_PROMPT = 'Professional headshot, soft studio lighting, looking directly at camera, neutral expression, sharp focus on face, clean background.';

// -----------------------------------------------------------
// POST /api/ai-influencers/[id]/generate-video
// Orchestrate a face-locked talking-head video from an influencer.
//
// Pipeline:
//   1. Reserve credits upfront (before any paid API calls)
//   2. TTS via text-to-speech → audio URL
//   3. Face-consistent still via identity model → image URL
//   4. Chained i2v→lipsync via existing AI Studio pipeline
// -----------------------------------------------------------
export async function POST(request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId, userId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { id } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // ── Influencer lookup ───────────────────────────────────────────
  const [influencer] = await db
    .select()
    .from(aiInfluencerSchema)
    .where(and(
      eq(aiInfluencerSchema.id, id),
      or(eq(aiInfluencerSchema.orgId, orgId!), eq(aiInfluencerSchema.isSystem, true)),
    ))
    .limit(1);

  if (!influencer) {
    return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
  }

  // ── Gates ───────────────────────────────────────────────────────
  if (influencer.loraStatus !== 'ready') {
    return NextResponse.json(
      { error: 'Identity training must be complete before generating video', currentStatus: influencer.loraStatus },
      { status: 400 },
    );
  }
  // Nano Banana doesn't need loraModelId — reference images used directly
  if (influencer.trainingMode !== 'nano_banana' && !influencer.loraModelId) {
    return NextResponse.json(
      { error: 'Identity model not available. Complete training first.' },
      { status: 400 },
    );
  }
  if (!influencer.voiceId) {
    return NextResponse.json(
      { error: 'No voice assigned. Select a voice in the wizard first.' },
      { status: 400 },
    );
  }

  // ── Parse inputs ────────────────────────────────────────────────
  const script = String(body.script || '').trim();
  if (script.length < 20) {
    return NextResponse.json(
      { error: 'Script must be at least 20 characters' },
      { status: 400 },
    );
  }
  if (script.length > 5000) {
    return NextResponse.json(
      { error: 'Script must be under 5000 characters' },
      { status: 400 },
    );
  }

  const aspect = VALID_ASPECTS.includes(body.aspect as typeof VALID_ASPECTS[number])
    ? (body.aspect as typeof VALID_ASPECTS[number])
    : '9:16';
  const duration = VALID_DURATIONS.includes(body.duration as typeof VALID_DURATIONS[number])
    ? (body.duration as typeof VALID_DURATIONS[number])
    : 5;
  const i2vModelId = String(body.i2vModelId || DEFAULT_I2V_MODEL).trim();
  const i2vModel = getModel(i2vModelId);
  if (!i2vModel || i2vModel.kind !== 'video') {
    return NextResponse.json(
      { error: `Invalid i2v model: ${i2vModelId}` },
      { status: 400 },
    );
  }

  const lipsyncModel = getModel('veed-lipsync');
  if (!lipsyncModel) {
    return NextResponse.json(
      { error: 'Lipsync model not configured' },
      { status: 500 },
    );
  }

  // ── Step 0: Reserve credits BEFORE any paid API calls ──────────
  const credits = estimateCredits(i2vModel, { seconds: duration }) + estimateCredits(lipsyncModel);
  const motionPrompt = 'A person speaking naturally, slight head movement, looking at camera. Professional lighting, smooth motion.';

  const [job] = await db
    .insert(aiStudioJobSchema)
    .values({
      orgId: orgId!,
      userId: userId ?? null,
      modelId: i2vModelId,
      kind: 'video-lipsync',
      status: 'reserved',
      creditsReserved: credits,
      input: {
        prompt: motionPrompt,
        aspect,
        seconds: duration,
        chain: ['i2v', 'lipsync'],
        lipsyncModelId: lipsyncModel.id,
        influencerId: id,
        script: script.slice(0, 500),
      },
    })
    .returning();
  if (!job) {
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
  }

  try {
    await reserveCredits(orgId!, job.id, credits);
  } catch {
    await db.delete(aiStudioJobSchema).where(eq(aiStudioJobSchema.id, job.id));
    return NextResponse.json(
      { error: 'Insufficient AI credits', code: 'INSUFFICIENT_CREDITS' },
      { status: 402 },
    );
  }

  // ── Step 1: TTS ─────────────────────────────────────────────────
  let audioUrl: string;
  try {
    const tts = await textToSpeech({
      text: script,
      voiceId: influencer.voiceId,
      orgId: orgId!,
      prefix: `influencer_${id}`,
    });
    audioUrl = tts.audioUrl;
  } catch (err) {
    console.error('[Influencer] TTS failed:', err);
    try {
      await db.delete(aiStudioJobSchema).where(eq(aiStudioJobSchema.id, job.id));
    } catch { /* best effort */ }
    return NextResponse.json(
      { error: `TTS generation failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  // ── Step 2: Face-consistent still (identity model) ──────────────
  let faceImageUrl: string;
  try {
    const facePrompt = `${FACE_STILL_PROMPT} A ${influencer.gender || ''} ${influencer.ethnicity || ''} person, ${influencer.ageRange || 'adult'} age range.`;

    // Nano Banana: use reference images directly via image engine
    if (influencer.trainingMode === 'nano_banana') {
      const refs = (influencer.referenceImageUrls as string[]) || [];
      const nanoRes = await fetch(`${IMAGE_ENGINE_URL}/render/nano-banana-generate`, {
        method: 'POST',
        signal: AbortSignal.timeout(180_000),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ENGINE_API_KEY}`,
        },
        body: JSON.stringify({
          prompt: facePrompt,
          imageUrls: refs,
          numImages: 1,
          aspectRatio: '1:1',
          resolution: '1K',
        }),
      });
      if (!nanoRes.ok) {
        throw new Error(`Nano Banana face still failed HTTP ${nanoRes.status}`);
      }
      const nanoData = await nanoRes.json() as { imageUrl: string };
      if (!nanoData.imageUrl) {
        throw new Error('Nano Banana face still returned no image');
      }
      faceImageUrl = nanoData.imageUrl;
    } else {
      // FLUX.2 LoRA: use trained LoRA weights
      const faceInput = {
        prompt: facePrompt,
        image_size: falImageSizeFor(aspect),
        num_images: 1,
        loras: [{ path: influencer.loraModelId, scale: 0.9 }],
        enable_safety_checker: true,
      };
      const faceJob = await submitFalJob({
        falModel: FAL_FLUX_LORA,
        input: faceInput,
        webhookUrl: buildWebhookUrl(),
      });

      // Poll for completion
      const FACE_POLL_MS = 1500;
      const FACE_MAX_POLLS = 60;
      let faceStatus: string | undefined;
      for (let i = 0; i < FACE_MAX_POLLS; i++) {
        const status = await getFalStatus(FAL_FLUX_LORA, faceJob.request_id);
        if (status.status === 'COMPLETED') {
          faceStatus = 'COMPLETED'; break;
        }
        if (status.status === 'FAILED') {
          faceStatus = 'FAILED'; break;
        }
        await new Promise(r => setTimeout(r, FACE_POLL_MS));
      }
      if (faceStatus !== 'COMPLETED') {
        throw new Error(`Face still ${faceStatus || 'timed out'} after ${FACE_MAX_POLLS * FACE_POLL_MS / 1000}s`);
      }

      const faceResult = await getFalResult<Record<string, unknown>>(FAL_FLUX_LORA, faceJob.request_id);
      const media = extractMediaFromFalPayload(faceResult);
      if (!media.imageUrl) {
        try {
          await db.delete(aiStudioJobSchema).where(eq(aiStudioJobSchema.id, job.id));
        } catch { /* best effort */ }
        return NextResponse.json(
          { error: 'Face still generation produced no image' },
          { status: 502 },
        );
      }
      faceImageUrl = media.imageUrl;
    }
  } catch (err) {
    console.error('[Influencer] Face still failed:', err);
    try {
      await db.delete(aiStudioJobSchema).where(eq(aiStudioJobSchema.id, job.id));
    } catch { /* best effort */ }
    return NextResponse.json(
      { error: `Face generation failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  // Update job input with generated media URLs
  await db
    .update(aiStudioJobSchema)
    .set({
      input: {
        prompt: motionPrompt,
        aspect,
        referenceImageUrl: faceImageUrl,
        audioUrl,
        seconds: duration,
        chain: ['i2v', 'lipsync'],
        lipsyncModelId: lipsyncModel.id,
        influencerId: id,
        script: script.slice(0, 500),
      },
    })
    .where(eq(aiStudioJobSchema.id, job.id));

  try {
    const i2vInput = buildFalInput(i2vModel, {
      prompt: motionPrompt,
      imageUrl: faceImageUrl,
      aspect,
      seconds: duration,
    });
    const submitted = await submitFalJob({
      falModel: i2vModel.falModel,
      input: i2vInput,
      webhookUrl: buildWebhookUrl(),
    });

    await db
      .update(aiStudioJobSchema)
      .set({ status: 'queued', falRequestId: submitted.request_id })
      .where(eq(aiStudioJobSchema.id, job.id));

    // Bump influencer usage count
    await db
      .update(aiInfluencerSchema)
      .set({ usageCount: (influencer.usageCount ?? 0) + 1, updatedAt: new Date() })
      .where(eq(aiInfluencerSchema.id, id));

    return NextResponse.json({
      jobId: job.id,
      status: 'queued',
      statusUrl: submitted.status_url,
    });
  } catch (err) {
    // Refund handled by reconcile path — mark failed directly since we never
    // got past submission.
    console.error('[Influencer] Chain kick failed:', err);
    await db
      .update(aiStudioJobSchema)
      .set({ status: 'failed', errorMessage: err instanceof Error ? err.message : String(err) })
      .where(eq(aiStudioJobSchema.id, job.id));
    return NextResponse.json(
      { error: `Video pipeline kickoff failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
}
