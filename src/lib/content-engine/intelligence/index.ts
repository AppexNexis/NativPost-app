// Content Intelligence Engine — Intelligence Module
// Phase 5: Barrel exports for tagging and embeddings

// ─── Types ──────────────────────────────────────────────────────────────────
export type {
  TagCategory,
  TagSource,
  Tag,
  AssetTag,
  AssetAnalysis,
  AnalyzedTag,
  DetectedEntity,
  ContentIntent,
  BusinessContext,
  VideoFormat,
  VideoStyle,
  AnalysisMetadata,
  EmbeddingMetadata,
  EmbeddingType,
  StoredEmbedding,
  TaggingEngineConfig,
  AssetSearchCriteria,
  AssetSearchResult,
  SimilaritySearchCriteria,
  TaggingRun,
} from './types';

export { DEFAULT_TAGGING_CONFIG } from './types';

// ─── Tag Normalizer ─────────────────────────────────────────────────────────
export {
  TagNormalizer,
  getTagNormalizer,
  resetTagNormalizer,
} from './tag-normalizer';

// ─── Image Analyzer ─────────────────────────────────────────────────────────
export {
  ImageAnalyzer,
  getImageAnalyzer,
  resetImageAnalyzer,
} from './image-analyzer';

// ─── Video Analyzer ─────────────────────────────────────────────────────────
export {
  VideoAnalyzer,
  getVideoAnalyzer,
  resetVideoAnalyzer,
} from './video-analyzer';

// ─── Embedding Service ──────────────────────────────────────────────────────
export {
  EmbeddingService,
  getEmbeddingService,
  resetEmbeddingService,
} from './embedding-service';

// ─── Tagging Engine ─────────────────────────────────────────────────────────
export {
  TaggingEngine,
  getTaggingEngine,
  resetTaggingEngine,
} from './tagging-engine';
