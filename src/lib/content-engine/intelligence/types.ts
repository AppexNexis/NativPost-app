// Content Intelligence Engine — Tagging & Intelligence Types
// Phase 5: Core types for content intelligence and tagging

// ─── Tag Taxonomy ───────────────────────────────────────────────────────────

/**
 * Tag categories/domains for content intelligence.
 */
export type TagCategory =
  | 'person'           // Man, Woman, People
  | 'audience'         // Entrepreneur, Small Business Owner
  | 'industry'         // Fitness, Technology, Finance
  | 'business_model'   // B2B, B2C, D2C, SaaS
  | 'product'          // Software, Course, Service
  | 'setting'          // Office, Gym, Home
  | 'activity'         // Speaking, Demonstrating, Explaining
  | 'content_intent'   // Education, Inspiration, Promotion
  | 'tone'             // Motivational, Professional, Casual
  | 'visual_style'     // Talking Head, Lifestyle, Cinematic
  | 'content_style'    // Tutorial, Testimonial, Announcement
  | 'object'           // Laptop, Phone, Equipment
  | 'environment'      // Indoor, Outdoor, Urban
  | 'demographic'      // Young Adult, Professional
  | 'use_case'         // Marketing, Training, Social Media
  | 'occasion'         // Launch, Case Study, Behind the Scenes
  | 'creator_type'     // Founder, Expert, Influencer
  | 'subject'          // Self Improvement, Growth, Health
  | 'topic'            // Business Strategy, Fitness Tips
  | 'format'           // Reel, Carousel, Story
  | 'emotion'          // Excited, Calm, Confident
  | 'color_palette'    // Warm, Cool, Neutral
  | 'composition'      // Centered, Rule of Thirds, Close-up
  | 'text_visible'     // Captions, Headlines, Numbers
  | 'audio_type'       // Speech, Music, Ambient
  | 'language'         // English, Spanish
  | 'brand_element'    // Logo, Product Shot
  | 'cta_type'         // Learn More, Buy Now, Follow
  | 'social_platform'  // Instagram, TikTok, LinkedIn
  | 'resolution'       // HD, 4K, Vertical
  | 'aspect_ratio_tag' // 9:16, 16:9, 1:1
  | 'duration_tag'     // Short (0-15s), Medium (15-60s), Long (60s+)
  | 'quality_level'    // High, Medium, Low
  | 'freshness'        // Recent, Evergreen, Seasonal
  | 'originality'      // Original, Repurposed, Curated
  | 'engagement_type'  // Educational, Entertaining, Inspirational
  | 'funnel_stage'     // Awareness, Consideration, Decision
  | 'value_proposition' // Free, Premium, Limited Time
  | 'social_proof'     // Testimonial, Case Study, Review
  | 'urgency'          // High, Medium, Low, None
  | 'seasonality'      // Holiday, Summer, Back to School
  | 'trend'            // Trending, Stable, Declining
  | 'competition'      // High, Medium, Low
  | 'monetization'     // Direct, Affiliate, Sponsored
  | 'platform_feature' // Reels, Stories, Feed, Live
  | 'content_purpose'  // Brand Awareness, Lead Gen, Conversion
  | 'target_action'    // Click, Sign Up, Purchase
  | 'audience_size'    // Niche, Broad, Mass Market
  | 'content_length'   // Micro, Short, Long
  | 'production_value' // Professional, Amateur, Mixed
  | 'narrative_type'   // Linear, Nonlinear, Montage
  | 'pacing'           // Fast, Medium, Slow
  | 'energy_level'     // High, Medium, Low
  | 'trust_signal'     // Authority, Social Proof, Guarantee
  | 'pain_point'       // Time, Money, Complexity
  | 'benefit'          // Save Time, Make Money, Learn Skills
  | 'feature'          // Automation, Integration, Analytics
  | 'outcome'          // Growth, Efficiency, Success
  | 'test'             // Temporary tag for testing

/**
 * Tag source — how a tag was produced.
 */
export type TagSource =
  | 'ai_vision'        // Computer vision analysis
  | 'ai_text'          // LLM analysis
  | 'ocr'              // Optical character recognition
  | 'transcript'       // Audio transcription
  | 'rule'             // Rule-based detection
  | 'manual'           // Human-tagged
  | 'inferred'         // Inferred from context
  | 'metadata';        // From file metadata

/**
 * A tag in the taxonomy.
 */
export interface Tag {
  /** Unique tag ID. */
  id: string;

  /** Tag name (display). */
  name: string;

  /** URL-friendly slug. */
  slug: string;

  /** Parent tag ID (for hierarchy). */
  parentId?: string;

  /** Tag category/domain. */
  category: TagCategory;

  /** Optional color. */
  color?: string;

  /** Description. */
  description?: string;

  /** Usage count. */
  usageCount: number;

  /** Whether this is a system tag. */
  isSystem: boolean;

  /** Whether this tag is active. */
  isActive: boolean;
}

