import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import {
  engineAuthHeaders,
  saveMediaAsset,
  spendAiCredits,
  VIDEO_ENGINE_URL,
} from '@/lib/ai-studio/server';
import { estimateVideoCredits } from '@/lib/ai-studio';

export async function POST(request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const body = await request.json() as {
    imageUrl?: string;
    prompt?: string;
    duration?: number;
    aspectRatio?: string;
    modelId?: string;
  };

  const imageUrl = body.imageUrl?.trim();
  if (!imageUrl) {
    return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 });
  }

  const prompt = body.prompt?.trim() || 'Animate this image';
  const duration = body.duration ?? 5;
  const aspectRatio = body.aspectRatio || '9:16';
  const modelId = body.modelId || 'sedance-2.0';
  const credits = estimateVideoCredits(modelId, duration);

  const preferOrder = modelId === 'kling-v3-pro'
    ? ['kling', 'pixverse', 'sedance']
    : modelId === 'pixverse-v6'
      ? ['pixverse', 'kling', 'sedance']
      : ['sedance', 'pixverse', 'kling'];

  try {
    const res = await fetch(`${VIDEO_ENGINE_URL}/render/ai-video`, {
      method: 'POST',
      headers: engineAuthHeaders(),
      body: JSON.stringify({
        prompt,
        duration,
        aspectRatio,
        preferOrder,
        referenceImageUrl: imageUrl,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Animate engine failed: ${text}`);
    }

    const data = (await res.json()) as {
      success: boolean;
      videoUrl?: string;
      thumbnailUrl?: string;
      duration?: number;
      model?: string;
      fallbackUsed?: boolean;
      error?: string;
    };

    if (!data.success || !data.videoUrl) {
      throw new Error(data.error || 'Animation failed');
    }

    const asset = await saveMediaAsset(orgId!, {
      url: data.videoUrl,
      thumbnailUrl: data.thumbnailUrl || data.videoUrl,
      assetType: 'ai_video',
      aspectRatio,
      source: data.fallbackUsed ? 'remotion-fallback' : data.model || modelId,
      description: prompt,
      durationSeconds: data.duration ?? duration,
      aiMetadata: {
        prompt,
        model: data.model || modelId,
        duration,
        referenceImageUrl: imageUrl,
        generatedFrom: 'image-animate',
      },
      tags: ['ai-generated', 'ai-video', 'image-animate', data.model || modelId],
    });

    const { wallet } = await spendAiCredits(orgId!, credits, {
      type: 'generation',
      description: `Animate image · ${modelId} · ${duration}s`,
    });

    return NextResponse.json({
      success: true,
      savedAssets: [asset],
      wallet,
      remainingCredits: wallet.monthly.limit - wallet.monthly.used + wallet.addon.remaining,
    });
  } catch (err) {
    console.error('[AI Studio Animate] failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'INSUFFICIENT_CREDITS') {
      return NextResponse.json({ error: 'Insufficient AI credits. Please purchase more credits to continue.', code: 'INSUFFICIENT_CREDITS' }, { status: 402 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
