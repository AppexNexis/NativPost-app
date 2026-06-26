// AI Studio constants — image & video generation studios
// These mirror the engine capabilities and provide client-side credit estimates.

export type ImageMode = 'generate' | 'talking-head-ugc';
export type VideoSubMode = 'video' | 'talking-head-ugc';

export interface ImageModelOption {
  id: string;
  label: string;
  creditsPerImage: number;
  description?: string;
  estimateSeconds?: [number, number];
}

export interface VideoModelOption {
  id: string;
  label: string;
  provider: 'pixverse' | 'kling' | 'sedance';
  durationOptions: number[];
  creditsPerSecond: number;
  description?: string;
}

export interface FormatOption {
  id: string;
  label: string;
  ratio: string;
}

export interface TemplateOption {
  id: string;
  label: string;
}

export const IMAGE_MODELS: ImageModelOption[] = [
  {
    id: 'fastlane-v8',
    label: 'Fastlane V8',
    creditsPerImage: 4,
    description: 'Fast, high-quality brand-safe images',
    estimateSeconds: [30, 60],
  },
  {
    id: 'gpt-image-2',
    label: 'GPT Image 2',
    creditsPerImage: 12,
    description: 'Premium photorealistic generation',
    estimateSeconds: [60, 120],
  },
  {
    id: 'gpt-image-2-edit',
    label: 'GPT Image 2 Edit',
    creditsPerImage: 12,
    description: 'Edit existing images with prompts',
    estimateSeconds: [60, 120],
  },
];

export const VIDEO_MODELS: VideoModelOption[] = [
  {
    id: 'pixverse-v6',
    label: 'Pixverse V6',
    provider: 'pixverse',
    durationOptions: [5, 8, 10],
    creditsPerSecond: 0,
    description: 'Free',
  },
  {
    id: 'kling-v3-pro',
    label: 'Kling v3 Pro',
    provider: 'kling',
    durationOptions: [5, 10],
    creditsPerSecond: 8,
    description: 'High-quality cinematic motion',
  },
  {
    id: 'sedance-2.0',
    label: 'Seedance 2.0',
    provider: 'sedance',
    durationOptions: [5, 8, 10],
    creditsPerSecond: 35,
    description: 'Best for image-to-video',
  },
];

export const FORMATS: FormatOption[] = [
  { id: '9:16', label: 'Vertical', ratio: '9:16' },
  { id: '1:1', label: 'Square', ratio: '1:1' },
  { id: '16:9', label: 'Landscape', ratio: '16:9' },
  { id: '4:5', label: 'Portrait', ratio: '4:5' },
];

export const DURATIONS = [5, 8, 10];

export const IMAGE_QUANTITY = [1, 2, 3, 4];

export const IMAGE_TEMPLATES: TemplateOption[] = [
  { id: 'none', label: 'No template' },
  { id: 'quote-card', label: 'Quote Card' },
  { id: 'announcement-card', label: 'Announcement' },
  { id: 'stat-card', label: 'Stat Card' },
];

export const VIDEO_TEMPLATES: TemplateOption[] = [
  { id: 'none', label: 'No template' },
  { id: 'ugc-style', label: 'UGC Style' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'product-demo', label: 'Product Demo' },
];

export const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Spanish' },
  { id: 'fr', label: 'French' },
  { id: 'de', label: 'German' },
  { id: 'pt', label: 'Portuguese' },
  { id: 'zh', label: 'Chinese' },
  { id: 'ja', label: 'Japanese' },
  { id: 'ar', label: 'Arabic' },
];

export function estimateImageCredits(modelId: string, quantity: number) {
  const model = IMAGE_MODELS.find((m) => m.id === modelId);
  if (!model) return 4 * quantity;
  return model.creditsPerImage * quantity;
}

export function estimateVideoCredits(modelId: string, duration: number) {
  const model = VIDEO_MODELS.find((m) => m.id === modelId);
  if (!model) return 0;
  return model.creditsPerSecond * duration;
}

export function estimateTalkingHeadCredits(scriptWordCount: number, duration: number) {
  // Placeholder cost model: base 20 credits + 1 credit per word + 2 credits per second.
  return 20 + scriptWordCount + duration * 2;
}

export function formatEstimate(seconds: [number, number] | undefined) {
  if (!seconds) return '';
  return `~${seconds[0]}-${seconds[1]}s`;
}
