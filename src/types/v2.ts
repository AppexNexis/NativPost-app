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
  | 'custom';

export type SourcePlatform = 'tiktok' | 'instagram' | 'youtube' | 'pexels' | 'unknown';

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

export type TemplateStructure = {
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
};

export type ContentTemplate = {
  id: string;
  sourceUrl: string;
  sourcePlatform: SourcePlatform;
  sourceCreator: string | null;
  sourceVideoId: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string;
  thumbnailUrls: Record<string, string> | string[];
  slideCaptions: Record<string, string> | string[];
  durationSeconds: number | null;
  aspectRatio: string | null;
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
};

// ============================================================
// CONTENT ITEM (existing schema + v2 additions)
// ============================================================

export type ContentItem = {
  id: string;
  orgId: string;
  brandProfileId: string | null;
  caption: string;
  hashtags: string[];
  contentType: string; // slideshow, wall_of_text, talking_head, reel, text_only
  topic: string | null;
  graphicUrls: string[];
  graphicTemplateId: string | null;
  variantGroupId: string | null;
  variantNumber: number;
  isSelectedVariant: boolean;
  targetPlatforms: string[];
  platformSpecific: Record<string, unknown>;
  status: string; // draft, pending_review, approved, scheduled, published, rejected
  scheduledFor: string | null;
  publishedAt: string | null;
  rejectionFeedback: string | null;
  antiSlopScore: number | null;
  qualityFlags: string[];
  contentMode: string | null;
  enrichmentData: Record<string, unknown>;
  enrichmentApplied: string[];
  engagementData: Record<string, unknown>;
  // v2 additions
  campaignId: string | null;
  templateId: string | null;
  influencerId: string | null;
  angleId: string | null;
  generationParams: GenerationParams;
  contentFormat: string | null;
  aspectRatio: string | null;
  durationSeconds: number | null;
  aiModelUsed: string | null;
  updatedAt: string;
  createdAt: string;
};

// ============================================================
// SOCIAL ACCOUNT
// ============================================================

export type SocialAccount = {
  id: string;
  orgId: string;
  platform: string; // instagram, facebook, linkedin, twitter, tiktok, whatsapp, ...
  platformUserId: string | null;
  platformUsername: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  accountType: string | null; // personal, page, company, business
  profileImageUrl: string | null;
  isActive: boolean;
  connectedAt: string;
  oauthToken: string | null;
  oauthTokenSecret: string | null;
  metadata: Record<string, unknown> | null;
};

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

export type ContentMix = {
  slideshow?: number;
  wallOfText?: number;
  greenScreen?: number;
  videoHook?: number;
  talkingHead?: number;
  carousel?: number;
  ugc?: number;
};

export type CampaignAngle = {
  angleId: string;
  weight: number;
};

export type TargetAccount = {
  accountId: string;
  platform: string;
};

export type Campaign = {
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
};

export type CampaignContentItem = {
  id: string;
  campaignId: string;
  contentItemId: string;
  sequenceIndex: number;
  scheduledDate: string | null;
  scheduledTime: string | null;
  isRolled: boolean;
};

// ============================================================
// AI INFLUENCER
// ============================================================

export type AIInfluencer = {
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
};

// ============================================================
// CONTENT ANGLE
// ============================================================

export type ContentAngle = {
  id: string;
  orgId: string | null;
  name: string;
  description: string | null;
  color: string | null;
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
};

// ============================================================
// MEDIA ASSET
// ============================================================

export type AssetType = 'image' | 'video' | 'audio' | 'lottie' | 'ai_scene';

export type AssetSource = 'upload' | 'unsplash' | 'flux' | 'seedance' | 'ai_generated' | 'template';

export type AIMetadata = {
  prompt?: string;
  model?: string;
  seed?: number;
  negativePrompt?: string;
  stylePreset?: string;
};

export type MediaAsset = {
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
};

// ============================================================
// AUTOMATION
// ============================================================