/**
 * An asset-tag relationship with confidence.
 */
export interface AssetTag {
  /** Asset ID. */
  assetId: string;

  /** Tag ID. */
  tagId: string;

  /** Confidence score (0-1). */
  confidence: number;

  /** How the tag was produced. */
  source: TagSource;

  /** Tagging version. */
  version: number;
}

// ─── Asset Analysis ─────────────────────────────────────────────────────────

/**
 * Result of analyzing an asset's content.
 */
export interface AssetAnalysis {
  /** Asset ID. */
  assetId: string;

  /** Detected tags with confidence. */
  tags: AnalyzedTag[];

  /** Semantic description of the asset. */
  description: string;

  /** Visual description (what's visible). */
  visualDescription?: string;

  /** Audio description (what's heard). */
  audioDescription?: string;

  /** Detected entities (people, objects). */
  entities: DetectedEntity[];

  /** Visual concepts. */
  visualConcepts: string[];

  /** Semantic concepts. */
  semanticConcepts: string[];

  /** Content intent. */
  contentIntent?: ContentIntent;

  /** Business context. */
  businessContext?: BusinessContext;

  /** Video format characteristics. */
  videoFormat?: VideoFormat;

  /** Transcript (if audio contains speech). */
  transcript?: string;

  /** OCR text (if visible text detected). */
  ocrText?: string;

  /** Analysis metadata. */
  metadata: AnalysisMetadata;
}

/**
 * A tag with confidence from analysis.
 */
export interface AnalyzedTag {
  /** Tag category. */
  category: TagCategory;

  /** Tag name (normalized). */
  name: string;

  /** Confidence score (0-1). */
  confidence: number;

  /** How the tag was produced. */
  source: TagSource;

  /** Raw model output (before normalization). */
  raw?: string;
}

/**
 * A detected entity.
 */
export interface DetectedEntity {
  /** Entity type (person, object, text). */
  type: 'person' | 'object' | 'text' | 'location' | 'brand';

  /** Entity name/description. */
  name: string;

  /** Confidence score. */
  confidence: number;

  /** Bounding box (for visual entities). */
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Content intent categories.
 */
export type ContentIntent =
  | 'education'
  | 'inspiration'
  | 'promotion'
  | 'entertainment'
  | 'social_proof'
  | 'explanation'
  | 'tutorial'
  | 'announcement'
  | 'storytelling'
  | 'engagement'
  | 'conversion'
  | 'brand_awareness';

/**
 * Business context categories.
 */
export type BusinessContext =
  | 'b2b'
  | 'b2c'
  | 'd2c'
  | 'creator'
  | 'influencer'
  | 'affiliate'
  | 'saas'
  | 'ecommerce'
  | 'service'
  | 'product'
  | 'agency'
  | 'freelance';

/**
 * Video format characteristics.
 */
export interface VideoFormat {
  /** Visual style. */
  style: VideoStyle;

  /** Pacing. */
  pacing: 'fast' | 'medium' | 'slow';

  /** Energy level. */
  energy: 'high' | 'medium' | 'low';

  /** Production value. */
  productionValue: 'professional' | 'amateur' | 'mixed';

  /** Narrative type. */
  narrative: 'linear' | 'nonlinear' | 'montage' | 'static';

  /** Whether video has text overlays. */
  hasTextOverlays: boolean;

  /** Whether video has transitions. */
  hasTransitions: boolean;

  /** Number of distinct scenes. */
  sceneCount?: number;
}

/**
 * Video style categories.
 */
export type VideoStyle =
  | 'talking_head'
  | 'person_speaking'
  | 'product_demonstration'
  | 'screen_recording'
  | 'green_screen'
  | 'lifestyle_footage'
  | 'product_showcase'
  | 'cinematic_scene'
  | 'pov'
  | 'testimonial_style'
  | 'tutorial_style'
  | 'montage'
  | 'animation'
  | 'slideshow'
  | 'text_overlay'
  | 'interview'
  | 'vlog'
  | 'b_roll';

/**
 * Analysis metadata.
 */
export interface AnalysisMetadata {
  /** Tagging model used. */
  model: string;

  /** Tagging version. */
  version: string;

  /** When the analysis was performed. */
  analyzedAt: Date;

  /** Processing duration in milliseconds. */
  durationMs: number;

  /** Frames sampled (for video). */
  framesSampled?: number;

  /** Whether OCR was performed. */
  ocrPerformed: boolean;

  /** Whether transcription was performed. */
  transcriptionPerformed: boolean;

  /** Tokens consumed (if applicable). */
  tokensConsumed?: number;

  /** Estimated cost in USD. */
  estimatedCost?: number;
}

// ─── Embeddings ─────────────────────────────────────────────────────────────

/**
 * Embedding metadata.
 */
export interface EmbeddingMetadata {
  /** Embedding model used. */
  model: string;

  /** Embedding version. */
  version: string;

  /** Embedding dimensions. */
  dimensions: number;

