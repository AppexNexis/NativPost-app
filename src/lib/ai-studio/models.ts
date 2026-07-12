// AI Studio model registry: single source of truth.
// Consumed by API routes AND UI. Every generation path picks a model id
// from this registry so we can never render options the backend cannot handle.

export type AiStudioKind = 'image' | 'image-edit' | 'video' | 'video-lipsync';

export interface AiStudioModel {
  id: string;
  label: string;
  kind: AiStudioKind;
  falModel: string;
  /** Integer credits charged per generation. Video credits are per default duration. */
  credits: number;
  /** Whether credits scale with the number of seconds for video models. */
  perSecond?: boolean;
  /** Aspect ratios this model supports. */
  aspects: Array<'1:1' | '9:16' | '16:9' | '4:5'>;
  /** Duration options for video models. First entry is the default. */
  durations?: number[];
  /** Whether the model requires a reference image URL. */
  requiresImage?: boolean;
  /** Whether the model requires an audio URL (lipsync). */
  requiresAudio?: boolean;
  /** Approximate USD cost captured for admin reconciliation. */
  costUsd?: number;
  description?: string;
}

export const AI_STUDIO_MODELS: AiStudioModel[] = [
  {
    id: 'flux-dev',
    label: 'FLUX.1 [dev]',
    kind: 'image',
    falModel: 'fal-ai/flux/dev',
    credits: 3,
    aspects: ['1:1', '9:16', '16:9', '4:5'],
    costUsd: 0.025,
    description: 'Fast, high-quality text-to-image.',
  },
  {
    id: 'gpt-image-2',
    label: 'GPT Image 2',
    kind: 'image',
    falModel: 'openai/gpt-image-2',
    credits: 15,
    aspects: ['1:1', '9:16', '16:9'],
    costUsd: 0.15,
    description: 'Premium photorealistic text-to-image.',
  },
  {
    id: 'gpt-image-2-edit',
    label: 'GPT Image 2 Edit',
    kind: 'image-edit',
    falModel: 'openai/gpt-image-2/edit',
    credits: 20,
    aspects: ['1:1', '9:16', '16:9'],
    requiresImage: true,
    costUsd: 0.20,
    description: 'Edit an existing image with a text prompt.',
  },
  {
    id: 'pixverse-v6-i2v',
    label: 'Pixverse V6',
    kind: 'video',
    falModel: 'fal-ai/pixverse/v6/image-to-video',
    credits: 40,
    perSecond: false,
    aspects: ['9:16', '1:1', '16:9'],
    durations: [5, 8],
    requiresImage: true,
    costUsd: 0.50,
    description: 'Cheap 720p image-to-video.',
  },
  {
    id: 'kling-v3-turbo-pro-i2v',
    label: 'Kling V3 Turbo Pro',
    kind: 'video',
    falModel: 'fal-ai/kling-video/v3/turbo/pro/image-to-video',
    credits: 80,
    perSecond: false,
    aspects: ['9:16', '1:1', '16:9'],
    durations: [5, 10],
    requiresImage: true,
    costUsd: 0.70,
    description: 'Cinematic mid-tier image-to-video.',
  },
  {
    id: 'seedance-2-i2v',
    label: 'Seedance 2.0 Pro',
    kind: 'video',
    falModel: 'bytedance/seedance-2.0/image-to-video',
    credits: 160,
    perSecond: false,
    aspects: ['9:16', '1:1', '16:9'],
    durations: [5, 8, 10, 12],
    requiresImage: true,
    costUsd: 1.51,
    description: 'Highest-quality 1080p image-to-video.',
  },
  {
    id: 'veed-lipsync',
    label: 'Veed Lipsync',
    kind: 'video-lipsync',
    falModel: 'veed/lipsync',
    credits: 30,
    aspects: ['9:16', '1:1', '16:9'],
    requiresImage: true,
    requiresAudio: true,
    costUsd: 0.30,
    description: 'Sync a video to a spoken audio track.',
  },
];

export type AiStudioModelId = (typeof AI_STUDIO_MODELS)[number]['id'];

export function getModel(id: string): AiStudioModel | undefined {
  return AI_STUDIO_MODELS.find(m => m.id === id);
}

export function getModelsByKind(kind: AiStudioKind): AiStudioModel[] {
  return AI_STUDIO_MODELS.filter(m => m.kind === kind);
}

export function estimateCredits(model: AiStudioModel, opts: { seconds?: number } = {}): number {
  if (model.perSecond && opts.seconds) {
    return model.credits * opts.seconds;
  }
  return model.credits;
}

// ── Templates (prompt presets, NOT hidden generation modes) ─────────────────

export interface AiStudioTemplate {
  id: string;
  label: string;
  kind: AiStudioKind;
  prompt: string;
  defaultModelId: AiStudioModelId;
  defaultAspect: '1:1' | '9:16' | '16:9' | '4:5';
}

export const AI_STUDIO_TEMPLATES: AiStudioTemplate[] = [
  {
    id: 'quote-card',
    label: 'Quote Card',
    kind: 'image',
    prompt:
      'Minimal quote card on a soft gradient background. Bold sans-serif headline centered, subtle brand color accent, 9:16 mobile poster composition.',
    defaultModelId: 'flux-dev',
    defaultAspect: '9:16',
  },
  {
    id: 'announcement-card',
    label: 'Announcement Card',
    kind: 'image',
    prompt:
      'Announcement poster with bold headline, secondary supporting line, and a soft geometric background. Studio lighting, editorial layout.',
    defaultModelId: 'flux-dev',
    defaultAspect: '9:16',
  },
  {
    id: 'stat-card',
    label: 'Stat Card',
    kind: 'image',
    prompt:
      'Large hero statistic centered on a clean editorial background, small supporting subline underneath, muted brand palette.',
    defaultModelId: 'flux-dev',
    defaultAspect: '1:1',
  },
  {
    id: 'product-hero',
    label: 'Product Hero',
    kind: 'image',
    prompt:
      'Cinematic product hero photograph, dramatic softbox lighting, shallow depth of field, seamless studio background.',
    defaultModelId: 'gpt-image-2',
    defaultAspect: '16:9',
  },
  {
    id: 'ugc-style',
    label: 'UGC Style Motion',
    kind: 'video',
    prompt: 'Handheld natural motion, warm daylight, casual creator vibe. Slight camera drift and subject presence.',
    defaultModelId: 'pixverse-v6-i2v',
    defaultAspect: '9:16',
  },
  {
    id: 'cinematic-motion',
    label: 'Cinematic Motion',
    kind: 'video',
    prompt: 'Slow cinematic dolly, shallow depth of field, motivated key light, film grain, elegant camera drift.',
    defaultModelId: 'kling-v3-turbo-pro-i2v',
    defaultAspect: '16:9',
  },
  {
    id: 'product-demo',
    label: 'Product Demo Motion',
    kind: 'video',
    prompt: 'Rotating product showcase, clean studio lighting, subtle motion emphasizing texture and material.',
    defaultModelId: 'seedance-2-i2v',
    defaultAspect: '9:16',
  },
];

export function templatesForKind(kind: AiStudioKind): AiStudioTemplate[] {
  return AI_STUDIO_TEMPLATES.filter(t => t.kind === kind);
}
