// AI Studio public exports.
// All model definitions live in ./ai-studio/models.ts (single source of truth).
// This file preserves the historical constant re-exports (FORMATS, LANGUAGES,
// DURATIONS) used by the picker UI, and re-exports the new registry.

export {
  AI_STUDIO_MODELS,
  AI_STUDIO_TEMPLATES,
  estimateCredits,
  getModel,
  getModelsByKind,
  templatesForKind,
  type AiStudioKind,
  type AiStudioModel,
  type AiStudioModelId,
  type AiStudioTemplate,
} from './ai-studio/models';

export interface FormatOption {
  id: string;
  label: string;
  ratio: string;
}

export const FORMATS: FormatOption[] = [
  { id: '9:16', label: 'Vertical', ratio: '9:16' },
  { id: '1:1', label: 'Square', ratio: '1:1' },
  { id: '16:9', label: 'Landscape', ratio: '16:9' },
  { id: '4:5', label: 'Portrait', ratio: '4:5' },
];

export const DURATIONS = [5, 8, 10];

export const IMAGE_QUANTITY = [1, 2, 3, 4];

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
