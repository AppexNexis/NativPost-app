/**
 * NativPost v2 — TypeScript Types
 * Shared types for the new content library, campaigns, AI influencers, and automation.
 */

// ============================================================
// CONTENT TEMPLATE (Trending Library)
// ============================================================

export type ContentType =
  | 'slideshow'
  | 'wall_of_text'
  | 'talking_head'
  | 'green_screen_meme'
  | 'video_hook_demo'
  | 'ugc'
  | 'carousel'
  | 'custom';

export type SourcePlatform = 'tiktok' | 'instagram' | 'youtube' | 'unknown';

export type CurationStatus = 'pending' | 'approved' | 'rejected' | 'featured';

export type NicheTag =
  | 'b2b_saas'
  | 'agency'
  | 'ecommerce'
  | 'personal_brand'
  | 'fitness'
  | 'fintech'
  | 'africa_market'
  | 'health'
  | 'education'
  | 'food'
  | 'travel'
  | 'fashion';

export interface TemplateStructure {
  hook?: {
    text: string;
    duration: number;
    visualType: string;
  };
  body?: {
    text: string;
    duration: number;
  };
  cta?: {
    text: string;
    duration: number;
  };
  transitions?: string[];
  musicStyle?: string;
  textOverlayStyle?: string;
}

export interface ContentTemplate {
  id: string;
  sourceUrl: string;
  sourcePlatform: SourcePlatform;
  sourceCreator: string | null;
  sourceVideoId: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string;
  thumbnailUrls: Record<string, string>;
  durationSeconds: number | null;
  contentType: ContentType;
  niches: NicheTag[];
  angles: string[];
  structure: TemplateStructure;
  engagementScore: number | null;
  viewCount: number | null;
  likeCount: number | null;
  shareCount: number | null;
  commentCount: number | null;
  curationStatus: CurationStatus;
  curatedBy: string | null;
  curatedAt: string | null;
  remixCount: number;
  publishCount: number;
  avgRemixPerformance: number | null;
  addedAt: string;
  lastRefreshedAt: string | null;
  isActive: boolean;
  trainingUsed: boolean;
  updatedAt: string;
  createdAt: string;
}

// ============================================================
// CAMPAIGN
// ============================================================

export type CampaignStatus =
  | 'draft'
  | 'generating'
  | 'review'
  | 'scheduled'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled';

export type MentionFrequency = 'never' | 'rarely' | 'sometimes' | 'often' | 'always';

export type GenderPreference = 'all' | 'men' | 'women' | null;

export interface ContentMix {
  slideshow?: number;
  wallOfText?: number;
  greenScreen?: number;
  videoHook?: number;
  talkingHead?: number;
  carousel?: number;
  ugc?: number;
}

export interface CampaignAngle {
  angleId: string;
  weight: number;
}

export interface TargetAccount {
  accountId: string;
  platform: string;
}

export interface Campaign {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  contentMix: ContentMix;
  remixRatio: number;
  angles: CampaignAngle[];
  mentionFrequency: MentionFrequency;
  genderPreference: GenderPreference;
  ownMediaMix: number;
  influencerFrequency: number;
  targetAccounts: TargetAccount[];
  postsPerDay: number;
  campaignLengthDays: number;
  startDate: string | null;
  totalPosts: number;
  generatedPosts: number;
  reRollsRemaining: number;
  qualityThreshold: number;
  totalEngagement: number;
  avgEngagementRate: number | null;
  updatedAt: string;
  createdAt: string;
}

export interface CampaignContentItem {
  id: string;
  campaignId: string;
  contentItemId: string;
  sequenceIndex: number;
  scheduledDate: string | null;
  scheduledTime: string | null;
  isRolled: boolean;
}

// ============================================================
// AI INFLUENCER
// ============================================================

