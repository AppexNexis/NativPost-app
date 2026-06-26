import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import {
  engineAuthHeaders,
  fetchBrandTokens,
  saveMediaAsset,
  spendAiCredits,
  VIDEO_ENGINE_URL,
} from '@/lib/ai-studio/server';
import { estimateTalkingHeadCredits, estimateVideoCredits } from '@/lib/ai-studio';

export async function POST(request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const subMode = (body.subMode as string) || 'video';

  try {
    if (subMode === 'talking-head-ugc') {
      return await generateTalkingHeadUgc(orgId!, body);
    }
    return await generateAIVideo(orgId!, body);
  } catch (err) {
    console.error(`[AI Studio Video /${subMode}] failed:`, err);
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'INSUFFICIENT_CREDITS') {
      return NextResponse.json({ error: 'Insufficient AI credits. Please purchase more credits to continue.', code: 'INSUFFICIENT_CREDITS' }, { status: 402 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── AI Video (text-to-video / image-to-video) ────────────────────────────────

async function generateAIVideo(orgId: string, body: Record<string, unknown>) {
  const prompt = (body.prompt as string) || '';
  if (!prompt.trim()) throw new Error('Prompt is required');

  const duration = Number(body.duration) || 5;
  const aspectRatio = (body.aspectRatio as string) || '9:16';
  const modelId = (body.modelId as string) || 'pixverse-v6';
  const referenceImageUrl = (body.referenceImageUrl as string) || undefined;
  const credits = estimateVideoCredits(modelId, duration);

  const preferOrder = modelId === 'kling-v3-pro'
    ? ['kling', 'pixverse', 'sedance']
    : modelId === 'sedance-2.0'
      ? ['sedance', 'pixverse', 'kling']
      : ['pixverse', 'kling', 'sedance'];

  const res = await fetch(`${VIDEO_ENGINE_URL}/render/ai-video`, {
    method: 'POST',
    headers: engineAuthHeaders(),
    body: JSON.stringify({
      prompt,
      duration,
      aspectRatio,
      preferOrder,
      referenceImageUrl,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI video engine failed: ${text}`);
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
    throw new Error(data.error || 'AI video generation failed');
  }

  const asset = await saveMediaAsset(orgId, {
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
      referenceImageUrl,
    },
    tags: ['ai-generated', 'ai-video', data.model || modelId],
  });

  const { wallet } = await spendAiCredits(orgId, credits, {
    type: 'generation',
    description: `${modelId} ${duration}s video`,
  });

  return NextResponse.json({
    success: true,
    savedAssets: [asset],
    wallet,
    remainingCredits: wallet.monthly.limit - wallet.monthly.used + wallet.addon.remaining,
  });
}

// ── Talking Head UGC (fallback to branded slideshow) ─────────────────────────

async function generateTalkingHeadUgc(orgId: string, body: Record<string, unknown>) {
  const script = (body.script as string) || '';
  if (!script.trim()) throw new Error('Script is required');

  const duration = Number(body.duration) || 5;
  const language = (body.language as string) || 'en';
  const captions = Boolean(body.captions);
  const referenceImageUrl = (body.referenceImageUrl as string) || undefined;

  const wordCount = script.trim().split(/\s+/).length;
  const credits = estimateTalkingHeadCredits(wordCount, duration);

  const tokens = await fetchBrandTokens(orgId);

  // Fallback: generate a slideshow-style video using the reference image + script.
  const res = await fetch(`${VIDEO_ENGINE_URL}/render`, {
    method: 'POST',
    headers: engineAuthHeaders(),
    body: JSON.stringify({
      caption: script,
      brandName: tokens.brandName,
      brandPrimary: tokens.brandPrimary,
      brandSecondary: tokens.brandSecondary,
      logoUrl: tokens.logoUrl,
      industry: tokens.industry,
      imageStyle: 'cinematic',
      contentMode: 'normal',
      photoTier: 'none',
      ...(referenceImageUrl ? { images: [referenceImageUrl] } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Talking-head engine failed: ${text}`);
  }

  const data = (await res.json()) as {
    vertical?: string;
    square?: string;
    durationSeconds?: number;
  };

  const url = data.vertical || data.square;
  if (!url) throw new Error('Talking-head engine returned no video');

  const asset = await saveMediaAsset(orgId, {
    url,
    thumbnailUrl: url,
    assetType: 'talking_head_ugc',
    aspectRatio: data.vertical ? '9:16' : '1:1',
    source: 'remotion-fallback',
    description: script,
    durationSeconds: data.durationSeconds ?? duration,
    aiMetadata: {
      script,
      language,
      captions,
      wordCount,
      referenceImageUrl,
    },
    tags: ['ai-generated', 'talking-head-ugc'],
  });

  const { wallet } = await spendAiCredits(orgId, credits, {
    type: 'generation',
    description: `Talking Head UGC · ${wordCount} words · ${duration}s`,
  });

  return NextResponse.json({
    success: true,
    savedAssets: [asset],
    wallet,
    remainingCredits: wallet.monthly.limit - wallet.monthly.used + wallet.addon.remaining,
  });
}
