import {
  boolean,
  index,
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
    billingInterval: text('billing_interval').default('month').notNull(),
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
  // Phase 1 social-profile onboarding provenance. Nullable so existing
  // rows stay valid; 'website' | 'instagram' | 'tiktok' | 'twitter' |
  // 'linktree' | 'youtube' when set. sourceHandle stores the bare handle
  // (e.g. 'garyvee') or the raw URL when we cannot normalize it.
  brandProfileSource: text('brand_profile_source'),
  brandProfileSourceHandle: text('brand_profile_source_handle'),
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
  // eslint-disable-next-line ts/no-use-before-define
  campaignId: uuid('campaign_id').references(() => campaignSchema.id, {
    onDelete: 'set null',
  }),
  // eslint-disable-next-line ts/no-use-before-define
  templateId: uuid('template_id').references(() => contentTemplateSchema.id, {
    onDelete: 'set null',
  }),
  // eslint-disable-next-line ts/no-use-before-define
  influencerId: uuid('influencer_id').references(() => aiInfluencerSchema.id, {
    onDelete: 'set null',
  }),
  // eslint-disable-next-line ts/no-use-before-define
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
  table => ({
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
  permalink: text('permalink'),
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
  table => ({
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
    // Cloudinary public_id — required to run explicit-API re-moderation and to
    // match webhook notifications back to a template row.
    cloudinaryPublicId: text('cloudinary_public_id'),
    // Latest Cloudinary moderation verdict. Nullable because pre-moderation
    // rows exist (backfill will fill them in).
    // Values: 'approved' | 'rejected' | 'pending' | 'overridden'
    moderationStatus: text('moderation_status'),
    // Add-on that produced the current verdict: 'aws_rek' | 'aws_rek_video' |
    // 'webpurify' | 'google_video_moderation' | 'manual' | ...
    moderationKind: text('moderation_kind'),
    // Raw labels + confidence scores from the moderation provider, useful for
    // debugging false positives.
    moderationLabels: jsonb('moderation_labels').default([]),
    moderationCheckedAt: timestamp('moderation_checked_at', { mode: 'date' }),
    // All Cloudinary public_ids the moderation webhook should match against
    // for THIS row. For single-asset rows (video), this is just
    // [cloudinaryPublicId]. For slideshows, one entry per slide so that a
    // rejection on any slide can flip the whole row.
    moderationPublicIds: jsonb('moderation_public_ids').$type<string[]>().default([]).notNull(),
    // Public_ids that have received an 'approved' callback so far. Row only
    // flips to isActive=true once approvedIds ⊇ publicIds and no rejection
    // has been recorded.
    moderationApprovedIds: jsonb('moderation_approved_ids').$type<string[]>().default([]).notNull(),
    // Source media kind for the underlying template asset — 'image' | 'video' | 'mixed'.
    // Used by Blitz to filter video-only content types (video_hook / video_hook_demo)
    // to templates whose source is actually a video. Backfill from mediaUrl extension.
    sourceMediaType: text('source_media_type'),
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
  table => ({
    // This creates the exact index Postgres needs for source_url upserts
    sourceUrlIdx: uniqueIndex('content_template_source_url_idx').on(table.sourceUrl),
  }),
);

// -----------------------------------------------------------
// CONTENT EDIT SESSION
// Persistent editing session for the new video editor.
// -----------------------------------------------------------
export const contentEditSchema = pgTable('content_edit', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id')
    .references(() => organizationSchema.id, { onDelete: 'cascade' })
    .notNull(),
  userId: text('user_id').notNull(),

  // Source of the edit session
  contentItemId: uuid('content_item_id').references(
    () => contentItemSchema.id,
    { onDelete: 'cascade' },
  ),
  templateId: uuid('template_id').references(
    () => contentTemplateSchema.id,
    { onDelete: 'set null' },
  ),
  source: text('source').notNull(), // 'remix' | 'generate' | 'manual'

  // Resolved internal content type
  contentType: text('content_type').notNull(),
  contentMode: text('content_mode').default('normal'),
  targetPlatforms: jsonb('target_platforms').default([]),
  aspectRatio: text('aspect_ratio').default('9:16'),

  // Editable content
  script: jsonb('script').default({}),
  style: jsonb('style').default({}),
  layout: text('layout').default('centered'),
  timing: jsonb('timing').default({}),

  // Media slots
  mediaSlots: jsonb('media_slots').default({}),
  audioTrack: jsonb('audio_track').default(null),

  // Brand / enrichment context
  enrichment: jsonb('enrichment').default({}),
  brandProfileSnapshot: jsonb('brand_profile_snapshot').default({}),

  // Render state
  previewRenderUrl: text('preview_render_url'),
  previewRenderId: text('preview_render_id'),
  finalRenderUrl: text('final_render_url'),
  finalRenderId: text('final_render_id'),
  renderStatus: text('render_status').default('idle'), // idle | rendering | done | failed

  // Status / lifecycle
  status: text('status').default('draft'), // draft | approved | discarded
  isAutosave: boolean('is_autosave').default(false),

  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

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
  postsPerDay: integer('posts_per_day').default(10),
  campaignLengthDays: integer('campaign_length_days').default(7),
  startDate: timestamp('start_date', { mode: 'date' }),
  totalPosts: integer('total_posts').default(0),
  generatedPosts: integer('generated_posts').default(0),
  reRollsRemaining: integer('re_rolls_remaining').default(4),
  qualityThreshold: real('quality_threshold').default(0.7),
  pinterestPercent: integer('pinterest_percent').default(0),
  enabledInfluencerIds: jsonb('enabled_influencer_ids').default([]),
  blitzAdvanced: jsonb('blitz_advanced').default({}),
  // Blitz-only: accounts explicitly disabled from publishing. Effective
  // publish list is derived at read time as
  //   connectedAccounts − blitzDisabledAccountIds
  // so newly connected accounts are opt-out (auto-included) and deleted
  // accounts disappear for free. See memory nativpost-blitz-account-model.
  blitzDisabledAccountIds: jsonb('blitz_disabled_account_ids').default([]),
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
  // org_id is nullable to allow system baseline library rows (is_system=true)
  orgId: text('org_id').references(() => organizationSchema.id, { onDelete: 'cascade' }),
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
  // Phase I1 additions
  voiceId: text('voice_id'),
  voiceProvider: text('voice_provider').default('elevenlabs'),
  loraTrainingJobId: text('lora_training_job_id'),
  loraStatus: text('lora_status').default('pending'), // pending | training | ready | failed
  trainingMode: text('training_mode').default('flux_lora'), // flux_lora | nano_banana
  isSystem: boolean('is_system').default(false),
  personaPrompt: text('persona_prompt'),
  archetype: text('archetype'), // journey | theme | spinoff (v2)
  usageCount: integer('usage_count').default(0),
  // Cloudinary URL of most recent talking-head render. Producer: reconcile.ts
  // sets this on lipsync success. Consumer: campaign engine hydrates
  // sourceMediaSlots.faceVideo for talking_head posts.
  latestVideoUrl: text('latest_video_url'),
  // Pool of talking-head video URLs (one entry per successful lipsync render).
  // Producer: reconcile.ts appends on each success. Consumer: campaign engine
  // round-robins through the pool so posts get varied face videos.
  // Each entry: { url, thumbnailUrl?, durationSec?, createdAt }
  latestVideoUrls: jsonb('latest_video_urls').default([]),
  isActive: boolean('is_active').default(true),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// -----------------------------------------------------------
// VOICE CLONE (per-org ElevenLabs cloned voices)
// -----------------------------------------------------------
export const voiceCloneSchema = pgTable('voice_clone', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id')
    .references(() => organizationSchema.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  elevenlabsVoiceId: text('elevenlabs_voice_id').notNull(),
  sourceUrl: text('source_url'),
  previewUrl: text('preview_url'),
  createdBy: text('created_by'),
  deletedAt: timestamp('deleted_at', { mode: 'date' }),
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
// INFLUENCER ANGLE (join: ai_influencer ↔ content_angle)
// -----------------------------------------------------------
export const influencerAngleSchema = pgTable('influencer_angle', {
  id: uuid('id').primaryKey().defaultRandom(),
  influencerId: uuid('influencer_id')
    .references(() => aiInfluencerSchema.id, { onDelete: 'cascade' })
    .notNull(),
  contentAngleId: uuid('content_angle_id')
    .references(() => contentAngleSchema.id, { onDelete: 'cascade' })
    .notNull(),
  weight: integer('weight').default(1),
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
  influencerId: uuid('influencer_id').references(() => aiInfluencerSchema.id, { onDelete: 'set null' }),
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

// -----------------------------------------------------------
// APIFY SEED RUN (async ingestion tracking for trending seed pipeline)
// -----------------------------------------------------------
export const apifySeedRunSchema = pgTable('apify_seed_run', {
  id: text('id').primaryKey(), // Apify run ID (external ID, like organizationSchema.id pattern)
  provider: text('provider').notNull(), // 'instagram' | 'tiktok' | 'tiktok-slideshow'
  actorId: text('actor_id').notNull(),
  status: text('status').default('pending').notNull(), // pending | succeeded | failed | processed
  params: jsonb('params').default({}), // { usernames, limit, minLikes/minViews, curationStatus, offset }
  itemsFetched: integer('items_fetched'),
  itemsInserted: integer('items_inserted'),
  errorMessage: text('error_message'),
  requestedAt: timestamp('requested_at', { mode: 'date' }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { mode: 'date' }),
  processedAt: timestamp('processed_at', { mode: 'date' }),
});

// -----------------------------------------------------------
// CAMPAIGN JOB (async generation queue for long-running campaign builds)
// -----------------------------------------------------------
// Rows drive `POST /api/campaigns/[id]/generate` (creates a queued job and
// returns immediately) and `POST /api/cron/campaigns/process` (drains the
// queue, one job per invocation, with retry-with-backoff). The status +
// progress fields power the campaigns list progress bar and any editor /
// calendar polling that needs to reflect real % progress instead of a
// spinner (per the long-running-progress team convention).
// -----------------------------------------------------------
export const campaignJobSchema = pgTable('campaign_job', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id')
    .references(() => organizationSchema.id, { onDelete: 'cascade' })
    .notNull(),
  campaignId: uuid('campaign_id')
    .references(() => campaignSchema.id, { onDelete: 'cascade' })
    .notNull(),
  // queued | processing | done | failed
  status: text('status').default('queued').notNull(),
  progress: integer('progress').default(0).notNull(), // 0..100
  // starting | engine_generating | saving_posts | done | error
  step: text('step').default('starting').notNull(),
  postsTotal: integer('posts_total').default(0).notNull(),
  postsCompleted: integer('posts_completed').default(0).notNull(),
  postsFailed: integer('posts_failed').default(0).notNull(),
  errorMessage: text('error_message'),
  // Optional overrides captured from the start-endpoint request body so the
  // background worker can replay them without re-reading the HTTP request.
  topicOverride: text('topic_override'),
  targetPlatformsOverride: jsonb('target_platforms_override'),
  attempts: integer('attempts').default(0).notNull(),
  // Retry backoff — a queued job with nextAttemptAt in the future is skipped
  // until the timestamp passes. Null = eligible immediately.
  nextAttemptAt: timestamp('next_attempt_at', { mode: 'date' }),
  startedAt: timestamp('started_at', { mode: 'date' }),
  completedAt: timestamp('completed_at', { mode: 'date' }),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// -----------------------------------------------------------
// AI STUDIO JOB (Fal.ai queue jobs owned by AI Studio surface)
//
// Every generation kicked off from /dashboard/ai-studio inserts a row
// here. Credits are reserved on submit and either committed (webhook OK)
// or refunded (webhook error, cancel, sweeper). Webhook route reconciles
// output payload into Cloudinary + media_asset then flips status.
// -----------------------------------------------------------
export const aiStudioJobSchema = pgTable('ai_studio_job', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id')
    .references(() => organizationSchema.id, { onDelete: 'cascade' })
    .notNull(),
  userId: text('user_id'),
  modelId: text('model_id').notNull(), // matches models.ts id
  kind: text('kind').notNull(), // image | image-edit | video | video-lipsync
  // reserved | queued | processing | succeeded | failed | canceled | refunded
  status: text('status').default('reserved').notNull(),
  falRequestId: text('fal_request_id'),
  input: jsonb('input').default({}).notNull(),
  output: jsonb('output'),
  creditsReserved: integer('credits_reserved').default(0).notNull(),
  creditsCharged: integer('credits_charged'),
  errorMessage: text('error_message'),
  mediaAssetId: uuid('media_asset_id').references(() => mediaAssetSchema.id, { onDelete: 'set null' }),
  webhookReceivedAt: timestamp('webhook_received_at', { mode: 'date' }),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ── Long-Form Video Projects ──
export const longFormProjectSchema = pgTable('long_form_project', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').references(() => organizationSchema.id, { onDelete: 'cascade' }).notNull(),
  userId: text('user_id'),
  title: text('title'),
  topic: text('topic').notNull(),
  script: text('script'),
  narrationText: text('narration_text'),
  scenes: jsonb('scenes').default([]),
  // Each scene: { id, order, description, visualPrompt, cameraDirection,
  //   durationSec, transition, keyframeUrl?, videoClipUrl?,
  //   videoClipAssetId?, status, locked?, userProvided?, keyframeSource? }
  metadata: jsonb('metadata').default({}),
  // Project-level knobs: { voiceId?, voiceName?, bgMusicUrl?, bgMusicName?,
  //   referenceImageUrl?, aspectRatio?, imageModelId?, videoModelId? }
  status: text('status').default('draft'),
  // draft | script_ready | generating | clips_ready | assembling | completed | failed
  creditsReserved: integer('credits_reserved').default(0),
  creditsCharged: integer('credits_charged'),
  assembledVideoUrl: text('assembled_video_url'),
  assembledVideoAssetId: uuid('assembled_video_asset_id'),
  errorMessage: text('error_message'),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// -----------------------------------------------------------
// BLITZ MEDIA USAGE — per-asset consumption log used by Blitz for
// cross-batch dedup. An asset is ineligible for another Blitz post
// while a row exists within the 90-day sliding window.
// -----------------------------------------------------------
export const blitzMediaUsageSchema = pgTable(
  'blitz_media_usage',
  {
    id: serial('id').primaryKey(),
    orgId: text('org_id')
      .references(() => organizationSchema.id, { onDelete: 'cascade' })
      .notNull(),
    // Cloudinary public_id (or media_asset.id UUID for legacy rows).
    assetPublicId: text('asset_public_id').notNull(),
    assetType: text('asset_type').notNull(), // 'image' | 'video'
    // eslint-disable-next-line ts/no-use-before-define
    contentItemId: uuid('content_item_id').references(() => contentItemSchema.id, {
      onDelete: 'set null',
    }),
    campaignId: uuid('campaign_id').references(() => campaignSchema.id, {
      onDelete: 'set null',
    }),
    usedAt: timestamp('used_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({
    orgAssetIdx: index('blitz_media_usage_org_asset_idx').on(
      t.orgId,
      t.assetPublicId,
      t.usedAt,
    ),
    orgUsedIdx: index('blitz_media_usage_org_used_idx').on(t.orgId, t.usedAt),
  }),
);

// -----------------------------------------------------------
// BLITZ TEMPLATE USAGE — per-org content_template consumption log.
// Used to prevent the same template being remixed twice by the same
// org within the 90-day window.
// -----------------------------------------------------------
export const blitzTemplateUsageSchema = pgTable(
  'blitz_template_usage',
  {
    id: serial('id').primaryKey(),
    orgId: text('org_id')
      .references(() => organizationSchema.id, { onDelete: 'cascade' })
      .notNull(),
    templateId: uuid('template_id')
      .references(() => contentTemplateSchema.id, { onDelete: 'cascade' })
      .notNull(),
    // eslint-disable-next-line ts/no-use-before-define
    contentItemId: uuid('content_item_id').references(() => contentItemSchema.id, {
      onDelete: 'set null',
    }),
    campaignId: uuid('campaign_id').references(() => campaignSchema.id, {
      onDelete: 'set null',
    }),
    usedAt: timestamp('used_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({
    orgTplIdx: index('blitz_template_usage_org_tpl_idx').on(
      t.orgId,
      t.templateId,
      t.usedAt,
    ),
    orgUsedIdx: index('blitz_template_usage_org_used_idx').on(t.orgId, t.usedAt),
  }),
);

// -----------------------------------------------------------
// API KEY — bearer credentials for the public /api/v1 surface.
// Pro plan and above. Full key is only shown once at creation;
// only sha256(hashedKey) + last-4 chars are persisted for
// display and revocation.
// -----------------------------------------------------------
export const apiKeySchema = pgTable(
  'api_key',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .references(() => organizationSchema.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    // Human-readable prefix, e.g. 'np_live' — always identifiable in logs.
    prefix: text('prefix').default('np_live').notNull(),
    // sha256 hex digest of the full secret. NEVER store the plaintext.
    hashedKey: text('hashed_key').notNull(),
    // Last 4 chars of the secret (for UI display: "np_live_...ab12").
    lastFour: text('last_four').notNull(),
    createdByUserId: text('created_by_user_id').notNull(),
    lastUsedAt: timestamp('last_used_at', { mode: 'date' }),
    lastUsedIp: text('last_used_ip'),
    expiresAt: timestamp('expires_at', { mode: 'date' }),
    revokedAt: timestamp('revoked_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  t => ({
    orgIdx: index('api_key_org_idx').on(t.orgId),
    hashedKeyIdx: uniqueIndex('api_key_hashed_key_idx').on(t.hashedKey),
  }),
);

// -----------------------------------------------------------
// WEBHOOK ENDPOINT — org-scoped outgoing webhook subscriptions.
// Deliveries are signed HMAC-SHA256 with the secret; secret is
// generated on create and shown to the user once (they can also
// reveal it later since it's stored as-is, unlike API keys).
// -----------------------------------------------------------
export const webhookEndpointSchema = pgTable(
  'webhook_endpoint',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .references(() => organizationSchema.id, { onDelete: 'cascade' })
      .notNull(),
    url: text('url').notNull(),
    // Plaintext HMAC secret; consumer needs it to verify signatures.
    // Stored in place (like Stripe endpoint_secrets in test env) so
    // the UI can reveal on demand. Rotate to invalidate.
    secret: text('secret').notNull(),
    // Array of event names this endpoint subscribes to. Empty = all.
    events: jsonb('events').$type<string[]>().default([]).notNull(),
    description: text('description'),
    enabled: boolean('enabled').default(true).notNull(),
    createdByUserId: text('created_by_user_id').notNull(),
    lastDeliveryAt: timestamp('last_delivery_at', { mode: 'date' }),
    lastDeliveryStatus: text('last_delivery_status'), // 'success' | 'failed'
    consecutiveFailures: integer('consecutive_failures').default(0).notNull(),
    disabledAt: timestamp('disabled_at', { mode: 'date' }),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  t => ({
    orgIdx: index('webhook_endpoint_org_idx').on(t.orgId),
  }),
);

// -----------------------------------------------------------
// WEBHOOK DELIVERY — audit log of every attempt to deliver a
// webhook payload. Keeps the last ~N per endpoint for debugging.
// -----------------------------------------------------------
export const webhookDeliverySchema = pgTable(
  'webhook_delivery',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    endpointId: uuid('endpoint_id')
      .references(() => webhookEndpointSchema.id, { onDelete: 'cascade' })
      .notNull(),
    orgId: text('org_id')
      .references(() => organizationSchema.id, { onDelete: 'cascade' })
      .notNull(),
    event: text('event').notNull(),
    payload: jsonb('payload').default({}).notNull(),
    statusCode: integer('status_code'),
    responseBody: text('response_body'),
    errorMessage: text('error_message'),
    attemptCount: integer('attempt_count').default(1).notNull(),
    durationMs: integer('duration_ms'),
    // 'pending' | 'success' | 'failed' | 'skipped'
    status: text('status').default('pending').notNull(),
    deliveredAt: timestamp('delivered_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  t => ({
    endpointIdx: index('webhook_delivery_endpoint_idx').on(t.endpointId, t.createdAt),
    orgIdx: index('webhook_delivery_org_idx').on(t.orgId, t.createdAt),
  }),
);

// ============================================================
// MANAGED SOCIAL INFRASTRUCTURE (MSI)
// See docs/managed-social-infrastructure.md. The state strings
// for `lifecycle_state`, `msi_job.state`, `msi_task.status`, etc.
// are OWNED by the state machines in `src/lib/msi/*` — keep the
// defaults below in sync with those modules.
// ============================================================

// -----------------------------------------------------------
// AUTHORIZATION GRANT — the legal spine (docs §4.1). No managed
// account is provisioned without an active grant. This is the
// customer's signed, revocable authorization for NativPost to
// operate accounts on their behalf.
// -----------------------------------------------------------
export const authorizationGrantSchema = pgTable(
  'authorization_grant',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .references(() => organizationSchema.id, { onDelete: 'cascade' })
      .notNull(),
    brandProfileId: uuid('brand_profile_id')
      .references(() => brandProfileSchema.id)
      .notNull(),
    grantVersion: text('grant_version').notNull(), // terms version signed
    scope: jsonb('scope').default({}).notNull(), // { platforms: [], countries: [] }
    signedByUserId: text('signed_by_user_id').notNull(), // Clerk user
    signedAt: timestamp('signed_at', { mode: 'date' }).defaultNow().notNull(),
    documentUrl: text('document_url'), // stored signed agreement
    status: text('status').default('active').notNull(), // active | revoked
    revokedAt: timestamp('revoked_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  t => ({
    orgIdx: index('authorization_grant_org_idx').on(t.orgId),
    brandIdx: index('authorization_grant_brand_idx').on(t.brandProfileId),
  }),
);

// -----------------------------------------------------------
// MSI PROVISIONING ORDER — a single purchase that fans out to N
// managed accounts (docs §4.3).
// -----------------------------------------------------------
export const msiProvisioningOrderSchema = pgTable(
  'msi_provisioning_order',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .references(() => organizationSchema.id, { onDelete: 'cascade' })
      .notNull(),
    stripeCheckoutSessionId: text('stripe_checkout_session_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    quantity: integer('quantity').default(1).notNull(),
    // Snapshot of the requested config: { country, platform, niche, handlePreferences }
    configSnapshot: jsonb('config_snapshot').default({}).notNull(),
    // pending | paid | fulfilling | fulfilled | cancelled | refunded
    status: text('status').default('pending').notNull(),
    paidAt: timestamp('paid_at', { mode: 'date' }),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  t => ({
    orgIdx: index('msi_provisioning_order_org_idx').on(t.orgId, t.createdAt),
  }),
);

// -----------------------------------------------------------
// MANAGED ACCOUNT — the product unit (docs §4.2). Once live,
// `socialAccountId` links to the existing `social_account` row so
// it publishes through the current pipeline (`lib/social-publish`).
// -----------------------------------------------------------
export const managedAccountSchema = pgTable(
  'managed_account',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .references(() => organizationSchema.id, { onDelete: 'cascade' })
      .notNull(),
    // MUST reference a real, disclosed brand — never anonymous (docs §2.1).
    brandProfileId: uuid('brand_profile_id')
      .references(() => brandProfileSchema.id)
      .notNull(),
    authorizationGrantId: uuid('authorization_grant_id')
      .references(() => authorizationGrantSchema.id)
      .notNull(),
    orderId: uuid('order_id').references(() => msiProvisioningOrderSchema.id, {
      onDelete: 'set null',
    }),
    platform: text('platform').notNull(), // tiktok | instagram | ...
    country: text('country').notNull(), // ISO country
    targetLocale: text('target_locale'),
    niche: text('niche'),
    handlePreferences: jsonb('handle_preferences')
      .$type<string[]>()
      .default([])
      .notNull(), // ordered @handle choices
    displayName: text('display_name'),
    // Owned by src/lib/msi/lifecycle.ts — see banner above.
    lifecycleState: text('lifecycle_state').default('ordered').notNull(),
    // Always customer-owned in the compliant model (docs §2.1, §9).
    credentialCustody: text('credential_custody')
      .default('customer_owned')
      .notNull(),
    // How this account is operated by the Execution Layer (docs §Execution
    // Layer): 'official_api' | 'delegated_access' | 'manual'. Set at
    // provisioning; null → resolver falls back to the platform default. An
    // implementation detail — never surfaced to the customer.
    executionStrategy: text('execution_strategy'),
    // Set when the account goes live → unified publishing.
    socialAccountId: uuid('social_account_id').references(
      () => socialAccountSchema.id,
    ),
    healthScore: integer('health_score'), // latest composite score (docs §11.3)
    liveAt: timestamp('live_at', { mode: 'date' }),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  t => ({
    orgIdx: index('managed_account_org_idx').on(t.orgId),
    stateIdx: index('managed_account_state_idx').on(t.lifecycleState),
    countryPlatformIdx: index('managed_account_country_platform_idx').on(
      t.country,
      t.platform,
    ),
  }),
);

// -----------------------------------------------------------
// MSI OPERATOR — internal ops-plane staff (docs §8). Not a
// customer; identified by Clerk user id. Capacity feeds the
// Capacity Engine (docs §6).
// -----------------------------------------------------------
export const msiOperatorSchema = pgTable(
  'msi_operator',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clerkUserId: text('clerk_user_id').notNull(),
    displayName: text('display_name'),
    country: text('country').notNull(),
    // operator | reviewer | qa | country_manager | ops_admin | ops_support | finance
    role: text('role').default('operator').notNull(),
    capacity: integer('capacity').default(10).notNull(), // max concurrent accounts
    activeLoad: integer('active_load').default(0).notNull(),
    status: text('status').default('active').notNull(), // active | inactive | suspended
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  t => ({
    clerkIdx: uniqueIndex('msi_operator_clerk_idx').on(t.clerkUserId),
    countryIdx: index('msi_operator_country_idx').on(t.country, t.role),
  }),
);

// -----------------------------------------------------------
// MSI DEVICE — a real phone + SIM operated in-country (docs §8.3).
// Capacity-limited; one account belongs to one device.
// -----------------------------------------------------------
export const msiDeviceSchema = pgTable(
  'msi_device',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    label: text('label').notNull(), // e.g. 'US-Phone-18'
    country: text('country').notNull(),
    carrier: text('carrier'), // SIM carrier, e.g. 'T-Mobile'
    simIdentifier: text('sim_identifier'),
    capacity: integer('capacity').default(5).notNull(),
    status: text('status').default('active').notNull(), // active | maintenance | retired
    managedByOperatorId: uuid('managed_by_operator_id').references(
      () => msiOperatorSchema.id,
      { onDelete: 'set null' },
    ),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  t => ({
    countryIdx: index('msi_device_country_idx').on(t.country, t.status),
  }),
);

// -----------------------------------------------------------
// MSI DEVICE ASSIGNMENT — which device currently hosts which
// managed account (docs §4.3). releasedAt set when it moves off.
// -----------------------------------------------------------
export const msiDeviceAssignmentSchema = pgTable(
  'msi_device_assignment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceId: uuid('device_id')
      .references(() => msiDeviceSchema.id, { onDelete: 'cascade' })
      .notNull(),
    managedAccountId: uuid('managed_account_id')
      .references(() => managedAccountSchema.id, { onDelete: 'cascade' })
      .notNull(),
    assignedAt: timestamp('assigned_at', { mode: 'date' }).defaultNow().notNull(),
    releasedAt: timestamp('released_at', { mode: 'date' }),
  },
  t => ({
    deviceIdx: index('msi_device_assignment_device_idx').on(t.deviceId),
    accountIdx: index('msi_device_assignment_account_idx').on(t.managedAccountId),
  }),
);

// -----------------------------------------------------------
// MSI JOB — the universal unit of work (docs §7). Every operation
// (create/update/publish/pause/transfer/recover/appeal/archive)
// is a job. State owned by src/lib/msi/job-workflow.ts.
// -----------------------------------------------------------
export const msiJobSchema = pgTable(
  'msi_job',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .references(() => organizationSchema.id, { onDelete: 'cascade' })
      .notNull(),
    managedAccountId: uuid('managed_account_id')
      .references(() => managedAccountSchema.id, { onDelete: 'cascade' })
      .notNull(),
    jobType: text('job_type').notNull(), // see JOB_TYPES in job-workflow.ts
    // For publish_post jobs: the content routed here from the publish flow
    // (docs §13 publish routing). Null for provisioning jobs.
    contentItemId: uuid('content_item_id').references(
      () => contentItemSchema.id,
      { onDelete: 'set null' },
    ),
    state: text('state').default('queued').notNull(),
    priority: integer('priority').default(0).notNull(),
    attempts: integer('attempts').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(3).notNull(),
    assignedOperatorId: uuid('assigned_operator_id').references(
      () => msiOperatorSchema.id,
      { onDelete: 'set null' },
    ),
    assignedDeviceId: uuid('assigned_device_id').references(
      () => msiDeviceSchema.id,
      { onDelete: 'set null' },
    ),
    slaDueAt: timestamp('sla_due_at', { mode: 'date' }),
    failureReason: text('failure_reason'),
    startedAt: timestamp('started_at', { mode: 'date' }),
    completedAt: timestamp('completed_at', { mode: 'date' }),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  t => ({
    accountIdx: index('msi_job_account_idx').on(t.managedAccountId),
    stateIdx: index('msi_job_state_idx').on(t.state),
    orgIdx: index('msi_job_org_idx').on(t.orgId),
  }),
);

// -----------------------------------------------------------
// MSI TASK — the structured checklist inside a job (docs §7.2).
// Operators complete tasks with evidence; they never get raw,
// free-form account access.
// -----------------------------------------------------------
export const msiTaskSchema = pgTable(
  'msi_task',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .references(() => msiJobSchema.id, { onDelete: 'cascade' })
      .notNull(),
    taskType: text('task_type').notNull(),
    sequence: integer('sequence').default(0).notNull(),
    status: text('status').default('pending').notNull(), // pending | in_progress | done | skipped
    completedByRole: text('completed_by_role'), // operator | reviewer | qa
    completedByUserId: text('completed_by_user_id'),
    evidenceUrl: text('evidence_url'),
    notes: text('notes'),
    completedAt: timestamp('completed_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  t => ({
    jobIdx: index('msi_task_job_idx').on(t.jobId, t.sequence),
  }),
);

// -----------------------------------------------------------
// MSI ACCOUNT REVIEW — the customer's 3-day review window
// (docs §5, §7). Drives the customer_review lifecycle state.
// -----------------------------------------------------------
export const msiAccountReviewSchema = pgTable(
  'msi_account_review',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    managedAccountId: uuid('managed_account_id')
      .references(() => managedAccountSchema.id, { onDelete: 'cascade' })
      .notNull(),
    windowOpensAt: timestamp('window_opens_at', { mode: 'date' })
      .defaultNow()
      .notNull(),
    windowClosesAt: timestamp('window_closes_at', { mode: 'date' }).notNull(),
    // pending | changes_requested | approved | expired
    status: text('status').default('pending').notNull(),
    // [{ field: 'bio' | 'username' | 'avatar' | 'display_name' | 'niche', note }]
    requestedChanges: jsonb('requested_changes').default([]).notNull(),
    respondedAt: timestamp('responded_at', { mode: 'date' }),
    respondedByUserId: text('responded_by_user_id'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  t => ({
    accountIdx: index('msi_account_review_account_idx').on(t.managedAccountId),
  }),
);

// -----------------------------------------------------------
// MSI ACTIVITY LOG — append-only audit + event stream (docs §7.4).
// Powers the customer-facing GitHub-style timeline (docs §13.2)
// AND is our compliance defense. Never mutate rows.
// -----------------------------------------------------------
export const msiActivityLogSchema = pgTable(
  'msi_activity_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    managedAccountId: uuid('managed_account_id').references(
      () => managedAccountSchema.id,
      { onDelete: 'cascade' },
    ),
    jobId: uuid('job_id').references(() => msiJobSchema.id, {
      onDelete: 'set null',
    }),
    actorType: text('actor_type').notNull(), // system | operator | customer
    actorId: text('actor_id'),
    action: text('action').notNull(), // e.g. 'profile_created', 'qa_passed', 'went_live'
    detail: jsonb('detail').default({}).notNull(),
    occurredAt: timestamp('occurred_at', { mode: 'date' }).defaultNow().notNull(),
  },
  t => ({
    accountIdx: index('msi_activity_log_account_idx').on(
      t.managedAccountId,
      t.occurredAt,
    ),
    jobIdx: index('msi_activity_log_job_idx').on(t.jobId),
  }),
);

// -----------------------------------------------------------
// MSI CAPACITY RESERVATION — soft-hold placed at checkout so two
// buyers can't oversell the same country/platform slots (docs §6).
// -----------------------------------------------------------
export const msiCapacityReservationSchema = pgTable(
  'msi_capacity_reservation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .references(() => organizationSchema.id, { onDelete: 'cascade' })
      .notNull(),
    orderId: uuid('order_id').references(() => msiProvisioningOrderSchema.id, {
      onDelete: 'cascade',
    }),
    country: text('country').notNull(),
    platform: text('platform').notNull(),
    quantity: integer('quantity').default(1).notNull(),
    status: text('status').default('held').notNull(), // held | consumed | released | expired
    expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  t => ({
    orgIdx: index('msi_capacity_reservation_org_idx').on(t.orgId),
    countryPlatformIdx: index('msi_capacity_reservation_cp_idx').on(
      t.country,
      t.platform,
      t.status,
    ),
  }),
);

// -----------------------------------------------------------
// MSI CREDENTIAL — vault POINTER only (docs §9). NEVER store
// plaintext credentials here. `vaultRef` points at the external
// secrets vault; `encryptedDek` is the envelope-encrypted Data
// Encryption Key wrapped by the KMS master key.
// -----------------------------------------------------------
export const msiCredentialSchema = pgTable(
  'msi_credential',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    managedAccountId: uuid('managed_account_id')
      .references(() => managedAccountSchema.id, { onDelete: 'cascade' })
      .notNull(),
    vaultRef: text('vault_ref').notNull(),
    encryptedDek: text('encrypted_dek'),
    // provisioning | nativpost_operating | transfer_requested | released
    custodyState: text('custody_state').default('provisioning').notNull(),
    lastRotatedAt: timestamp('last_rotated_at', { mode: 'date' }),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  t => ({
    accountIdx: uniqueIndex('msi_credential_account_idx').on(t.managedAccountId),
  }),
);

// Billable publish events (docs §6). One immutable row per successfully
// published post — the source of truth for future metered/usage billing. The
// publishing pipeline only WRITES here; a separate reporter (behind the
// MSI_METERED_BILLING_ENABLED flag) later ships un-reported rows to Stripe, so
// billing can be turned on without touching the pipeline. Idempotent: unique on
// jobId (a publish_post job maps 1:1 to a publish; retries reuse the job). Only
// emitted on success — failed/retried publishes never reach the terminal state.
export const msiBillablePublishEventSchema = pgTable(
  'msi_billable_publish_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .references(() => organizationSchema.id, { onDelete: 'cascade' })
      .notNull(),
    managedAccountId: uuid('managed_account_id')
      .references(() => managedAccountSchema.id, { onDelete: 'cascade' })
      .notNull(),
    // The publish_post job that produced this event — the idempotency anchor.
    jobId: uuid('job_id')
      .references(() => msiJobSchema.id, { onDelete: 'cascade' })
      .notNull(),
    contentItemId: uuid('content_item_id').references(
      () => contentItemSchema.id,
      { onDelete: 'set null' },
    ),
    platform: text('platform').notNull(),
    // UTC billing month, 'YYYY-MM' — the aggregation bucket for invoicing.
    billingPeriod: text('billing_period').notNull(),
    occurredAt: timestamp('occurred_at', { mode: 'date' }).notNull(),
    // Set once the event has been reported to the billing provider (null =
    // pending). The reporter is a no-op until the feature flag is on.
    reportedAt: timestamp('reported_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  t => ({
    jobIdx: uniqueIndex('msi_billable_publish_job_idx').on(t.jobId),
    periodIdx: index('msi_billable_publish_period_idx').on(
      t.orgId,
      t.billingPeriod,
    ),
  }),
);
