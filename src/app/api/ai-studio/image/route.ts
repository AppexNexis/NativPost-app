import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import {
  engineAuthHeaders,
  fetchBrandTokens,
  IMAGE_ENGINE_URL,
  saveMediaAsset,
  spendAiCredits,
  type SavedAsset,
} from '@/lib/ai-studio/server';
import { estimateImageCredits } from '@/lib/ai-studio';

const VALID_IMAGE_MODELS = ['fastlane-v8', 'gpt-image-2', 'gpt-image-2-edit'] as const;
type ImageModelId = typeof VALID_IMAGE_MODELS[number];

export async function POST(request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const modelId = (body.modelId as string) || 'fastlane-v8';
  if (!VALID_IMAGE_MODELS.includes(modelId as ImageModelId)) {
    return NextResponse.json({ error: `Invalid image model: ${modelId}` }, { status: 400 });
  }

  const quantity = Math.min(Math.max(Number(body.quantity) || 1, 1), 4);
  const credits = estimateImageCredits(modelId, quantity);
  const prompt = (body.prompt as string) || '';

  if (!prompt.trim() && modelId !== 'gpt-image-2-edit') {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
  }

  if (modelId === 'gpt-image-2-edit' && !(body.referenceImageUrl as string)?.trim()) {
    return NextResponse.json({ error: 'Reference image is required for GPT Image 2 Edit' }, { status: 400 });
  }

  try {
    const tokens = await fetchBrandTokens(orgId!);
    const savedAssets: SavedAsset[] = [];

    const aspectRatio = (body.aspectRatio as string) || '9:16';
    const format = aspectRatio === '1:1' ? 'square' : 'vertical';

    for (let i = 0; i < quantity; i++) {
      const result = await generateOneImage({
        body,
        modelId: modelId as ImageModelId,
        prompt,
        format,
        tokens,
      });

      const asset = await saveMediaAsset(orgId!, {
        url: result.url,
        thumbnailUrl: result.url,
        assetType: 'ai_image',
        aspectRatio,
        source: modelId,
        description: prompt,
        aiMetadata: {
          model: modelId,
          visualPrompt: result.visualPrompt,
          overlayHeadline: result.overlayHeadline,
          quantityIndex: i + 1,
        },
        tags: ['ai-generated', 'ai-image', modelId, aspectRatio],
      });

      savedAssets.push(asset);
    }

    const { wallet } = await spendAiCredits(orgId!, credits, {
      type: 'generation',
      description: `${quantity}x ${modelId} image`,
    });

    return NextResponse.json({
      success: true,
      savedAssets,
      wallet,
      remainingCredits: wallet.monthly.limit - wallet.monthly.used + wallet.addon.remaining,
    });
  } catch (err) {
    console.error(`[AI Studio Image /${modelId}] failed:`, err);
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'INSUFFICIENT_CREDITS') {
      return NextResponse.json({ error: 'Insufficient AI credits. Please purchase more credits to continue.', code: 'INSUFFICIENT_CREDITS' }, { status: 402 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function generateOneImage(args: {
  body: Record<string, unknown>;
  modelId: ImageModelId;
  prompt: string;
  format: 'square' | 'vertical';
  tokens: { brandName: string; brandPrimary: string; brandSecondary?: string; logoUrl?: string; fontPreference?: string; industry?: string };
}) {
  const { body, modelId, prompt, format, tokens } = args;
  const referenceImageUrl = (body.referenceImageUrl as string) || undefined;

  const quality = modelId === 'fastlane-v8' ? 'standard' : 'premium';

  const res = await fetch(`${IMAGE_ENGINE_URL}/render/ai-graphic`, {
    method: 'POST',
    headers: engineAuthHeaders(),
    body: JSON.stringify({
      topic: prompt,
      contentType: 'illustration',
      quality,
      format,
      brandName: tokens.brandName,
      brandPrimary: tokens.brandPrimary,
      brandSecondary: tokens.brandSecondary,
      logoUrl: tokens.logoUrl,
      fontPreference: tokens.fontPreference,
      industry: tokens.industry,
      visualPrompt: referenceImageUrl ? `Reference image: ${referenceImageUrl}` : undefined,
      overlayHeadline: body.overlayHeadline || undefined,
      overlaySubtext: body.overlaySubtext || undefined,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Image engine failed: ${text}`);
  }

  const data = (await res.json()) as {
    url: string;
    visualPrompt?: string;
    overlayHeadline?: string;
  };

  if (!data.url) throw new Error('Image engine returned no image URL');
  return data;
}
