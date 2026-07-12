// Shared helpers between AI Studio submit routes and the Fal webhook route.

import type { AiStudioModel } from './models';

export function buildWebhookUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';
  if (!base) {
    throw new Error('NEXT_PUBLIC_APP_URL is not set');
  }
  return `${base.replace(/\/$/, '')}/api/ai-studio/webhook/fal`;
}

export function aspectToDimensions(aspect: string): { width: number; height: number } {
  switch (aspect) {
    case '1:1': return { width: 1024, height: 1024 };
    case '9:16': return { width: 1080, height: 1920 };
    case '16:9': return { width: 1920, height: 1080 };
    case '4:5': return { width: 1080, height: 1350 };
    default: return { width: 1024, height: 1024 };
  }
}

/**
 * Fal FLUX exposes `image_size` as either a preset ("square_hd", "portrait_16_9",
 * "landscape_16_9") or `{ width, height }`. We hand it `{ width, height }` from
 * our aspect map so brand-safe custom crops always work.
 */
export function falImageSizeFor(aspect: string) {
  return aspectToDimensions(aspect);
}

/** Kling accepts aspect_ratio as "9:16" | "16:9" | "1:1". */
export function normalizedFalAspect(aspect: string): '9:16' | '16:9' | '1:1' {
  if (aspect === '9:16') {
    return '9:16';
  }
  if (aspect === '16:9') {
    return '16:9';
  }
  return '1:1';
}

/**
 * GPT Image 2 uses `image_size` (not aspect_ratio) as a preset enum. Map our
 * composer aspect selector to Fal's preset names.
 * Ref: fal.ai/models/openai/gpt-image-2/edit
 */
export function gptImageSizeFor(aspect: string): 'square_hd' | 'portrait_16_9' | 'landscape_16_9' | 'portrait_4_3' | 'landscape_4_3' {
  switch (aspect) {
    case '9:16': return 'portrait_16_9';
    case '16:9': return 'landscape_16_9';
    case '4:5': return 'portrait_4_3';
    case '1:1':
    default: return 'square_hd';
  }
}

/** Build the Fal input payload per model kind + submitted user fields. */
export function buildFalInput(model: AiStudioModel, opts: {
  prompt?: string;
  imageUrl?: string;
  audioUrl?: string;
  seconds?: number;
  aspect: string;
  seed?: number;
}): Record<string, unknown> {
  const { prompt, imageUrl, audioUrl, seconds, aspect, seed } = opts;

  switch (model.id) {
    case 'flux-dev':
      return {
        prompt,
        image_size: falImageSizeFor(aspect),
        num_inference_steps: 28,
        guidance_scale: 3.5,
        num_images: 1,
        enable_safety_checker: true,
        ...(typeof seed === 'number' ? { seed } : {}),
      };
    case 'gpt-image-2':
      return {
        prompt,
        image_size: gptImageSizeFor(aspect),
        quality: 'high',
        num_images: 1,
      };
    case 'gpt-image-2-edit':
      // Docs: openai/gpt-image-2/edit accepts image_size (enum) or auto,
      // NOT aspect_ratio. Default 'auto' infers dims from the input image,
      // which matches what Playground does on a successful edit run.
      return {
        prompt,
        image_urls: imageUrl ? [imageUrl] : [],
        image_size: 'auto',
        quality: 'high',
      };
    case 'pixverse-v6-i2v':
      return {
        image_url: imageUrl,
        prompt: prompt || 'Natural motion',
        aspect_ratio: normalizedFalAspect(aspect),
        duration: seconds ?? 5,
        resolution: '720p',
      };
    case 'kling-v3-turbo-pro-i2v':
      return {
        image_url: imageUrl,
        prompt: prompt || 'Natural motion',
        aspect_ratio: normalizedFalAspect(aspect),
        duration: String(seconds ?? 5),
      };
    case 'seedance-2-i2v':
      return {
        image_url: imageUrl,
        prompt: prompt || 'Natural motion',
        aspect_ratio: normalizedFalAspect(aspect),
        duration: seconds ?? 5,
        resolution: '1080p',
      };
    case 'veed-lipsync':
      return {
        video_url: imageUrl, // parameter reused as video source
        audio_url: audioUrl,
      };
    default:
      return { prompt };
  }
}