export type TriggerType = 'time_based' | 'event_based' | 'performance_based';

export type ActionType = 'generate_campaign' | 'publish_post' | 'remix_template' | 'notify';

export type TriggerConfig = {
  cron?: string;
  timezone?: string;
  event?: string;
  threshold?: number;
  metric?: string;
};

export type ActionConfig = {
  campaignTemplateId?: string;
  autoApprove?: boolean;
  targetPlatforms?: string[];
  contentType?: string;
  notifyChannels?: string[];
};

export type AutomationRule = {
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
};

// ============================================================
// ENGINE LOG
// ============================================================

export type EngineRequestLog = {
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
};

// ============================================================
// ENHANCED CONTENT ITEM
// ============================================================

export type GenerationParams = {
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
};

// ============================================================
// CONTENT EDIT SESSION
// ============================================================

export type ContentEditSource = 'remix' | 'generate' | 'manual';

export type TextStyle = {
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  align?: 'left' | 'center' | 'right';
  weight?: 'normal' | 'bold';
  italic?: boolean;
  underline?: boolean;
};

export type MediaSlot = {
  url: string;
  publicId?: string;
  assetType?: 'image' | 'video';
  label?: string;
};

export type MediaSlots = {
  background?: MediaSlot;
  hookVideo?: MediaSlot;
  slides?: MediaSlot[];
  demoVideo?: MediaSlot;
};

export type AudioTrack = {
  name: string;
  url: string;
  publicId?: string;
  source: 'original' | 'library' | 'upload';
  volume?: number;
};

export type TimingSegment = {
  text?: string;
  durationSeconds: number;
  startAt?: number;
};

export type ContentEditTiming = {
  hook?: TimingSegment;
  body?: TimingSegment;
  cta?: TimingSegment;
  slides?: TimingSegment[];
  transitions?: string[];
};

export type ContentEditScript = {
  hookText?: string;
  bodyText?: string;
  ctaText?: string;
  wallText?: string;
  slideCopy?: Array<string | { text: string; durationSeconds?: number }>;
};

export type ContentEditStatus = 'draft' | 'approved' | 'discarded';
export type ContentEditRenderStatus = 'idle' | 'rendering' | 'done' | 'failed';

export type ContentEdit = {
  id: string;
  orgId: string;
  userId: string;
  contentItemId: string | null;
  templateId: string | null;
  source: ContentEditSource;

  contentType: ContentType;
  contentMode: string;
  targetPlatforms: string[];
  aspectRatio: string;

  script: ContentEditScript;
  style: TextStyle;
  layout: string;
  timing: ContentEditTiming;

  mediaSlots: MediaSlots;
  audioTrack: AudioTrack | null;

  enrichment: Record<string, unknown>;
  brandProfileSnapshot: Record<string, unknown>;

  previewRenderUrl: string | null;
  previewRenderId: string | null;
  finalRenderUrl: string | null;
  finalRenderId: string | null;
  renderStatus: ContentEditRenderStatus;

  status: ContentEditStatus;
  isAutosave: boolean;

  updatedAt: string;
  createdAt: string;
};

export type AspectRatio = '9:16' | '3:4' | '1:1' | '4:3' | '16:9' | '2:3' | '3:2' | '21:9';

export type VideoModel = 'pixverse_v6' | 'kling_v3_pro' | 'seedance_2' | 'remotion';

export type VideoDuration = 5 | 8 | 10;

// ============================================================
// UI / FILTER TYPES
// ============================================================

export type TemplateFilters = {
  contentType?: ContentType;
  niche?: NicheTag;
  platform?: SourcePlatform;
  angle?: string;
  status?: CurationStatus;
  sort?: 'engagement' | 'remixes' | 'newest';
};

export type CampaignFilters = {
  status?: CampaignStatus;
};

export type MediaAssetFilters = {
  assetType?: AssetType;
  aspectRatio?: AspectRatio;
  tag?: string;
  source?: AssetSource;
};
