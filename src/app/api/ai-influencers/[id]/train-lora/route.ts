import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { buildInfluencerPrompt } from '@/lib/ai-influencers/build-prompt';
import { commitCredits, refundCredits, reserveCredits } from '@/lib/ai-studio/server';
import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { aiInfluencerSchema } from '@/models/Schema';

const IMAGE_ENGINE_URL = process.env.NATIVPOST_IMAGE_URL || 'http://localhost:4000';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

type RouteParams = { params: Promise<{ id: string }> };

const MIN_REFERENCE_IMAGES_LORA = 5;
const MIN_REFERENCE_IMAGES_NANO = 1;
const TRAINING_CREDITS = 250;
const NANO_BANANA_SETUP_CREDITS = 20;

function buildDefaultCaption(name: string | null): string {
  if (!name) {
    return 'a photo of a person';
  }
  return `a photo of ${name.trim()}`;
}

// -----------------------------------------------------------
// POST /api/ai-influencers/[id]/train-lora
//
// Identity Lock (flux_lora): Submit a LoRA training job via the
//   image engine. Reserves 250 credits; committed on webhook OK.
//
// Instant Identity (nano_banana): Generate base image synchronously
//   via Nano Banana Pro. Reserves 20 credits; committed immediately.
// -----------------------------------------------------------
export async function POST(request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { id } = await params;

  let trainingMode: string | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    trainingMode = body.trainingMode || 'flux_lora';
  } catch {
    trainingMode = 'flux_lora';
  }

  if (!['flux_lora', 'nano_banana'].includes(trainingMode)) {
    return NextResponse.json({ error: `Invalid trainingMode: ${trainingMode}` }, { status: 400 });
  }

  const isNano = trainingMode === 'nano_banana';
  const minRefs = isNano ? MIN_REFERENCE_IMAGES_NANO : MIN_REFERENCE_IMAGES_LORA;
  const setupCredits = isNano ? NANO_BANANA_SETUP_CREDITS : TRAINING_CREDITS;
  const reservationId = `influencer-train-${id}`;

  try {
    const [influencer] = await db
      .select()
      .from(aiInfluencerSchema)
      .where(and(eq(aiInfluencerSchema.id, id), eq(aiInfluencerSchema.orgId, orgId!)))
      .limit(1);

    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

    if (influencer.loraStatus === 'training') {
      return NextResponse.json(
        { error: 'Training already in progress', jobId: influencer.loraTrainingJobId },
        { status: 409 },
      );
    }

    const refs = (influencer.referenceImageUrls as string[]) || [];
    if (refs.length < minRefs) {
      return NextResponse.json(
        { error: `At least ${minRefs} reference images required`, count: refs.length },
        { status: 400 },
      );
    }

    // Reserve credits
    try {
      await reserveCredits(orgId!, reservationId, setupCredits);
    } catch {
      return NextResponse.json(
        { error: 'Insufficient AI credits', code: 'INSUFFICIENT_CREDITS' },
        { status: 402 },
      );
    }

    // ── Nano Banana Pro: Instant Identity ──────────────────────
    if (isNano) {
      console.log(`[TrainLoRA] Nano Banana setup for ${influencer.name} with ${refs.length} refs`);

      const prompt = buildInfluencerPrompt({
        name: influencer.name,
        gender: influencer.gender,
        ageRange: influencer.ageRange,
        ethnicity: influencer.ethnicity,
        hairStyle: influencer.hairStyle,
        hairColor: influencer.hairColor,
        bodyType: influencer.bodyType,
        fashionStyle: influencer.fashionStyle,
        poseStyle: influencer.poseStyle,
        backgroundPreference: influencer.backgroundPreference,
      });

      const engineRes = await fetch(`${IMAGE_ENGINE_URL}/render/nano-banana-generate`, {
        method: 'POST',
        signal: AbortSignal.timeout(180_000),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ENGINE_API_KEY}`,
        },
        body: JSON.stringify({
          prompt,
          imageUrls: refs,
          numImages: 1,
          aspectRatio: '1:1',
          resolution: '1K',
        }),
      });

      if (!engineRes.ok) {
        const errText = await engineRes.text();
        console.error('[TrainLoRA] Nano Banana engine error:', engineRes.status, errText);
        await refundCredits(orgId!, reservationId, NANO_BANANA_SETUP_CREDITS, 'Nano Banana generation failed');
        return NextResponse.json(
          { error: 'Identity setup failed', detail: errText },
          { status: 502 },
        );
      }

      const { imageUrl } = await engineRes.json() as { imageUrl: string };

      // Append base image to reference images for richer conditioning
      const updatedRefs = [...refs];
      if (imageUrl && !updatedRefs.includes(imageUrl)) {
        updatedRefs.push(imageUrl);
      }

      await db
        .update(aiInfluencerSchema)
        .set({
          trainingMode: 'nano_banana',
          loraStatus: 'ready',
          baseImageUrl: imageUrl,
          referenceImageUrls: updatedRefs,
          updatedAt: new Date(),
        })
        .where(and(eq(aiInfluencerSchema.id, id), eq(aiInfluencerSchema.orgId, orgId!)));

      await commitCredits(orgId!, reservationId, NANO_BANANA_SETUP_CREDITS, 'Instant Identity setup');

      console.log(`[TrainLoRA] Nano Banana setup complete for ${influencer.name}`);
      return NextResponse.json({ success: true, imageUrl, mode: 'nano_banana' });
    }

    // ── FLUX.2 LoRA: Identity Lock ──────────────────────────────
    console.log(`[TrainLoRA] FLUX.2 LoRA training for ${influencer.name} with ${refs.length} refs`);

    const defaultCaption = buildDefaultCaption(influencer.name);

    const engineRes = await fetch(`${IMAGE_ENGINE_URL}/render/lora-train`, {
      method: 'POST',
      signal: AbortSignal.timeout(300_000),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ENGINE_API_KEY}`,
      },
      body: JSON.stringify({ referenceImageUrls: refs, defaultCaption }),
    });

    if (!engineRes.ok) {
      const errText = await engineRes.text();
      console.error('[TrainLoRA] Engine error:', engineRes.status, errText);
      await refundCredits(orgId!, reservationId, TRAINING_CREDITS, 'Engine submission failed');
      return NextResponse.json(
        { error: 'Identity training submission failed', detail: errText },
        { status: 502 },
      );
    }

    const { requestId } = await engineRes.json() as { requestId: string };

    await db
      .update(aiInfluencerSchema)
      .set({
        trainingMode: 'flux_lora',
        loraStatus: 'training',
        loraTrainingJobId: requestId,
        updatedAt: new Date(),
      })
      .where(and(eq(aiInfluencerSchema.id, id), eq(aiInfluencerSchema.orgId, orgId!)));

    console.log(`[TrainLoRA] Job submitted: ${requestId}`);
    return NextResponse.json({ success: true, jobId: requestId }, { status: 202 });
  } catch (err) {
    console.error('[TrainLoRA] Failed:', err);
    try {
      await refundCredits(orgId!, reservationId, setupCredits, `Unexpected error: ${String(err)}`);
    } catch { /* best effort */ }
    return NextResponse.json(
      { error: `Identity setup kickoff failed: ${String(err)}` },
      { status: 500 },
    );
  }
}

// -----------------------------------------------------------
// GET /api/ai-influencers/[id]/train-lora
// Poll current training status for the influencer.
// -----------------------------------------------------------
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { id } = await params;

  const [influencer] = await db
    .select({
      loraStatus: aiInfluencerSchema.loraStatus,
      loraTrainingJobId: aiInfluencerSchema.loraTrainingJobId,
      loraModelId: aiInfluencerSchema.loraModelId,
      trainingMode: aiInfluencerSchema.trainingMode,
    })
    .from(aiInfluencerSchema)
    .where(and(eq(aiInfluencerSchema.id, id), eq(aiInfluencerSchema.orgId, orgId!)))
    .limit(1);

  if (!influencer) {
    return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
  }

  return NextResponse.json(influencer);
}
