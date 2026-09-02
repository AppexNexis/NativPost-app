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
    // Polar.sh — the Merchant-of-Record rail, mirroring the Stripe columns
    // above. Both sets can be populated on one org: an account that subscribed
    // on Stripe and later re-subscribed on Polar keeps its Stripe history.
    // `paymentType` records which rail the LIVE subscription is on.
    polarCustomerId: text('polar_customer_id'),
    polarSubscriptionId: text('polar_subscription_id'),
    // Polar has no separate price object — a product IS its pricing — so this
    // is the product id, not a price id.
    polarProductId: text('polar_product_id'),
    polarSubscriptionStatus: text('polar_subscription_status'),
    polarSubscriptionCurrentPeriodEnd: integer(
      'polar_subscription_current_period_end',
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
  // ElevenLabs library voice ID for Blitz voice-over (Phase A). NULL = feature off for org.
  elevenlabsVoiceId: text('elevenlabs_voice_id'),
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
  // Specific social_account ids to publish to (account-level targeting; enables
  // multiple accounts per platform + managed accounts as first-class targets).
  // Empty/absent → publish to every active account of each targetPlatform
  // (backward-compatible with the platform-only model).
  targetAccountIds: jsonb('target_account_ids').$type<string[]>().default([]),
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
  // Account-level publish targets carried from the create/remix picker so the
  // editor's save can scope publishing to the exact selected accounts.
  targetAccountIds: jsonb('target_account_ids').$type<string[]>().default([]),
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
  // Per-platform publishing configuration for this campaign, keyed by platform:
  //   { tiktok: { publishMethod, privacyLevel, allowComment, isAIGC, ... } }
  // Carries the user's INTENT (values may be the USE_ACCOUNT_DEFAULT sentinel),
  // which the publisher resolves against account defaults and live creator_info
  // at publish time. See lib/tiktok/resolve-settings.ts. Without this the
  // scheduler had nothing to publish from and guessed — sending an invalid
  // TikTok privacy level and failing every scheduled TikTok post.
  platformSettings: jsonb('platform_settings').default({}),
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
export const mediaAssetSchema = pgTable(
  'media_asset',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .references(() => organizationSchema.id, { onDelete: 'cascade' })
      .notNull(),
    // Legacy columns (pre-Content Intelligence)
    uploadcareUuid: text('uploadcare_uuid'),
    influencerId: uuid('influencer_id').references(() => aiInfluencerSchema.id, { onDelete: 'set null' }),
    tags: jsonb('tags').default([]),
    description: text('description'),
    source: text('source').default('upload'),
    aiMetadata: jsonb('ai_metadata').default({}),
    // Content Intelligence Engine columns (0061)
    status: text('status').default('generated').notNull(),
    originType: text('origin_type').default('user_uploaded').notNull(),
    generationJobId: uuid('generation_job_id')
      .references(() => generationJobSchema.id, { onDelete: 'set null' }),
    providerId: text('provider_id')
      .references(() => providerSchema.id, { onDelete: 'set null' }),
    modelId: text('model_id')
      .references(() => modelSchema.id, { onDelete: 'set null' }),
    providerJobId: text('provider_job_id'),
    generationInput: jsonb('generation_input'),
    generationVersion: text('generation_version'),
    cloudinaryPublicId: text('cloudinary_public_id'),
    url: text('url').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    assetType: text('asset_type').notNull(),
    mimeType: text('mime_type'),
    fileSize: integer('file_size'),
    width: integer('width'),
    height: integer('height'),
    aspectRatio: text('aspect_ratio'),
    durationSeconds: real('duration_seconds'),
    hasAudio: boolean('has_audio').default(false).notNull(),
    audioStatus: text('audio_status').default('unknown').notNull(),
    audioDurationMs: integer('audio_duration_ms'),
    audioCodec: text('audio_codec'),
    audioSampleRate: integer('audio_sample_rate'),
    audioChannels: integer('audio_channels'),
    audioSource: text('audio_source'),
    audioLoudnessLufs: real('audio_loudness_lufs'),
    fileHash: text('file_hash'),
    perceptualHash: text('perceptual_hash'),
    visualQualityScore: real('visual_quality_score'),
    technicalQualityScore: real('technical_quality_score'),
    audioQualityScore: real('audio_quality_score'),
    compositionQualityScore: real('composition_quality_score'),
    semanticQualityScore: real('semantic_quality_score'),
    safetyQualityScore: real('safety_quality_score'),
    qualityScore: real('quality_score'),
    qualityFlags: jsonb('quality_flags').default([]).$type<string[]>(),
    qualityCheckedAt: timestamp('quality_checked_at', { mode: 'date' }),
    // Vector columns exist in DB but are omitted here — use raw SQL for similarity search
    embeddingModel: text('embedding_model'),
    embeddingVersion: text('embedding_version'),
    embeddedAt: timestamp('embedded_at', { mode: 'date' }),
    deletedAt: timestamp('deleted_at', { mode: 'date' }),
    metadata: jsonb('metadata').default({}).notNull(),
    usageCount: integer('usage_count').default(0).notNull(),
    lastUsedAt: timestamp('last_used_at', { mode: 'date' }),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index('media_asset_org_id_idx').on(t.orgId),
    statusIdx: index('media_asset_status_idx').on(t.status),
    originTypeIdx: index('media_asset_origin_type_idx').on(t.originType),
    generationJobIdx: index('media_asset_generation_job_id_idx').on(t.generationJobId),
    providerIdx: index('media_asset_provider_id_idx').on(t.providerId),
    modelIdx: index('media_asset_model_id_idx').on(t.modelId),
    assetTypeIdx: index('media_asset_asset_type_idx').on(t.assetType),
    audioStatusIdx: index('media_asset_audio_status_idx').on(t.audioStatus),
    fileHashIdx: index('media_asset_file_hash_idx').on(t.fileHash),
    qualityScoreIdx: index('media_asset_quality_score_idx').on(t.qualityScore),
    orgAssetTypeIdx: index('media_asset_org_asset_type_idx').on(t.orgId, t.assetType),
    orgCreatedIdx: index('media_asset_org_created_at_idx').on(t.orgId, t.createdAt),
    deletedAtIdx: index('media_asset_deleted_at_idx').on(t.deletedAt),
  }),
);

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

    contentItemId: uuid('content_item_id').references(() => contentItemSchema.id, {
      onDelete: 'set null',
    }),
    campaignId: uuid('campaign_id').references(() => campaignSchema.id, {
      onDelete: 'set null',
    }),
    usedAt: timestamp('used_at', { mode: 'date' }).defaultNow().notNull(),
  },
  t => ({
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

    contentItemId: uuid('content_item_id').references(() => contentItemSchema.id, {
      onDelete: 'set null',
    }),
    campaignId: uuid('campaign_id').references(() => campaignSchema.id, {
      onDelete: 'set null',
    }),
    usedAt: timestamp('used_at', { mode: 'date' }).defaultNow().notNull(),
  },
  t => ({
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
    // Polar equivalents — populated when the order was paid through Polar.
    polarCheckoutId: text('polar_checkout_id'),
    polarSubscriptionId: text('polar_subscription_id'),
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
    // The platform's post id, captured by the execution layer when a publish
    // job runs through an official_api client (docs §6). Threaded into the
    // billable event at billing time for transparency. Null for manual/
    // provisioning jobs.
    platformPostId: text('platform_post_id'),
    // Opaque provider handle for an in-flight async publish (IG container id /
    // TikTok publish_id). Set when execution returns `processing`; the worker's
    // confirmation pass polls it on later ticks and clears it on resolution.
    executionHandle: text('execution_handle'),
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
    // The platform's own post id, set by a PlatformClient on a real automated
    // publish (null in the manual flow). Powers billing transparency —
    // "published to @brand, video 7665…, $1.50".
    platformPostId: text('platform_post_id'),
    // The live post permalink, threaded from the publish result. Lets an invoice
    // line link straight to the post it charged for (null when unavailable).
    permalink: text('permalink'),
    // Billable outcome. 'published' is the only billable status today; the
    // column lets non-billable outcomes coexist without a separate table.
    status: text('status').default('published').notNull(),
    // UTC billing month, 'YYYY-MM' — the aggregation bucket for invoicing.
    billingPeriod: text('billing_period').notNull(),
    // When the publish occurred (== platform publish time in the automated flow).
    occurredAt: timestamp('occurred_at', { mode: 'date' }).notNull(),
    // Set once the event has been reported to the billing provider (null =
    // pending). The reporter is a no-op until the feature flag is on.
    reportedAt: timestamp('reported_at', { mode: 'date' }),
    // The provider's returned usage-record id — reconciliation anchor written
    // by the reporter when it ships this event to Stripe.
    stripeUsageRecordId: text('stripe_usage_record_id'),
    // Same anchor for Polar. Holds the `external_id` we send with the ingested
    // event (which is this row's id), since Polar's ingest response returns
    // counts rather than per-event ids. Exactly one of the two is set per row,
    // which also records WHICH provider metered the event.
    polarUsageEventId: text('polar_usage_event_id'),
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

// -----------------------------------------------------------
// MSI ADD-ON SUBSCRIPTIONS (docs §19)
// Per-org activation of an MSI add-on (Managed Posting, Ads, Content, …). The
// add-on catalog itself lives in code (src/lib/msi/addons.ts); this row records
// which add-ons an org has turned on, the selected tier, and the Stripe billing
// linkage. One row per (org, addon) — enforced by the unique index. Deliberately
// thin: an add-on changes WHO performs the work, not the underlying pipeline.
// -----------------------------------------------------------
export const msiAddonSubscriptionSchema = pgTable(
  'msi_addon_subscription',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .references(() => organizationSchema.id, { onDelete: 'cascade' })
      .notNull(),
    // Matches an MsiAddonId in the code catalog (e.g. 'managed_posting').
    addonId: text('addon_id').notNull(),
    // active | paused | cancelled
    status: text('status').default('active').notNull(),
    // Selected tier id for fixed-tier add-ons (e.g. 'professional'); null for
    // usage/percent/custom pricing models.
    tierId: text('tier_id'),
    // Stripe subscription item that bills this add-on, when metered/subscribed.
    stripeSubscriptionItemId: text('stripe_subscription_item_id'),
    // Polar has no per-item subscription API — an add-on bought on Polar is its
    // OWN subscription against a dedicated add-on product. This holds that
    // subscription's id. See src/lib/msi/addon-billing.ts for the mapping.
    polarSubscriptionId: text('polar_subscription_id'),
    // Per-add-on configuration (e.g. ad budgets, reply scope, target markets).
    config: jsonb('config').$type<Record<string, unknown>>().default({}).notNull(),
    activatedAt: timestamp('activated_at', { mode: 'date' }),
    cancelledAt: timestamp('cancelled_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  t => ({
    orgAddonIdx: uniqueIndex('msi_addon_org_addon_idx').on(t.orgId, t.addonId),
    orgIdx: index('msi_addon_org_idx').on(t.orgId),
  }),
);

// -----------------------------------------------------------
// MSI ANALYTICS REPORTS (docs §19 — Managed Analytics add-on)
// The monthly report artifact: one per (managed account, billing period). AI
// composes a draft (status in_review); an operator delivers it (delivered).
// -----------------------------------------------------------
export const msiAnalyticsReportSchema = pgTable(
  'msi_analytics_report',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .references(() => organizationSchema.id, { onDelete: 'cascade' })
      .notNull(),
    managedAccountId: uuid('managed_account_id')
      .references(() => managedAccountSchema.id, { onDelete: 'cascade' })
      .notNull(),
    // UTC billing month, 'YYYY-MM'.
    billingPeriod: text('billing_period').notNull(),
    // generating | in_review | delivered
    status: text('status').default('in_review').notNull(),
    // Structured report body: { headline, sections[], recommendations[] }.
    summary: jsonb('summary').$type<Record<string, unknown>>().default({}).notNull(),
    generatedAt: timestamp('generated_at', { mode: 'date' }),
    deliveredAt: timestamp('delivered_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  t => ({
    acctPeriodIdx: uniqueIndex('msi_analytics_report_acct_period_idx').on(
      t.managedAccountId,
      t.billingPeriod,
    ),
    orgIdx: index('msi_analytics_report_org_idx').on(t.orgId),
  }),
);

// -----------------------------------------------------------
// MSI AD CAMPAIGNS (docs §19 — Managed Advertising add-on)
// Percent-of-spend billing: a one-time setup fee on creation + a management fee
// (management_pct of recorded spend) billed as invoice items. The ad SPEND
// itself is paid by the customer directly to the ad platform — never through us.
// -----------------------------------------------------------
export const msiAdCampaignSchema = pgTable(
  'msi_ad_campaign',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .references(() => organizationSchema.id, { onDelete: 'cascade' })
      .notNull(),
    managedAccountId: uuid('managed_account_id')
      .references(() => managedAccountSchema.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    platform: text('platform').notNull(),
    objective: text('objective'),
    // active | paused | ended
    status: text('status').default('active').notNull(),
    // Management fee percentage of spend (10–20).
    managementPct: integer('management_pct').notNull(),
    // Accumulated recorded ad spend, in cents (paid by the customer to the ad
    // platform; tracked here to compute our management fee).
    spendCents: integer('spend_cents').default(0).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  t => ({
    orgIdx: index('msi_ad_campaign_org_idx').on(t.orgId),
  }),
);

// -----------------------------------------------------------
// MSI COMMUNITY REPLIES (docs §19 — Managed Community add-on)
// Operators log the replies/DMs/moderation they handle; usage is summed per
// month against the tier's reply quota. Flat-tier billed like other add-ons.
// -----------------------------------------------------------
export const msiCommunityReplySchema = pgTable(
  'msi_community_reply',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .references(() => organizationSchema.id, { onDelete: 'cascade' })
      .notNull(),
    managedAccountId: uuid('managed_account_id')
      .references(() => managedAccountSchema.id, { onDelete: 'cascade' })
      .notNull(),
    // Number of replies handled in this log entry.
    count: integer('count').default(1).notNull(),
    note: text('note'),
    loggedAt: timestamp('logged_at', { mode: 'date' }).defaultNow().notNull(),
  },
  t => ({
    orgIdx: index('msi_community_reply_org_idx').on(t.orgId),
  }),
);

// ============================================================
// CONTENT INTELLIGENCE ENGINE — Phase 1
// Migration: 0061_content_intelligence_engine.sql
// ============================================================

// -----------------------------------------------------------
// PROVIDER — Who can generate for us
// -----------------------------------------------------------
export const providerSchema = pgTable('provider', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  config: jsonb('config').default({}).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  priority: integer('priority').default(0).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// -----------------------------------------------------------
// MODEL — What each provider can do
// -----------------------------------------------------------
export const modelSchema = pgTable(
  'model',
  {
    id: text('id').primaryKey(),
    providerId: text('provider_id')
      .references(() => providerSchema.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    inputSchema: jsonb('input_schema'),
    outputSchema: jsonb('output_schema'),
    costPerCall: real('cost_per_call'),
    costPerSecond: real('cost_per_second'),
    capabilities: jsonb('capabilities').default({}).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({
    providerIdx: index('model_provider_id_idx').on(t.providerId),
    typeIdx: index('model_type_idx').on(t.type),
  }),
);

// -----------------------------------------------------------
// GENERATION JOB — Every AI generation request
// -----------------------------------------------------------
export const generationJobSchema = pgTable(
  'generation_job',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .references(() => organizationSchema.id, { onDelete: 'cascade' })
      .notNull(),
    providerId: text('provider_id')
      .references(() => providerSchema.id, { onDelete: 'restrict' })
      .notNull(),
    modelId: text('model_id')
      .references(() => modelSchema.id, { onDelete: 'restrict' })
      .notNull(),
    kind: text('kind').notNull(),
    status: text('status').default('planned').notNull(),
    step: text('step'),
    input: jsonb('input').notNull(),
    output: jsonb('output'),
    externalJobId: text('external_job_id'),
    externalStatus: text('external_status'),
    creditsReserved: integer('credits_reserved').default(0).notNull(),
    creditsCharged: integer('credits_charged').default(0),
    estimatedCost: real('estimated_cost'),
    actualCost: real('actual_cost'),
    costCurrency: text('cost_currency').default('USD'),
    costUnits: text('cost_units'),
    errorMessage: text('error_message'),
    errorCode: text('error_code'),
    attempts: integer('attempts').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(3).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { mode: 'date' }),
    processingVersion: text('processing_version'),
    mediaAssetId: uuid('media_asset_id'),
    webhookReceivedAt: timestamp('webhook_received_at', { mode: 'date' }),
    startedAt: timestamp('started_at', { mode: 'date' }),
    completedAt: timestamp('completed_at', { mode: 'date' }),
    durationMs: integer('duration_ms'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => ({
    orgIdx: index('generation_job_org_id_idx').on(t.orgId),
    providerIdx: index('generation_job_provider_id_idx').on(t.providerId),
    modelIdx: index('generation_job_model_id_idx').on(t.modelId),
    statusIdx: index('generation_job_status_idx').on(t.status),
    orgCreatedIdx: index('generation_job_org_created_at_idx').on(t.orgId, t.createdAt),
    statusUpdatedIdx: index('generation_job_status_updated_at_idx').on(t.status, t.updatedAt),
    mediaAssetIdx: index('generation_job_media_asset_id_idx').on(t.mediaAssetId),
    externalJobIdIdx: uniqueIndex('generation_job_external_job_id_idx').on(t.externalJobId),
  }),
);

// -----------------------------------------------------------
// GENERATION ATTEMPT — Per-attempt history
// -----------------------------------------------------------
export const generationAttemptSchema = pgTable(
  'generation_attempt',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .references(() => generationJobSchema.id, { onDelete: 'cascade' })
      .notNull(),
    attemptNumber: integer('attempt_number').notNull(),
    providerId: text('provider_id')
      .references(() => providerSchema.id, { onDelete: 'restrict' })
      .notNull(),
    modelId: text('model_id')
      .references(() => modelSchema.id, { onDelete: 'restrict' })
      .notNull(),
    status: text('status').notNull(),
    input: jsonb('input').notNull(),
    output: jsonb('output'),
    externalJobId: text('external_job_id'),
    errorMessage: text('error_message'),
    errorCode: text('error_code'),
    durationMs: integer('duration_ms'),
    creditsCharged: integer('credits_charged').default(0),
    costUsd: real('cost_usd'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { mode: 'date' }),
  },
  (t) => ({
    jobIdx: index('generation_attempt_job_id_idx').on(t.jobId),
    statusIdx: index('generation_attempt_status_idx').on(t.status),
    providerIdx: index('generation_attempt_provider_id_idx').on(t.providerId),
    jobNumberIdx: uniqueIndex('generation_attempt_job_number_unique_idx').on(t.jobId, t.attemptNumber),
  }),
);

// -----------------------------------------------------------
// TAG — Hierarchical taxonomy
// NOTE: Vector column (embedding) is in the database but omitted
// here for Drizzle compatibility. Use raw SQL for vector searches.
// -----------------------------------------------------------
export const tagSchema = pgTable(
  'tag',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    parentId: uuid('parent_id'),
    type: text('type').notNull(),
    color: text('color'),
    description: text('description'),
    usageCount: integer('usage_count').default(0).notNull(),
    isSystem: boolean('is_system').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({
    slugIdx: uniqueIndex('tag_slug_idx').on(t.slug),
    parentIdx: index('tag_parent_id_idx').on(t.parentId),
    typeIdx: index('tag_type_idx').on(t.type),
    usageCountIdx: index('tag_usage_count_idx').on(t.usageCount),
  }),
);

// -----------------------------------------------------------
// ASSET TAG — Many-to-many: assets ↔ tags
// -----------------------------------------------------------
export const assetTagSchema = pgTable(
  'asset_tag',
  {
    assetId: uuid('asset_id')
      .references(() => mediaAssetSchema.id, { onDelete: 'cascade' })
      .notNull(),
    tagId: uuid('tag_id')
      .references(() => tagSchema.id, { onDelete: 'cascade' })
      .notNull(),
    confidence: real('confidence').default(1.0).notNull(),
    source: text('source').default('manual').notNull(),
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({
    pkey: index('asset_tag_pkey').on(t.assetId, t.tagId),
    tagIdx: index('asset_tag_tag_id_idx').on(t.tagId),
    sourceIdx: index('asset_tag_source_idx').on(t.source),
  }),
);

// -----------------------------------------------------------
// CONTENT TYPE — Content format definitions
// -----------------------------------------------------------
export const contentTypeSchema = pgTable(
  'content_type',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    minAssets: integer('min_assets').default(1).notNull(),
    maxAssets: integer('max_assets').default(1).notNull(),
    requiresVideo: boolean('requires_video').default(false).notNull(),
    requiresAudio: boolean('requires_audio').default(true).notNull(),
    requiresTextOverlay: boolean('requires_text_overlay').default(false).notNull(),
    requiresCaption: boolean('requires_caption').default(true).notNull(),
    slotSchema: jsonb('slot_schema').notNull(),
    qualificationRules: jsonb('qualification_rules').default({}).notNull(),
    constructionRules: jsonb('construction_rules').default({}).notNull(),
    renderConfig: jsonb('render_config').default({}).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({
    slugIdx: uniqueIndex('content_type_slug_idx').on(t.slug),
  }),
);

// -----------------------------------------------------------
// CONTENT COMPOSITION — How assets combine into content
// -----------------------------------------------------------
export const contentCompositionSchema = pgTable(
  'content_composition',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contentTypeId: text('content_type_id')
      .references(() => contentTypeSchema.id, { onDelete: 'restrict' })
      .notNull(),
    orgId: text('org_id')
      .references(() => organizationSchema.id, { onDelete: 'cascade' }),
    name: text('name'),
    version: integer('version').default(1).notNull(),
    slots: jsonb('slots').notNull(),
    metadata: jsonb('metadata').default({}).notNull(),
    qualityScore: real('quality_score'),
    isComplete: boolean('is_complete').default(false).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => ({
    contentTypeIdIdx: index('content_composition_content_type_id_idx').on(t.contentTypeId),
    orgIdx: index('content_composition_org_id_idx').on(t.orgId),
    isCompleteIdx: index('content_composition_is_complete_idx').on(t.isComplete),
  }),
);

// -----------------------------------------------------------
// LIBRARY CONTENT — Final library items
// -----------------------------------------------------------
export const libraryContentSchema = pgTable(
  'library_content',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .references(() => organizationSchema.id, { onDelete: 'cascade' })
      .notNull(),
    contentTypeId: text('content_type_id')
      .references(() => contentTypeSchema.id, { onDelete: 'restrict' })
      .notNull(),
    compositionId: uuid('composition_id')
      .references(() => contentCompositionSchema.id, { onDelete: 'set null' }),
    campaignId: uuid('campaign_id')
      .references(() => campaignSchema.id, { onDelete: 'set null' }),
    title: text('title'),
    caption: text('caption'),
    hashtags: jsonb('hashtags').default([]).$type<string[]>().notNull(),
    targetPlatforms: jsonb('target_platforms').default([]).$type<string[]>().notNull(),
    targetAccountIds: jsonb('target_account_ids').default([]).$type<string[]>().notNull(),
    status: text('status').default('draft').notNull(),
    scheduledFor: timestamp('scheduled_for', { mode: 'date' }),
    publishedAt: timestamp('published_at', { mode: 'date' }),
    qualityScore: real('quality_score'),
    qualityFlags: jsonb('quality_flags').default([]).$type<string[]>().notNull(),
    antiSlopScore: real('anti_slop_score'),
    metadata: jsonb('metadata').default({}).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => ({
    orgIdx: index('library_content_org_id_idx').on(t.orgId),
    contentTypeIdIdx: index('library_content_content_type_id_idx').on(t.contentTypeId),
    compositionIdx: index('library_content_composition_id_idx').on(t.compositionId),
    campaignIdx: index('library_content_campaign_id_idx').on(t.campaignId),
    statusIdx: index('library_content_status_idx').on(t.status),
    orgStatusIdx: index('library_content_org_status_idx').on(t.orgId, t.status),
    orgContentTypeIdx: index('library_content_org_content_type_idx').on(t.orgId, t.contentTypeId),
    qualityScoreIdx: index('library_content_quality_score_idx').on(t.qualityScore),
    scheduledForIdx: index('library_content_scheduled_for_idx').on(t.scheduledFor),
  }),
);

// -----------------------------------------------------------
// ASSET USAGE — Track where assets are used
// -----------------------------------------------------------
export const assetUsageSchema = pgTable(
  'asset_usage',
  {
    id: serial('id').primaryKey(),
    assetId: uuid('asset_id')
      .references(() => mediaAssetSchema.id, { onDelete: 'cascade' })
      .notNull(),
    orgId: text('org_id')
      .references(() => organizationSchema.id, { onDelete: 'cascade' })
      .notNull(),
    contentId: uuid('content_id')
      .references(() => libraryContentSchema.id, { onDelete: 'set null' }),
    compositionId: uuid('composition_id')
      .references(() => contentCompositionSchema.id, { onDelete: 'set null' }),
    campaignId: uuid('campaign_id')
      .references(() => campaignSchema.id, { onDelete: 'set null' }),
    usageType: text('usage_type').notNull(),
    usageContext: jsonb('usage_context').default({}),
    usedAt: timestamp('used_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({
    assetIdx: index('asset_usage_asset_id_idx').on(t.assetId),
    orgIdx: index('asset_usage_org_id_idx').on(t.orgId),
    contentIdx: index('asset_usage_content_id_idx').on(t.contentId),
    compositionIdx: index('asset_usage_composition_id_idx').on(t.compositionId),
    campaignIdx: index('asset_usage_campaign_id_idx').on(t.campaignId),
    usageTypeIdx: index('asset_usage_usage_type_idx').on(t.usageType),
  }),
);
