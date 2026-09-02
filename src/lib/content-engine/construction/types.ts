// Content Intelligence Engine — Construction Types
// Phase 6: Types for content qualification, construction, and composition

// ─── Slot Schema ─────────────────────────────────────────────────────────────

/**
 * Defines a single slot in a content type's composition.
 */
export interface SlotDefinition {
  type: 'image' | 'video' | 'audio' | 'text';
  required: boolean;
  maxDuration?: number;  // For video slots (seconds)
  minDuration?: number;  // For video slots (seconds)
  maxAssets?: number;    // For multi-asset slots (e.g., slideshow slides)
}

/**
 * The slot schema for a content type.
 * Keys are slot names (e.g., 'hook_video', 'slide_1', 'background_music').
 */
export type SlotSchema = Record<string, SlotDefinition>;

/**
 * A populated slot value — the actual asset(s) assigned to a slot.
 */
export interface SlotValue {
  type: 'image' | 'video' | 'audio' | 'text';
  assetId?: string;      // Reference to media_asset.id
  url?: string;          // Direct URL for rendering
  text?: string;         // For text slots
  duration?: number;     // Duration in seconds
  metadata?: Record<string, unknown>;
}

/**
 * The populated slots for a composition.
 * Keys match the SlotSchema keys.
 */
export type PopulatedSlots = Record<string, SlotValue | SlotValue[]>;

// ─── Qualification Rules ─────────────────────────────────────────────────────

/**
 * Rules that determine whether an asset qualifies for a content type.
 */
export interface QualificationRules {
  minQualityScore?: number;
  minDuration?: number;
  maxDuration?: number;
  requireAudio?: boolean;
  requireNonSilentAudio?: boolean;
  requireFace?: boolean;
  requireTextOverlay?: boolean;
  requiredTags?: string[];
  excludedTags?: string[];
  requiredAspectRatios?: string[];
  minResolution?: { width: number; height: number };
  maxFileSize?: number;  // bytes
}

/**
 * Result of qualifying an asset against a content type.
 */
export interface QualificationResult {
  eligible: boolean;
  score: number;           // 0-1, how well it qualifies
  hardFailures: string[];  // Reasons that disqualify
  warnings: string[];      // Non-blocking concerns
  matchedRules: string[];  // Rules that passed
  missingRequirements: string[];
  reasoning: string;       // Human-readable explanation
  qualificationVersion: string;
}

// ─── Construction Rules ──────────────────────────────────────────────────────

/**
 * Rules for constructing a composition from qualified assets.
 */
export interface ConstructionRules {
  similarityRequired?: boolean;
  diversityRequired?: boolean;
  minTagOverlap?: number;
  maxVisualSimilarity?: number;
  sequencingStrategy?: 'attention-first' | 'chronological' | 'random';
  textGeneration?: 'ai' | 'template' | 'none';
  audioSelection?: 'auto' | 'none';
}

/**
 * A plan for constructing a composition — the blueprint before rendering.
 */
export interface ConstructionPlan {
  contentTypeId: string;
  orgId: string;
  slots: PopulatedSlots;
  text: SlideText[];
  audio: AudioPlan | null;
  metadata: CompositionMetadata;
  constructionVersion: string;
  deterministic: boolean;
  seed?: number;  // For reproducible randomness
}

/**
 * Text for a specific slide in a multi-slide composition.
 */
export interface SlideText {
  slideIndex: number;
  slotName: string;
  text: string;
  position: TextPosition;
  style: TextStyle;
}

export interface TextPosition {
  x: number;       // 0-1 normalized
  y: number;       // 0-1 normalized
  anchor: 'top' | 'center' | 'bottom';
  alignment: 'left' | 'center' | 'right';
}

export interface TextStyle {
  fontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor?: string;
  shadow?: boolean;
  outline?: boolean;
}

/**
 * Role of a slide in a multi-slide composition.
 */
export type SlideRole =
  | 'attention'      // Strongest visual — hook
  | 'context'        // Supporting context
  | 'expansion'      // Expanding on the idea
  | 'reinforcement'  // Reinforcing the message
  | 'conclusion';    // Closing / CTA

/**
 * Audio plan for a composition.
 */
export interface AudioPlan {
  assetId?: string;
  url?: string;
  source: 'library' | 'generated' | 'none';
  volume: number;      // 0-1
  fadeIn?: number;     // seconds
  fadeOut?: number;    // seconds
  loop: boolean;
}

/**
 * Metadata about how a composition was constructed.
 */
export interface CompositionMetadata {
  constructionVersion: string;
  constructedAt: Date;
  assetCount: number;
  assetIds: string[];
  qualificationScores: Record<string, number>;
  compatibilityScore?: number;  // For slideshows
  sequencingMethod?: string;
  textGeneratedBy?: string;
  audioSelectedBy?: string;
}

// ─── Content Composition ─────────────────────────────────────────────────────

/**
 * A complete composition ready for rendering or quality evaluation.
 */
export interface ContentComposition {
  id: string;
  contentTypeId: string;
  orgId: string;
  name?: string;
  version: number;
  slots: PopulatedSlots;
  metadata: CompositionMetadata;
  qualityScore: number | null;
  isComplete: boolean;
}

// ─── Library Content ─────────────────────────────────────────────────────────

/**
 * A complete, usable piece of social content.
 */
export interface LibraryContent {
  id: string;
  orgId: string;
  contentTypeId: string;
  compositionId: string | null;
  campaignId: string | null;
  title: string | null;
  caption: string | null;
  hashtags: string[];
  targetPlatforms: string[];
  targetAccountIds: string[];
  status: ContentStatus;
  scheduledFor: Date | null;
  publishedAt: Date | null;
  qualityScore: number | null;
  qualityFlags: string[];
  antiSlopScore: number | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export type ContentStatus =
  | 'draft'
  | 'processing'
  | 'quality_check'
  | 'pending_review'
  | 'ready'
  | 'approved'
  | 'scheduled'
  | 'rejected'
  | 'published'
  | 'archived';

// ─── Provenance ──────────────────────────────────────────────────────────────

/**
 * Full provenance chain from library content back to provider.
 */
export interface ProvenanceChain {
  libraryContentId: string;
  compositionId: string;
  contentTypeId: string;
  assetIds: string[];
  generationJobIds: string[];
  providerIds: string[];
  modelIds: string[];
  attemptIds: string[];
}

// ─── Failure Tracking ────────────────────────────────────────────────────────

/**
 * Record of a failed construction attempt.
 */
export interface ConstructionFailure {
  id: string;
  contentTypeId: string;
  orgId: string;
  assetIds: string[];
  failureReason: string;
  failureCategory: 'qualification' | 'compatibility' | 'rendering' | 'quality';
  constructionVersion: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * Configuration for the construction engine.
 */
export interface ConstructionEngineConfig {
  qualificationVersion: string;
  constructionVersion: string;
  qualityVersion: string;
  defaultMaxAssets: number;
  slideshowCompatibilityThreshold: number;
  minSlideshowTagOverlap: number;
  maxSlideshowVisualSimilarity: number;
  deterministicByDefault: boolean;
}

export const DEFAULT_CONSTRUCTION_CONFIG: ConstructionEngineConfig = {
  qualificationVersion: '1.0.0',
  constructionVersion: '1.0.0',
  qualityVersion: '1.0.0',
  defaultMaxAssets: 5,
  slideshowCompatibilityThreshold: 0.6,
  minSlideshowTagOverlap: 1,
  maxSlideshowVisualSimilarity: 0.85,
  deterministicByDefault: true,
};