  /** When the embedding was generated. */
  generatedAt: Date;
}

/**
 * Embedding types.
 */
export type EmbeddingType = 'semantic' | 'visual';

/**
 * A stored embedding.
 */
export interface StoredEmbedding {
  /** Asset ID. */
  assetId: string;

  /** Embedding type. */
  type: EmbeddingType;

  /** Embedding vector (for reference, not stored in JS). */
  vector?: number[];

  /** Embedding metadata. */
  metadata: EmbeddingMetadata;
}

// ─── Tagging Engine ─────────────────────────────────────────────────────────

/**
 * Options for the tagging engine.
 */
export interface TaggingEngineConfig {
  /** Tagging model version. */
  taggingVersion: string;

  /** Vision model name. */
  visionModel: string;

  /** Text model name. */
  textModel: string;

  /** Embedding model name. */
  embeddingModel: string;

  /** Embedding dimensions. */
  embeddingDimensions: number;

  /** Confidence threshold for accepting tags. */
  confidenceThreshold: number;

  /** Maximum tags per asset (library-facing). */
  maxLibraryTags: number;

  /** Maximum tags per asset (internal). */
  maxInternalTags: number;

  /** Video frame sampling rate (frames per second). */
  frameSamplingRate: number;

  /** Maximum frames to sample for video analysis. */
  maxFramesToSample: number;

  /** Whether to perform OCR. */
  enableOcr: boolean;

  /** Whether to perform transcription. */
  enableTranscription: boolean;

  /** Processing timeout in milliseconds. */
  processingTimeoutMs: number;
}

/** Default tagging configuration. */
export const DEFAULT_TAGGING_CONFIG: TaggingEngineConfig = {
  taggingVersion: '1.0.0',
  visionModel: 'gpt-4-vision-preview',
  textModel: 'gpt-4',
  embeddingModel: 'text-embedding-3-small',
  embeddingDimensions: 1536,
  confidenceThreshold: 0.6,
  maxLibraryTags: 5,
  maxInternalTags: 20,
  frameSamplingRate: 1,
  maxFramesToSample: 5,
  enableOcr: true,
  enableTranscription: true,
  processingTimeoutMs: 300000, // 5 minutes
};

// ─── Search Primitives ──────────────────────────────────────────────────────

/**
 * Search criteria for finding assets.
 */
export interface AssetSearchCriteria {
  /** Organization ID. */
  orgId: string;

  /** Filter by tag IDs. */
  tagIds?: string[];

  /** Filter by tag categories. */
  tagCategories?: TagCategory[];

  /** Filter by minimum confidence. */
  minConfidence?: number;

  /** Filter by media type. */
  mediaType?: 'image' | 'video' | 'audio';

  /** Filter by content intent. */
  contentIntent?: ContentIntent[];

  /** Filter by business context. */
  businessContext?: BusinessContext[];

  /** Filter by video style. */
  videoStyle?: VideoStyle[];

  /** Filter by quality score minimum. */
  minQualityScore?: number;

  /** Filter by created after date. */
  createdAfter?: Date;

  /** Filter by created before date. */
  createdBefore?: Date;

  /** Limit results. */
  limit?: number;

  /** Offset for pagination. */
  offset?: number;
}

/**
 * Search result for an asset.
 */
export interface AssetSearchResult {
  /** Asset ID. */
  assetId: string;

  /** Relevance score. */
  score: number;

  /** Matching tags. */
  tags: Array<{
    name: string;
    category: TagCategory;
    confidence: number;
  }>;

  /** Semantic description. */
  description: string;

  /** Thumbnail URL. */
  thumbnailUrl?: string;
}

/**
 * Similar asset search criteria.
 */
export interface SimilaritySearchCriteria {
  /** Organization ID. */
  orgId: string;

  /** Text query for semantic similarity. */
  query?: string;

  /** Asset ID to find similar to. */
  assetId?: string;

  /** Embedding type to use. */
  embeddingType?: EmbeddingType;

  /** Maximum results. */
  limit?: number;

  /** Minimum similarity score. */
  minScore?: number;
}

// ─── Versioning ─────────────────────────────────────────────────────────────

/**
 * Tagging run record.
 */
export interface TaggingRun {
  /** Unique run ID. */
  id: string;

  /** Organization ID. */
  orgId: string;

  /** Asset ID processed. */
  assetId: string;

  /** Tagging version used. */
  taggingVersion: string;

  /** Vision model used. */
  visionModel: string;

  /** Text model used. */
  textModel: string;

  /** Embedding model used. */
  embeddingModel: string;

  /** Analysis result. */
  analysis: AssetAnalysis;

  /** Tags created/updated. */
  tagsCreated: number;

  /** Embedding generated. */
  embeddingGenerated: boolean;

  /** Processing duration in milliseconds. */
  durationMs: number;

  /** Estimated cost in USD. */
  estimatedCost?: number;

  /** When the run was performed. */
  performedAt: Date;
}
