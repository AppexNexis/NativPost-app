import { and, eq, or } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { textToSpeech } from '@/lib/ai-studio/elevenlabs';
import { extractMediaFromFalPayload, getFalResult, submitFalJob } from '@/lib/ai-studio/fal';
import { buildFalInput, buildWebhookUrl, falImageSizeFor } from '@/lib/ai-studio/job-helpers';
import { estimateCredits, getModel } from '@/lib/ai-studio/models';
import { reserveCredits } from '@/lib/ai-studio/server';
import { getDb } from '@/libs/DB';
import { aiInfluencerSchema, aiStudioJobSchema } from '@/models/Schema';

type RouteParams = { params: Promise<{ id: string }> };

const FAL_FLUX_LORA = 'fal-ai/flux-lora';

const VALID_ASPECTS = ['9:16', '1:1', '16:9'] as const;
const VALID_DURATIONS = [5, 8, 10] as const;

// Default i2v model for the chained talking-head pipeline.
const DEFAULT_I2V_MODEL = 'seedance-2-i2v';
const FACE_STILL_PROMPT = 'Professional headshot, soft studio lighting, looking directly at camera, neutral expression, sharp focus on face, clean background.';

// -----------------------------------------------------------
// POST /api/ai-influencers/[id]/generate-video
// Orchestrate a face-locked talking-head video from an influencer.
//
// Pipeline:
//   1. TTS via ElevenLabs → audio URL
//   2. Face-consistent still via Flux+LoRA → image URL
//   3. Chained i2v→lipsync via existing AI Studio pipeline
// -----------------------------------------------------------
export async function POST(request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId, userId } = await getAuthContext();
  if (error) return error;

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
      { error: 'LoRA must be ready before generating video', currentStatus: influencer.loraStatus },
      { status: 400 },
    );
  }
  if (!influencer.loraModelId) {
    return NextResponse.json(
      { error: 'No LoRA model available. Train the face lock first.' },
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
    return NextResponse.json(
      { error: `TTS generation failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  // ── Step 2: Face-consistent still (Flux + LoRA) ─────────────────
  let faceImageUrl: string;
  try {
    const facePrompt = `${FACE_STILL_PROMPT} A ${influencer.gender || ''} ${influencer.ethnicity || ''} person, ${influencer.ageRange || 'adult'} age range.`;
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
      webhookUrl: buildWebhookUrl(), // unused since we poll
    });
    const faceResult = await getFalResult<Record<string, unknown>>(FAL_FLUX_LORA, faceJob.request_id);
    const media = extractMediaFromFalPayload(faceResult);
    if (!media.imageUrl) {
      return NextResponse.json(
        { error: 'Face still generation produced no image' },
        { status: 502 },
      );
    }
    faceImageUrl = media.imageUrl;
  } catch (err) {
    console.error('[Influencer] Face still failed:', err);
    return NextResponse.json(
      { error: `Face generation failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  // ── Step 3: Chained i2v → lipsync ───────────────────────────────
  const lipsyncModel = getModel('veed-lipsync');
  if (!lipsyncModel) {
    return NextResponse.json(
      { error: 'Lipsync model not configured' },
      { status: 500 },
    );
  }

  const motionPrompt = `A person speaking naturally, slight head movement, looking at camera. Professional lighting, smooth motion.`;
  const credits = estimateCredits(i2vModel, { seconds: duration }) + estimateCredits(lipsyncModel);

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
        referenceImageUrl: faceImageUrl,
        audioUrl,
        seconds: duration,
        chain: ['i2v', 'lipsync'],
        lipsyncModelId: lipsyncModel.id,
        influencerId: id,
        script: script.slice(0, 500),
      },
    })
    .returning();
  if (!job) return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });

  try {
    await reserveCredits(orgId!, job.id, credits);
  } catch (err) {
    await db.delete(aiStudioJobSchema).where(eq(aiStudioJobSchema.id, job.id));
    return NextResponse.json(
      { error: 'Insufficient AI credits', code: 'INSUFFICIENT_CREDITS' },
      { status: 402 },
    );
  }

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
