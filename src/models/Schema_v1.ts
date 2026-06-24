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
// NATIVPOST DATABASE SCHEMA v6
// Using Drizzle ORM with Supabase PostgreSQL
// Run: npm run db:generate → npm run db:migrate
//
// v2 additions:
// - brandProfileSchema: growthStage
// - contentItemSchema: contentMode, enrichmentData, enrichmentApplied
//
// v3 additions:
// - contentPlanSchema: monthly AI-generated content plan per org
//
// v4 additions:
// - socialAccountSchema: oauthToken, oauthTokenSecret
//   Stores OAuth 1.0a credentials for Twitter/X media uploads.
//
// v5 additions:
// - organizationSchema: settings JSONB column
// - notificationSchema: in-app notification center (90-day lifetime)
// - userSettingsSchema: per-user preferences synced across devices
//
// v6 additions:
// - socialAccountSchema: metadata JSONB column
//   Platform-specific extras that don't fit the flat schema.
//   Currently used by WhatsApp to store:
//     { phoneNumberId: string, wabaId: string }
//   The phoneNumberId is required by the Cloud API publisher at
//   publish time to identify which number sends the message.
//   Other platforms can use this column for future extras without
//   needing additional migrations.
// ============================================================

// -----------------------------------------------------------
// ORGANIZATIONS (extends Clerk org with NativPost-specific data)
// -----------------------------------------------------------
export const organizationSchema = pgTable(
  'organization',
  {
    id: text('id').primaryKey(), // Clerk org ID
    // Billing — Stripe
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    stripeSubscriptionPriceId: text('stripe_subscription_price_id'),
    stripeSubscriptionStatus: text('stripe_subscription_status'),
    stripeSubscriptionCurrentPeriodEnd: integer(
      'stripe_subscription_current_period_end',
    ),
    // Billing — Paystack (African markets)
    paystackCustomerCode: text('paystack_customer_code'),
    paystackCustomerEmail: text('paystack_customer_email'),
    paystackSubscriptionCode: text('paystack_subscription_code'),
    paystackPlanCode: text('paystack_plan_code'),
    paystackAuthorizationCode: text('paystack_authorization_code'),
    // Plan details
    plan: text('plan').default('starter').notNull(), // starter, growth, pro, agency, enterprise
    // planStatus: text('plan_status').default('trialing').notNull(), // trialing, active, past_due, cancelled
    planStatus: text('plan_status').default('inactive').notNull(),
    postsPerMonth: integer('posts_per_month').default(20).notNull(),
    platformsLimit: integer('platforms_limit').default(3).notNull(),
    setupFeePaid: boolean('setup_fee_paid').default(false).notNull(),
    trialEndsAt: timestamp('trial_ends_at', { mode: 'date' }),
    // Payment provider the org used to subscribe — drives billing page behaviour
    paymentType: text('payment_type').default('stripe'), // 'stripe' | 'paystack'
    // v5: Workspace-level configuration (timezone, content defaults, publishing prefs)
    settings: jsonb('settings').default({}).notNull(),
    // Metadata
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
// MEDIA SETS (user-curated groups of media assets, or AI-curated sets based on themes)
// -----------------------------------------------------------
export const mediaSetSchema = pgTable('media_set', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id')
    .references(() => organizationSchema.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(), // slideshow, video, curated
  // Uploadcare file uuids, in display order. Empty/unused for curated sets,
  // since those are theme-driven rather than user-curated.
  assetUuids: jsonb('asset_uuids').default([]).notNull(),
  // Only populated for curated sets — maps to an id in curatedThemes.ts
  curatedThemeId: text('curated_theme_id'),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});
 

// -----------------------------------------------------------
// BRAND PROFILES (the core product — one per org)
// -----------------------------------------------------------
export const brandProfileSchema = pgTable('brand_profile', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id')
    .references(() => organizationSchema.id, { onDelete: 'cascade' })
    .notNull(),
  // --- Business Basics ---
  brandName: text('brand_name').notNull(),
  industry: text('industry'),
  targetAudience: text('target_audience'),
  companyDescription: text('company_description'),
  websiteUrl: text('website_url'),
  // --- Voice & Personality ---
  toneFormality: integer('tone_formality').default(5),
  toneHumor: integer('tone_humor').default(5),
  toneEnergy: integer('tone_energy').default(5),
  vocabulary: jsonb('vocabulary').default([]),
  forbiddenWords: jsonb('forbidden_words').default([]),
  communicationStyle: text('communication_style'),
  // --- Visual Identity ---
  primaryColor: text('primary_color'),
  secondaryColor: text('secondary_color'),
  accentColor: text('accent_color'),
  fontPreference: text('font_preference'),
  imageStyle: text('image_style'),
  logoUrl: text('logo_url'),
  // --- Content Preferences ---
  contentExamples: jsonb('content_examples').default([]),
  antiPatterns: jsonb('anti_patterns').default([]),
  hashtagStrategy: text('hashtag_strategy'),
  // --- Platform-Specific Voice ---
  linkedinVoice: text('linkedin_voice'),
  instagramVoice: text('instagram_voice'),
  twitterVoice: text('twitter_voice'),
  facebookVoice: text('facebook_voice'),
  tiktokVoice: text('tiktok_voice'),
  // --- Company Knowledge ---
  mission: text('mission'),
  values: jsonb('values').default([]),
  productsServices: jsonb('products_services').default([]),
  keyDifferentiators: text('key_differentiators'),
  // --- v2: Growth Stage ---
  growthStage: text('growth_stage').default('early'),
  // --- Status ---
  profileCompleteness: integer('profile_completeness').default(0),
  onboardingCompleted: boolean('onboarding_completed').default(false),
  // Metadata
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// -----------------------------------------------------------
// SOCIAL ACCOUNTS (connected platforms)
// -----------------------------------------------------------
export const socialAccountSchema = pgTable('social_account', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id')
    .references(() => organizationSchema.id, { onDelete: 'cascade' })
    .notNull(),
  platform: text('platform').notNull(), // instagram, facebook, linkedin, twitter, tiktok, whatsapp, ...
  platformUserId: text('platform_user_id'),
  platformUsername: text('platform_username'),
  accessToken: text('access_token'),       // OAuth 2.0 access token — encrypted at rest
  refreshToken: text('refresh_token'),     // OAuth 2.0 refresh token — encrypted at rest
  tokenExpiresAt: timestamp('token_expires_at', { mode: 'date' }),
  accountType: text('account_type'),       // personal, page, company, business
  profileImageUrl: text('profile_image_url'),
  isActive: boolean('is_active').default(true).notNull(),
  connectedAt: timestamp('connected_at', { mode: 'date' })
    .defaultNow()
    .notNull(),
  // v4: OAuth 1.0a credentials for Twitter/X media uploads.
  oauthToken: text('oauth_token'),
  oauthTokenSecret: text('oauth_token_secret'),
  // v6: Platform-specific metadata.
  // Stores extra fields that don't belong in the flat schema.
  // Each platform uses a different shape — all are optional/nullable.
  //
  // WhatsApp shape:
  //   {
  //     phoneNumberId: string,  // Cloud API phone number ID — REQUIRED for publishing
  //     wabaId: string,         // WhatsApp Business Account ID
  //   }
  //
  // Future platforms can add their own keys here without a migration.
  // Access in code:
  //   const meta = account.metadata as { phoneNumberId?: string; wabaId?: string } | null;
  //   const phoneNumberId = meta?.phoneNumberId;
  metadata: jsonb('metadata').default(null),
});

// -----------------------------------------------------------
// CONTENT ITEMS (generated posts)
// -----------------------------------------------------------
export const contentItemSchema = pgTable('content_item', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id')
    .references(() => organizationSchema.id, { onDelete: 'cascade' })
    .notNull(),
  brandProfileId: uuid('brand_profile_id').references(
    () => brandProfileSchema.id,
  ),
  // Content
  caption: text('caption').notNull(),
  hashtags: jsonb('hashtags').default([]),
  contentType: text('content_type').notNull(), // single_image, carousel, story, text_only, reel
  topic: text('topic'),
  // Graphics
  graphicUrls: jsonb('graphic_urls').default([]),
  graphicTemplateId: text('graphic_template_id'),
  // Variants
  variantGroupId: uuid('variant_group_id'),
  variantNumber: integer('variant_number').default(1),
  isSelectedVariant: boolean('is_selected_variant').default(false),
  // Platform targeting
  targetPlatforms: jsonb('target_platforms').default([]),
  platformSpecific: jsonb('platform_specific').default({}),
  // Status & Workflow
  status: text('status').default('draft').notNull(), // draft, pending_review, approved, scheduled, published, rejected
  scheduledFor: timestamp('scheduled_for', { mode: 'date' }),
  publishedAt: timestamp('published_at', { mode: 'date' }),
  rejectionFeedback: text('rejection_feedback'),
  // Quality
  antiSlopScore: real('anti_slop_score'),
  qualityFlags: jsonb('quality_flags').default([]),
  // v2: Content Mode & Enrichment
  contentMode: text('content_mode').default('normal'),
  enrichmentData: jsonb('enrichment_data').default({}),
  enrichmentApplied: jsonb('enrichment_applied').default([]),
  // Engagement (post-publish)
  engagementData: jsonb('engagement_data').default({}),
  // Metadata
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
  scheduledDate: text('scheduled_date').notNull(), // YYYY-MM-DD
  scheduledTime: text('scheduled_time'),           // HH:MM
  timezone: text('timezone').default('UTC'),
  isPublished: boolean('is_published').default(false),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// -----------------------------------------------------------
// CONTENT PLAN (v3 — Monthly Plan feature)
// -----------------------------------------------------------
export const contentPlanSchema = pgTable(
  'content_plan',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .references(() => organizationSchema.id, { onDelete: 'cascade' })
      .notNull(),
    month: text('month').notNull(), // YYYY-MM
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
  status: text('status').default('queued').notNull(), // queued, publishing, published, failed
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
  feedbackType: text('feedback_type').notNull(), // thumbs_up, thumbs_down, edit, rejection
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
  authorType: text('author_type').notNull(), // client, agent, ai
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
// v5: NOTIFICATIONS
// -----------------------------------------------------------
export const notificationSchema = pgTable('notification', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id')
    .references(() => organizationSchema.id, { onDelete: 'cascade' })
    .notNull(),
  userId: text('user_id'),
  type: text('type').notNull(),     // 'error' | 'warning' | 'info' | 'success'
  category: text('category').notNull(), // 'publish' | 'approval' | 'billing' | 'system' | 'content'
  title: text('title').notNull(),
  body: text('body').notNull(),
  actionUrl: text('action_url'),
  actionLabel: text('action_label'),
  isRead: boolean('is_read').default(false).notNull(),
  readAt: timestamp('read_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// -----------------------------------------------------------
// v5: USER SETTINGS
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