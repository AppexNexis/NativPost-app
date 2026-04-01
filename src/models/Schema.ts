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
// NATIVPOST DATABASE SCHEMA v2
// Using Drizzle ORM with Supabase PostgreSQL
// Run: npm run db:generate → npm run db:migrate
//
// v2 additions:
// - brandProfileSchema: growthStage
// - contentItemSchema: contentMode, enrichmentData, enrichmentApplied
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
    paystackSubscriptionCode: text('paystack_subscription_code'),
    paystackPlanCode: text('paystack_plan_code'),
    // Plan details
    plan: text('plan').default('starter').notNull(), // starter, growth, pro, agency, enterprise
    planStatus: text('plan_status').default('trialing').notNull(), // trialing, active, past_due, cancelled
    postsPerMonth: integer('posts_per_month').default(20).notNull(),
    platformsLimit: integer('platforms_limit').default(3).notNull(),
    setupFeePaid: boolean('setup_fee_paid').default(false).notNull(),
    trialEndsAt: timestamp('trial_ends_at', { mode: 'date' }),
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
  toneFormality: integer('tone_formality').default(5), // 1=very casual → 10=very formal
  toneHumor: integer('tone_humor').default(5), // 1=serious → 10=playful
  toneEnergy: integer('tone_energy').default(5), // 1=calm → 10=energetic
  vocabulary: jsonb('vocabulary').default([]), // preferred words/phrases
  forbiddenWords: jsonb('forbidden_words').default([]), // words to NEVER use
  communicationStyle: text('communication_style'),
  // --- Visual Identity ---
  primaryColor: text('primary_color'),
  secondaryColor: text('secondary_color'),
  accentColor: text('accent_color'),
  fontPreference: text('font_preference'),
  imageStyle: text('image_style'), // "minimal", "vibrant", "professional"
  logoUrl: text('logo_url'),
  // --- Content Preferences ---
  contentExamples: jsonb('content_examples').default([]), // URLs or descriptions
  antiPatterns: jsonb('anti_patterns').default([]), // things to avoid
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
  growthStage: text('growth_stage').default('early'), // early, growing, established, authority
  // --- Status ---
  profileCompleteness: integer('profile_completeness').default(0), // 0-100
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
  platform: text('platform').notNull(), // instagram, facebook, linkedin, twitter, tiktok
  platformUserId: text('platform_user_id'),
  platformUsername: text('platform_username'),
  accessToken: text('access_token'), // encrypted at rest
  refreshToken: text('refresh_token'), // encrypted at rest
  tokenExpiresAt: timestamp('token_expires_at', { mode: 'date' }),
  accountType: text('account_type'), // personal, page, company
  profileImageUrl: text('profile_image_url'),
  isActive: boolean('is_active').default(true).notNull(),
  connectedAt: timestamp('connected_at', { mode: 'date' })
    .defaultNow()
    .notNull(),
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
  contentMode: text('content_mode').default('normal'), // normal, concise, controversial
  enrichmentData: jsonb('enrichment_data').default({}), // the enrichment options used
  enrichmentApplied: jsonb('enrichment_applied').default([]), // which elements were woven in
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
  scheduledTime: text('scheduled_time'), // HH:MM
  timezone: text('timezone').default('UTC'),
  isPublished: boolean('is_published').default(false),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

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
  userId: text('user_id').notNull(), // Clerk user ID
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
  step: text('step').notNull(), // business_basics, voice_personality, visual_identity, content_preferences, platform_voices, review
  completed: boolean('completed').default(false).notNull(),
  data: jsonb('data').default({}),
  completedAt: timestamp('completed_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});
