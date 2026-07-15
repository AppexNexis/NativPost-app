import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { commitCredits, refundCredits } from '@/lib/ai-studio/server';
import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { aiInfluencerSchema } from '@/models/Schema';

const IMAGE_ENGINE_URL = process.env.NATIVPOST_IMAGE_URL || 'http://localhost:4000';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

type RouteParams = { params: Promise<{ id: string }> };

// -----------------------------------------------------------
// GET /api/ai-influencers/[id]/lora-status
// Poll the status of an identity training job. Caches result to DB.
// -----------------------------------------------------------
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

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

    // If already cached as ready/failed, return immediately
    if (influencer.loraStatus === 'ready') {
      return NextResponse.json({
        status: 'ready',
        loraModelId: influencer.loraModelId,
      });
    }
    if (influencer.loraStatus === 'failed') {
      return NextResponse.json({ status: 'failed' });
    }

    const jobId = influencer.loraTrainingJobId;
    if (!jobId) {
      return NextResponse.json({ status: 'pending' });
    }

    const engineRes = await fetch(`${IMAGE_ENGINE_URL}/render/lora-status?requestId=${encodeURIComponent(jobId)}`, {
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${ENGINE_API_KEY}`,
      },
    });

    if (!engineRes.ok) {
      const errText = await engineRes.text();
      console.error('[LoraStatus] Engine error:', engineRes.status, errText);
      return NextResponse.json({
        status: influencer.loraStatus, // stale — best effort
        jobId,
      });
    }

    const status = await engineRes.json() as {
      status: string;
      loraUrl?: string;
      error?: string;
      queuePosition?: number;
    };

    console.log(`[LoraStatus] ${id} → fal status: ${status.status}`);

    // Persist terminal states
    if (status.status === 'COMPLETED' && status.loraUrl) {
      // Re-check to avoid racing with the webhook
      const [fresh] = await db
        .select({ loraStatus: aiInfluencerSchema.loraStatus })
        .from(aiInfluencerSchema)
        .where(and(eq(aiInfluencerSchema.id, id), eq(aiInfluencerSchema.orgId, orgId!)))
        .limit(1);

      if (fresh?.loraStatus === 'ready' || fresh?.loraStatus === 'failed') {
        return NextResponse.json({
          status: fresh.loraStatus,
          loraModelId: influencer.loraModelId,
        });
      }

      await commitCredits(orgId!, `influencer-train-${id}`, 250, 'Identity training completed');

      await db
        .update(aiInfluencerSchema)
        .set({
          loraStatus: 'ready',
          loraModelId: status.loraUrl,
          updatedAt: new Date(),
        })
        .where(and(eq(aiInfluencerSchema.id, id), eq(aiInfluencerSchema.orgId, orgId!)));

      return NextResponse.json({
        status: 'ready',
        loraModelId: status.loraUrl,
      });
    }

    if (status.status === 'FAILED') {
      // Re-check to avoid racing with the webhook
      const [fresh] = await db
        .select({ loraStatus: aiInfluencerSchema.loraStatus })
        .from(aiInfluencerSchema)
        .where(and(eq(aiInfluencerSchema.id, id), eq(aiInfluencerSchema.orgId, orgId!)))
        .limit(1);

      if (fresh?.loraStatus === 'ready' || fresh?.loraStatus === 'failed') {
        return NextResponse.json({
          status: fresh.loraStatus,
          loraModelId: influencer.loraModelId,
        });
      }

      try {
        await refundCredits(orgId!, `influencer-train-${id}`, 250, `Training failed: ${status.error || 'unknown'}`);
      } catch { /* best effort */ }

      await db
        .update(aiInfluencerSchema)
        .set({
          loraStatus: 'failed',
          updatedAt: new Date(),
        })
        .where(and(eq(aiInfluencerSchema.id, id), eq(aiInfluencerSchema.orgId, orgId!)));

      return NextResponse.json({
        status: 'failed',
        error: status.error,
      });
    }

    // Still training / queued
    return NextResponse.json({
      status: status.status.toLowerCase(),
      queuePosition: status.queuePosition,
      jobId,
    });
  } catch (err) {
    console.error('[LoraStatus] Failed:', err);
    return NextResponse.json({ error: `Status check failed: ${String(err)}` }, { status: 500 });
  }
}
