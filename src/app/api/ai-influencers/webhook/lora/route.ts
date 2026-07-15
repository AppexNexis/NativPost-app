import { Buffer } from 'node:buffer';

import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { type FalWebhookPayload, friendlyFalWebhookError, verifyFalWebhook } from '@/lib/ai-studio/fal';
import { commitCredits, refundCredits } from '@/lib/ai-studio/server';
import { getDb } from '@/libs/DB';
import { aiInfluencerSchema } from '@/models/Schema';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * fal.ai webhook receiver for AI Influencer identity training.
 *
 * Distinct from the AI Studio webhook because we key on
 * ai_influencer.lora_training_job_id (not ai_studio_job.fal_request_id) and
 * write identity model metadata straight onto the influencer row.
 *
 * Commits/refunds the 250 credits reserved at train-lora submission time.
 *
 * Signature verification uses the same JWKS Ed25519 flow as ai-studio. Can
 * be soft-disabled in local dev with FAL_WEBHOOK_INSECURE=1.
 */
export async function POST(request: NextRequest) {
  const rawBodyBuf = Buffer.from(await request.arrayBuffer());
  const insecure = process.env.FAL_WEBHOOK_INSECURE === '1';

  if (!insecure) {
    const ok = await verifyFalWebhook(
      {
        requestId: request.headers.get('x-fal-webhook-request-id'),
        userId: request.headers.get('x-fal-webhook-user-id'),
        timestamp: request.headers.get('x-fal-webhook-timestamp'),
        signature: request.headers.get('x-fal-webhook-signature'),
      },
      rawBodyBuf,
    );
    if (!ok) {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }
  }

  let payload: FalWebhookPayload;
  try {
    payload = JSON.parse(rawBodyBuf.toString('utf8')) as FalWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const requestId = payload.request_id || payload.gateway_request_id;
  if (!requestId) {
    return NextResponse.json({ error: 'missing request_id' }, { status: 400 });
  }

  const db = await getDb();
  const [influencer] = await db
    .select()
    .from(aiInfluencerSchema)
    .where(eq(aiInfluencerSchema.loraTrainingJobId, requestId))
    .limit(1);

  if (!influencer) {
    // Idempotent: no matching influencer means we already reconciled or the
    // request id is for a job we don't own.
    return NextResponse.json({ ok: true, matched: false });
  }
  if (influencer.loraStatus === 'ready' || influencer.loraStatus === 'failed') {
    return NextResponse.json({ ok: true, alreadyFinal: true });
  }

  if (payload.status === 'OK') {
    // fal-ai/flux-lora-fast-training payload:
    //   { diffusers_lora_file: { url }, config_file: { url } }
    const output = payload.payload as
      | { diffusers_lora_file?: { url?: string }; config_file?: { url?: string } }
      | undefined;
    const loraUrl = output?.diffusers_lora_file?.url;
    const reservationId = `influencer-train-${influencer.id}`;
    if (!loraUrl) {
      await refundCredits(influencer.orgId!, reservationId, 250, 'No LoRA file in webhook payload');
      await db
        .update(aiInfluencerSchema)
        .set({
          loraStatus: 'failed',
          updatedAt: new Date(),
        })
        .where(eq(aiInfluencerSchema.id, influencer.id));
      return NextResponse.json({ ok: true, matched: true, outcome: 'no-lora-file' });
    }

    await commitCredits(influencer.orgId!, reservationId, 250, 'Identity training completed');
    await db
      .update(aiInfluencerSchema)
      .set({
        loraStatus: 'ready',
        loraModelId: loraUrl,
        updatedAt: new Date(),
      })
      .where(eq(aiInfluencerSchema.id, influencer.id));
    return NextResponse.json({ ok: true, matched: true, outcome: 'ready' });
  }

  // ERROR
  const errorMessage = friendlyFalWebhookError(payload.error);
  try {
    await refundCredits(influencer.orgId!, `influencer-train-${influencer.id}`, 250, `Training failed: ${errorMessage}`);
  } catch { /* best effort */ }
  await db
    .update(aiInfluencerSchema)
    .set({
      loraStatus: 'failed',
      description: `${influencer.description || ''}\n\n[Identity training failed: ${errorMessage}]`.slice(0, 4000),
      updatedAt: new Date(),
    })
    .where(eq(aiInfluencerSchema.id, influencer.id));
  return NextResponse.json({ ok: true, matched: true, outcome: 'failed', error: errorMessage });
}
