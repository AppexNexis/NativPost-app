import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// ============================================================
// NATIVPOST DATABASE SCHEMA v7
// Using Drizzle ORM with Supabase PostgreSQL
// ============================================================

// -----------------------------------------------------------
// ORGANIZATIONS (extends Clerk org with NativPost-specific data)
// -----------------------------------------------------------
export const organizationSchema = pgTable(
  'organization',
  {
    id: text('id').primaryKey(), // Clerk org ID
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    stripeSubscriptionPriceId: text('stripe_subscription_price_id'),
    stripeSubscriptionStatus: text('stripe_subscription_status'),
    stripeSubscriptionCurrentPeriodEnd: integer(
      'stripe_subscription_current_period_end',
    ),
    paystackCustomerCode: text('paystack_customer_code'),
    paystackCustomerEmail: text('paystack_customer_email'),
    paystackSubscriptionCode: text('paystack_subscription_code'),
    paystackPlanCode: text('paystack_plan_code'),
    paystackAuthorizationCode: text('paystack_authorization_code'),
    plan: text('plan').default('starter').notNull(),
    planStatus: text('plan_status').default('inactive').notNull(),
    postsPerMonth: integer('posts_per_month').default(20).notNull(),
    platformsLimit: integer('platforms_limit').default(3).notNull(),
    setupFeePaid: boolean('setup_fee_paid').default(false).notNull(),
    trialEndsAt: timestamp('trial_ends_at', { mode: 'date' }),
    paymentType: text('payment_type').default('stripe'),
    settings: jsonb('settings').default({}).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => {
    return {
      stripeCustomerIdIdx: uniqueIndex('stripe_customer_id_idx').on(
        table.stripeCustomerId,
      ),
    };
  },
);

// -----------------------------------------------------------
// MEDIA SETS
// -----------------------------------------------------------
export const mediaSetSchema = pgTable('media_set', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id')
    .references(() => organizationSchema.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  assetUuids: jsonb('asset_uuids').default([]).notNull(),
  curatedThemeId: text('curated_theme_id'),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// -----------------------------------------------------------
// BRAND PROFILES
// -----------------------------------------------------------
export const brandProfileSchema = pgTable('brand_profile', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id')
    .references(() => organizationSchema.id, { onDelete: 'cascade' })
    .notNull(),
  brandName: text('brand_name').notNull(),
  industry: text('industry'),
  targetAudience: text('target_audience'),
  companyDescription: text('company_description'),
  websiteUrl: text('website_url'),
  toneFormality: integer('tone_formality').default(5),
  toneHumor: integer('tone_humor').default(5),
  toneEnergy: integer('tone_energy').default(5),
  vocabulary: jsonb('vocabulary').default([]),
  forbiddenWords: jsonb('forbidden_words').default([]),
  communicationStyle: text('communication_style'),
  primaryColor: text('primary_color'),
  secondaryColor: text('secondary_color'),
  accentColor: text('accent_color'),
  fontPreference: text('font_preference'),
  imageStyle: text('image_style'),
  logoUrl: text('logo_url'),
  contentExamples: jsonb('content_examples').default([]),
  antiPatterns: jsonb('anti_patterns').default([]),
  hashtagStrategy: text('hashtag_strategy'),
  linkedinVoice: text('linkedin_voice'),
  instagramVoice: text('instagram_voice'),
  twitterVoice: text('twitter_voice'),
  facebookVoice: text('facebook_voice'),
  tiktokVoice: text('tiktok_voice'),
  mission: text('mission'),
  values: jsonb('values').default([]),
  productsServices: jsonb('products_services').default([]),
  keyDifferentiators: text('key_differentiators'),
  growthStage: text('growth_stage').default('early'),
  profileCompleteness: integer('profile_completeness').default(0),
  onboardingCompleted: boolean('onboarding_completed').default(false),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// -----------------------------------------------------------
// SOCIAL ACCOUNTS
// -----------------------------------------------------------
export const socialAccountSchema = pgTable('social_account', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id')
    .references(() => organizationSchema.id, { onDelete: 'cascade' })
    .notNull(),
  platform: text('platform').notNull(),
  platformUserId: text('platform_user_id'),
  platformUsername: text('platform_username'),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at', { mode: 'date' }),
  accountType: text('account_type'),
  profileImageUrl: text('profile_image_url'),
  isActive: boolean('is_active').default(true).notNull(),
  connectedAt: timestamp('connected_at', { mode: 'date' }).defaultNow().notNull(),
  oauthToken: text('oauth_token'),
  oauthTokenSecret: text('oauth_token_secret'),
  metadata: jsonb('metadata').default(null),
});

// -----------------------------------------------------------
// CONTENT ITEMS
// -----------------------------------------------------------
export const contentItemSchema = pgTable('content_item', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id')
    .references(() => organizationSchema.id, { onDelete: 'cascade' })
    .notNull(),
  brandProfileId: uuid('brand_profile_id').references(
    () => brandProfileSchema.id,
  ),
  caption: text('caption').notNull(),
  hashtags: jsonb('hashtags').default([]),
  contentType: text('content_type').notNull(),
  topic: text('topic'),
  graphicUrls: jsonb('graphic_urls').default([]),
  graphicTemplateId: text('graphic_template_id'),
  variantGroupId: uuid('variant_group_id'),
  variantNumber: integer('variant_number').default(1),
  isSelectedVariant: boolean('is_selected_variant').default(false),
  targetPlatforms: jsonb('target_platforms').default([]),
  platformSpecific: jsonb('platform_specific').default({}),
  status: text('status').default('draft').notNull(),
  scheduledFor: timestamp('scheduled_for', { mode: 'date' }),
  publishedAt: timestamp('published_at', { mode: 'date' }),
  rejectionFeedback: text('rejection_feedback'),
  antiSlopScore: real('anti_slop_score'),
  qualityFlags: jsonb('quality_flags').default([]),
  contentMode: text('content_mode').default('normal'),
  enrichmentData: jsonb('enrichment_data').default({}),
  enrichmentApplied: jsonb('enrichment_applied').default([]),
  engagementData: jsonb('engagement_data').default({}),
  // v2 fields
  campaignId: uuid('campaign_id').references(() => campaignSchema.id, {
    onDelete: 'set null',
  }),
  templateId: uuid('template_id').references(() => contentTemplateSchema.id, {
    onDelete: 'set null',
  }),
  influencerId: uuid('influencer_id').references(() => aiInfluencerSchema.id, {
    onDelete: 'set null',
  }),
  angleId: uuid('angle_id').references(() => contentAngleSchema.id, {
    onDelete: 'set null',
  }),
  generationParams: jsonb('generation_params').default({}),
  contentFormat: text('content_format'),
  aspectRatio: text('aspect_ratio'),
  durationSeconds: integer('duration_seconds'),
  aiModelUsed: text('ai_model_used'),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// -----------------------------------------------------------
// CONTENT CALENDAR
// -----------------------------------------------------------
export const contentCalendarSchema = pgTable('content_calendar', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id')
    .references(() => organizationSchema.id, { onDelete: 'cascade' })
    .notNull(),
  contentItemId: uuid('content_item_id').references(
    () => contentItemSchema.id,
  ),
  scheduledDate: text('scheduled_date').notNull(),
  scheduledTime: text('scheduled_time'),
  timezone: text('timezone').default('UTC'),
  isPublished: boolean('is_published').default(false),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// -----------------------------------------------------------
// CONTENT PLAN
// -----------------------------------------------------------
export const contentPlanSchema = pgTable(
  'content_plan',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .references(() => organizationSchema.id, { onDelete: 'cascade' })
      .notNull(),
    month: text('month').notNull(),
    topics: jsonb('topics').default([]).notNull(),
    regenerationCount: integer('regeneration_count').default(0).notNull(),
    generatedAt: timestamp('generated_at', { mode: 'date' }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    orgMonthIdx: uniqueIndex('content_plan_org_month_idx').on(
      table.orgId,
      table.month,
    ),
  }),
);

// -----------------------------------------------------------
// PUBLISHING QUEUE
// -----------------------------------------------------------
export const publishingQueueSchema = pgTable('publishing_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  contentItemId: uuid('content_item_id')
    .references(() => contentItemSchema.id, { onDelete: 'cascade' })
    .notNull(),
  socialAccountId: uuid('social_account_id')
    .references(() => socialAccountSchema.id)
    .notNull(),
  platform: text('platform').notNull(),
  scheduledFor: timestamp('scheduled_for', { mode: 'date' }).notNull(),
  status: text('status').default('queued').notNull(),
  platformPostId: text('platform_post_id'),
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').default(0),
  publishedAt: timestamp('published_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// -----------------------------------------------------------
// CONTENT FEEDBACK
// -----------------------------------------------------------
export const contentFeedbackSchema = pgTable('content_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  contentItemId: uuid('content_item_id')
    .references(() => contentItemSchema.id, { onDelete: 'cascade' })
    .notNull(),
  userId: text('user_id').notNull(),
  feedbackType: text('feedback_type').notNull(),
  feedbackText: text('feedback_text'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// -----------------------------------------------------------
// ONBOARDING PROGRESS
// -----------------------------------------------------------
export const onboardingProgressSchema = pgTable('onboarding_progress', {
  id: serial('id').primaryKey(),
  orgId: text('org_id')
    .references(() => organizationSchema.id, { onDelete: 'cascade' })
    .notNull(),
  step: text('step').notNull(),
  completed: boolean('completed').default(false).notNull(),
  data: jsonb('data').default({}),
  completedAt: timestamp('completed_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// -----------------------------------------------------------
// SUPPORT TICKETS
// -----------------------------------------------------------
export const supportTicketSchema = pgTable('support_ticket', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id')
    .references(() => organizationSchema.id, { onDelete: 'cascade' })
    .notNull(),
  submitterUserId: text('submitter_user_id').notNull(),
  submitterEmail: text('submitter_email').notNull(),
  submitterName: text('submitter_name').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  aiSummary: text('ai_summary'),
  aiCategory: text('ai_category'),
  aiPriority: text('ai_priority').default('medium'),
  aiAutoResolved: boolean('ai_auto_resolved').default(false),
  aiConfidence: real('ai_confidence'),
  aiEnabled: boolean('ai_enabled').default(true).notNull(),
  aiHistory: jsonb('ai_history').default([]),
  status: text('status').default('open').notNull(),
  assignedToUserId: text('assigned_to_user_id'),
  source: text('source').default('web').notNull(),
  inboundEmailId: text('inbound_email_id'),
  resolvedAt: timestamp('resolved_at', { mode: 'date' }),
  closedAt: timestamp('closed_at', { mode: 'date' }),
  csatScore: integer('csat_score'),
  csatFeedback: text('csat_feedback'),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// -----------------------------------------------------------
// SUPPORT MESSAGES
// -----------------------------------------------------------
export const supportMessageSchema = pgTable('support_message', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id')
    .references(() => supportTicketSchema.id, { onDelete: 'cascade' })
    .notNull(),
  authorType: text('author_type').notNull(),
  authorUserId: text('author_user_id'),
  authorName: text('author_name').notNull(),
  authorEmail: text('author_email'),
  body: text('body').notNull(),
  isInternal: boolean('is_internal').default(false).notNull(),
  originalBody: text('original_body'),
  aiPolished: boolean('ai_polished').default(false),
  emailMessageId: text('email_message_id'),
  emailDelivered: boolean('email_delivered').default(false),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// -----------------------------------------------------------
// SUPPORT TICKET ATTACHMENTS
// -----------------------------------------------------------
export const supportAttachmentSchema = pgTable('support_attachment', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id')
    .references(() => supportTicketSchema.id, { onDelete: 'cascade' })
    .notNull(),
  messageId: uuid('message_id').references(() => supportMessageSchema.id),
  fileName: text('file_name').notNull(),
  fileUrl: text('file_url').notNull(),
  fileSize: integer('file_size'),
  mimeType: text('mime_type'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// -----------------------------------------------------------
// KNOWLEDGE BASE ARTICLES
// -----------------------------------------------------------
export const knowledgeArticleSchema = pgTable('knowledge_article', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  body: text('body').notNull(),
  excerpt: text('excerpt'),
  category: text('category').notNull(),
  tags: jsonb('tags').default([]),
  isPublished: boolean('is_published').default(true).notNull(),
  isInternal: boolean('is_internal').default(false).notNull(),
  helpful: integer('helpful').default(0),
  notHelpful: integer('not_helpful').default(0),
  viewCount: integer('view_count').default(0),
  authorUserId: text('author_user_id'),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// -----------------------------------------------------------
// NOTIFICATIONS
// -----------------------------------------------------------
export const notificationSchema = pgTable('notification', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id')
    .references(() => organizationSchema.id, { onDelete: 'cascade' })
    .notNull(),
  userId: text('user_id'),
  type: text('type').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  actionUrl: text('action_url'),
  actionLabel: text('action_label'),
  isRead: boolean('is_read').default(false).notNull(),
  readAt: timestamp('read_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// -----------------------------------------------------------
// USER SETTINGS
// -----------------------------------------------------------
export const userSettingsSchema = pgTable(
  'user_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    orgId: text('org_id')
      .references(() => organizationSchema.id, { onDelete: 'cascade' })
      .notNull(),
    theme: text('theme').default('system').notNull(),
    notifyPublish: boolean('notify_publish').default(true).notNull(),
    notifyFailure: boolean('notify_failure').default(true).notNull(),
    notifyApproval: boolean('notify_approval').default(true).notNull(),
    notifyBilling: boolean('notify_billing').default(true).notNull(),
    sidebarDensity: text('sidebar_density').default('comfortable').notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    userOrgIdx: uniqueIndex('user_settings_user_org_idx').on(
      table.userId,
      table.orgId,
    ),
  }),
);

// ============================================================
// v7 ADDITIONS
// ============================================================

// -----------------------------------------------------------
// CONTENT TEMPLATE (Trending content library)
// -----------------------------------------------------------
// export const contentTemplateSchema = pgTable('content_template', {
//   id: uuid('id').primaryKey().defaultRandom(),
//   sourceUrl: text('source_url').notNull(),
//   sourcePlatform: text('source_platform').notNull(),
//   sourceCreator: text('source_creator'),
//   sourceVideoId: text('source_video_id'),
//   mediaUrl: text('media_url'),
//   thumbnailUrl: text('thumbnail_url').notNull(),
//   thumbnailUrls: jsonb('thumbnail_urls').default({}),
//   durationSeconds: integer('duration_seconds'),
//   contentType: text('content_type').notNull(),
//   niches: jsonb('niches').default([]),
//   angles: jsonb('angles').default([]),
//   structure: jsonb('structure').default({}),
//   engagementScore: real('engagement_score'),
//   viewCount: integer('view_count'),
//   likeCount: integer('like_count'),
//   shareCount: integer('share_count'),
//   commentCount: integer('comment_count'),
//   curationStatus: text('curation_status').default('pending'),
//   curatedBy: text('curated_by'),
//   curatedAt: timestamp('curated_at', { mode: 'date' }),
//   remixCount: integer('remix_count').default(0),
//   publishCount: integer('publish_count').default(0),
//   avgRemixPerformance: real('avg_remix_performance'),
//   addedAt: timestamp('added_at', { mode: 'date' }).defaultNow(),
//   lastRefreshedAt: timestamp('last_refreshed_at', { mode: 'date' }),
//   isActive: boolean('is_active').default(true),
//   trainingUsed: boolean('training_used').default(false),
//   updatedAt: timestamp('updated_at', { mode: 'date' })
//     .defaultNow()
//     .$onUpdate(() => new Date())
//     .notNull(),
//   createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
// });

export const contentTemplateSchema = pgTable(
  'content_template',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceUrl: text('source_url').notNull(),
    sourcePlatform: text('source_platform').notNull(),
    sourceCreator: text('source_creator'),
    sourceVideoId: text('source_video_id'),
    mediaUrl: text('media_url'),
    thumbnailUrl: text('thumbnail_url').notNull(),
    thumbnailUrls: jsonb('thumbnail_urls').default({}),
    slideCaptions: jsonb('slide_captions').default({}),
    durationSeconds: integer('duration_seconds'),
    contentType: text('content_type').notNull(),
    niches: jsonb('niches').default([]),
    angles: jsonb('angles').default([]),
    structure: jsonb('structure').default({}),
    engagementScore: real('engagement_score'),
    viewCount: integer('view_count'),
    likeCount: integer('like_count'),
    shareCount: integer('share_count'),
    commentCount: integer('comment_count'),
    curationStatus: text('curation_status').default('pending'),
    curatedBy: text('curated_by'),
    curatedAt: timestamp('curated_at', { mode: 'date' }),
    remixCount: integer('remix_count').default(0),
    publishCount: integer('publish_count').default(0),
    avgRemixPerformance: real('avg_remix_performance'),
    addedAt: timestamp('added_at', { mode: 'date' }).defaultNow(),
    lastRefreshedAt: timestamp('last_refreshed_at', { mode: 'date' }),
    isActive: boolean('is_active').default(true),
    trainingUsed: boolean('training_used').default(false),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    // This creates the exact index Postgres needs for source_url upserts
    sourceUrlIdx: uniqueIndex('content_template_source_url_idx').on(table.sourceUrl),
  }),
);

// -----------------------------------------------------------
// CAMPAIGN
// -----------------------------------------------------------
export const campaignSchema = pgTable('campaign', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id')
    .references(() => organizationSchema.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').default('draft').notNull(),
  contentMix: jsonb('content_mix').default({}),
  remixRatio: integer('remix_ratio').default(50),
  angles: jsonb('angles').default([]),
  mentionFrequency: text('mention_frequency').default('sometimes'),
  genderPreference: text('gender_preference'),
  ownMediaMix: integer('own_media_mix').default(50),
  influencerFrequency: integer('influencer_frequency').default(0),
  targetAccounts: jsonb('target_accounts').default([]),
  postsPerDay: integer('posts_per_day').default(3),
  campaignLengthDays: integer('campaign_length_days').default(7),
  startDate: timestamp('start_date', { mode: 'date' }),
  totalPosts: integer('total_posts').default(0),
  generatedPosts: integer('generated_posts').default(0),
  reRollsRemaining: integer('re_rolls_remaining').default(4),
  qualityThreshold: real('quality_threshold').default(0.7),
  totalEngagement: integer('total_engagement').default(0),
  avgEngagementRate: real('avg_engagement_rate'),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// -----------------------------------------------------------
// CAMPAIGN CONTENT
// -----------------------------------------------------------
export const campaignContentSchema = pgTable('campaign_content', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id')
    .references(() => campaignSchema.id, { onDelete: 'cascade' })
    .notNull(),
  contentItemId: uuid('content_item_id')
    .references(() => contentItemSchema.id, { onDelete: 'cascade' })
    .notNull(),
  sequenceIndex: integer('sequence_index').default(0),
  scheduledDate: timestamp('scheduled_date', { mode: 'date' }),
  scheduledTime: text('scheduled_time'),
  isRolled: boolean('is_rolled').default(false),
});

// -----------------------------------------------------------
// AI INFLUENCER
// -----------------------------------------------------------
export const aiInfluencerSchema = pgTable('ai_influencer', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id')
    .references(() => organizationSchema.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  description: text('description'),
  gender: text('gender'),
  ageRange: text('age_range'),
  ethnicity: text('ethnicity'),
  hairStyle: text('hair_style'),
  hairColor: text('hair_color'),
  bodyType: text('body_type'),
  fashionStyle: text('fashion_style'),
  poseStyle: text('pose_style'),
  backgroundPreference: text('background_preference'),
  baseImageUrl: text('base_image_url'),
  referenceImageUrls: jsonb('reference_image_urls').default([]),
  loraModelId: text('lora_model_id'),
  usageCount: integer('usage_count').default(0),
  isActive: boolean('is_active').default(true),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// -----------------------------------------------------------
// CONTENT ANGLE
// -----------------------------------------------------------
export const contentAngleSchema = pgTable('content_angle', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').references(() => organizationSchema.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color'),
  isSystem: boolean('is_system').default(false),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// -----------------------------------------------------------
// MEDIA ASSET
// -----------------------------------------------------------
export const mediaAssetSchema = pgTable('media_asset', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id')
    .references(() => organizationSchema.id, { onDelete: 'cascade' })
    .notNull(),
  uploadcareUuid: text('uploadcare_uuid'),
  url: text('url').notNull(),
  thumbnailUrl: text('thumbnail_url'),
  assetType: text('asset_type').notNull(),
  mimeType: text('mime_type'),
  fileSize: integer('file_size'),
  width: integer('width'),
  height: integer('height'),
  aspectRatio: text('aspect_ratio'),
  durationSeconds: real('duration_seconds'),
  tags: jsonb('tags').default([]),
  description: text('description'),
  source: text('source').default('upload'),
  aiMetadata: jsonb('ai_metadata').default({}),
  usageCount: integer('usage_count').default(0),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// -----------------------------------------------------------
// AUTOMATION RULE
// -----------------------------------------------------------
export const automationRuleSchema = pgTable('automation_rule', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id')
    .references(() => organizationSchema.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  triggerType: text('trigger_type').notNull(),
  triggerConfig: jsonb('trigger_config').default({}),
  actionType: text('action_type').notNull(),
  actionConfig: jsonb('action_config').default({}),
  isActive: boolean('is_active').default(true),
  lastRunAt: timestamp('last_run_at', { mode: 'date' }),
  nextRunAt: timestamp('next_run_at', { mode: 'date' }),
  runCount: integer('run_count').default(0),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// -----------------------------------------------------------
// ENGINE REQUEST LOG
// -----------------------------------------------------------
export const engineRequestLogSchema = pgTable('engine_request_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  contentItemId: uuid('content_item_id'),
  campaignId: uuid('campaign_id'),
  requestType: text('request_type').notNull(),
  engineUrl: text('engine_url'),
  modelUsed: text('model_used'),
  requestPayloadSize: integer('request_payload_size'),
  responsePayloadSize: integer('response_payload_size'),
  durationMs: integer('duration_ms'),
  status: text('status'),
  errorMessage: text('error_message'),
  costEstimate: real('cost_estimate'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});
