import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { submitFalJob } from '@/lib/ai-studio/fal';
import { getDb } from '@/libs/DB';
import { aiInfluencerSchema } from '@/models/Schema';

type RouteParams = { params: Promise<{ id: string }> };

const FAL_LORA_TRAINER = 'fal-ai/flux-lora-fast-training';
const MIN_REFERENCE_IMAGES = 3;

function buildInfluencerWebhookUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';
  if (!base) {
    throw new Error('NEXT_PUBLIC_APP_URL is not set');
  }
  return `${base.replace(/\/$/, '')}/api/ai-influencers/webhook/lora`;
}

// -----------------------------------------------------------
// POST /api/ai-influencers/[id]/train-lora
// Kick off a fal.ai LoRA training job for face-locked generation.
// -----------------------------------------------------------
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

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
        {
          error: `At least ${MIN_REFERENCE_IMAGES} reference images required to train LoRA`,
          count: refs.length,
        },
        { status: 400 },
      );
    }

    // fal.ai flux-lora-fast-training expects a zip of images OR a list of URLs.
    // The API accepts `images_data_url` (zip) OR `images` (array of {image_url}).
    const input = {
      images_data_url: null as string | null,
      images: refs.map(url => ({ image_url: url })),
      trigger_word: sanitizeTriggerWord(influencer.name),
      steps: 1000,
      is_style: false,
    };

    const submitted = await submitFalJob({
      falModel: FAL_LORA_TRAINER,
      input,
      webhookUrl: buildInfluencerWebhookUrl(),
    });

    const [updated] = await db
      .update(aiInfluencerSchema)
      .set({
        loraStatus: 'training',
        loraTrainingJobId: submitted.request_id,
        updatedAt: new Date(),
      })
      .where(and(eq(aiInfluencerSchema.id, id), eq(aiInfluencerSchema.orgId, orgId!)))
      .returning();

    return NextResponse.json(
      {
        success: true,
        jobId: submitted.request_id,
        statusUrl: submitted.status_url,
        influencer: updated,
      },
      { status: 202 },
    );
  } catch (err) {
    console.error('[Influencer] train-lora failed:', err);
    return NextResponse.json(
      { error: `LoRA training kickoff failed: ${String(err)}` },
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
  if (error) return error;

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

// A trigger word must be a single lowercase token — fal's trainer uses it as
// the persona anchor in every prompt at inference time.
function sanitizeTriggerWord(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20);
  return base || 'persona';
}