export interface AIInfluencer {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  gender: string | null;
  ageRange: string | null;
  ethnicity: string | null;
  hairStyle: string | null;
  hairColor: string | null;
  bodyType: string | null;
  fashionStyle: string | null;
  poseStyle: string | null;
  backgroundPreference: string | null;
  baseImageUrl: string | null;
  referenceImageUrls: string[];
  loraModelId: string | null;
  usageCount: number;
  isActive: boolean;
  updatedAt: string;
  createdAt: string;
}

// ============================================================
// CONTENT ANGLE
// ============================================================

export interface ContentAngle {
  id: string;
  orgId: string | null;
  name: string;
  description: string | null;
  color: string | null;
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
}

// ============================================================
// MEDIA ASSET
// ============================================================

export type AssetType = 'image' | 'video' | 'audio' | 'lottie' | 'ai_scene';

export type AssetSource = 'upload' | 'unsplash' | 'flux' | 'seedance' | 'ai_generated' | 'template';

export interface AIMetadata {
  prompt?: string;
  model?: string;
  seed?: number;
  negativePrompt?: string;
  stylePreset?: string;
}

export interface MediaAsset {
  id: string;
  orgId: string;
  uploadcareUuid: string | null;
  url: string;
  thumbnailUrl: string | null;
  assetType: AssetType;
  mimeType: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  aspectRatio: string | null;
  durationSeconds: number | null;
  tags: string[];
  description: string | null;
  source: AssetSource;
  aiMetadata: AIMetadata;
  usageCount: number;
  updatedAt: string;
  createdAt: string;
}

// ============================================================
// AUTOMATION
// ============================================================

export type TriggerType = 'time_based' | 'event_based' | 'performance_based';

export type ActionType = 'generate_campaign' | 'publish_post' | 'remix_template' | 'notify';

export interface TriggerConfig {
  cron?: string;
  timezone?: string;
  event?: string;
  threshold?: number;
  metric?: string;
}

export interface ActionConfig {
  campaignTemplateId?: string;
  autoApprove?: boolean;
  targetPlatforms?: string[];
  contentType?: string;
  notifyChannels?: string[];
}

export interface AutomationRule {
  id: string;
  orgId: string;
  name: string;
  triggerType: TriggerType;
  triggerConfig: TriggerConfig;
  actionType: ActionType;
  actionConfig: ActionConfig;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  updatedAt: string;
  createdAt: string;
}

// ============================================================
// ENGINE LOG
// ============================================================

export interface EngineRequestLog {
  id: string;
  orgId: string;
  contentItemId: string | null;
  campaignId: string | null;
  requestType: string;
  engineUrl: string | null;
  modelUsed: string | null;
  requestPayloadSize: number | null;
  responsePayloadSize: number | null;
  durationMs: number | null;
  status: string | null;
  errorMessage: string | null;
  costEstimate: number | null;
  createdAt: string;
}

// ============================================================
// ENHANCED CONTENT ITEM
// ============================================================

export interface GenerationParams {
  templateId?: string;
  campaignId?: string;
  angleId?: string;
  influencerId?: string;
  contentFormat?: ContentType;
  aspectRatio?: string;
  durationSeconds?: number;
  aiModelUsed?: string;
  prompt?: string;
  remixSource?: string;
}

export type AspectRatio = '9:16' | '3:4' | '1:1' | '4:3' | '16:9' | '2:3' | '3:2' | '21:9';

export type VideoModel = 'pixverse_v6' | 'kling_v3_pro' | 'seedance_2' | 'remotion';

export type VideoDuration = 5 | 8 | 10;

// ============================================================
// UI / FILTER TYPES
// ============================================================

export interface TemplateFilters {
  contentType?: ContentType;
  niche?: NicheTag;
  platform?: SourcePlatform;
  angle?: string;
  status?: CurationStatus;
  sort?: 'engagement' | 'remixes' | 'newest';
}

export interface CampaignFilters {
  status?: CampaignStatus;
}

export interface MediaAssetFilters {
  assetType?: AssetType;
  aspectRatio?: AspectRatio;
  tag?: string;
  source?: AssetSource;
}
