import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { refundCredits, reserveCredits } from '@/lib/ai-studio/server';
import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { aiInfluencerSchema } from '@/models/Schema';

const IMAGE_ENGINE_URL = process.env.NATIVPOST_IMAGE_URL || 'http://localhost:4000';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

type RouteParams = { params: Promise<{ id: string }> };

const MIN_REFERENCE_IMAGES = 5;
const TRAINING_CREDITS = 250;

function buildDefaultCaption(name: string | null): string {
  if (!name) {
    return 'a photo of a person';
  }
  return `a photo of ${name.trim()}`;
}

// -----------------------------------------------------------
// POST /api/ai-influencers/[id]/train-lora
// Submit a face-lock identity training job via the image engine (flux-2-trainer).
// Reserves 250 credits; committed on webhook OK, refunded on error.
// -----------------------------------------------------------
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { id } = await params;

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
    if (refs.length < MIN_REFERENCE_IMAGES) {
      return NextResponse.json(
        { error: `At least ${MIN_REFERENCE_IMAGES} reference images required to start training`, count: refs.length },
        { status: 400 },
      );
    }

    const defaultCaption = buildDefaultCaption(influencer.name);

    // Reserve credits before submitting to engine
    try {
      await reserveCredits(orgId!, reservationId, TRAINING_CREDITS);
    } catch {
      return NextResponse.json(
        { error: 'Insufficient AI credits', code: 'INSUFFICIENT_CREDITS' },
        { status: 402 },
      );
    }

    console.log(`[TrainLoRA] Submitting via engine for ${influencer.name} with ${refs.length} images`);

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
      await refundCredits(orgId!, reservationId, TRAINING_CREDITS, `Unexpected error: ${String(err)}`);
    } catch { /* best effort */ }
    return NextResponse.json(
      { error: `Identity training kickoff failed: ${String(err)}` },
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
    })
    .from(aiInfluencerSchema)
    .where(and(eq(aiInfluencerSchema.id, id), eq(aiInfluencerSchema.orgId, orgId!)))
    .limit(1);

  if (!influencer) {
    return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
  }

  return NextResponse.json(influencer);
}
