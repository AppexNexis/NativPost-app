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
// NATIVPOST DATABASE SCHEMA v3
// Using Drizzle ORM with Supabase PostgreSQL
// Run: npm run db:generate → npm run db:migrate
//
// v2 additions:
// - brandProfileSchema: growthStage
// - contentItemSchema: contentMode, enrichmentData, enrichmentApplied
//
// v3 additions:
// - contentPlanSchema: monthly AI-generated content plan per org
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
    paystackAuthorizationCode: text('paystack_authorization_code'),
    // Plan details
    plan: text('plan').default('starter').notNull(), // starter, growth, pro, agency, enterprise
    planStatus: text('plan_status').default('trialing').notNull(), // trialing, active, past_due, cancelled
    postsPerMonth: integer('posts_per_month').default(20).notNull(),
    platformsLimit: integer('platforms_limit').default(3).notNull(),
    setupFeePaid: boolean('setup_fee_paid').default(false).notNull(),
    trialEndsAt: timestamp('trial_ends_at', { mode: 'date' }),
    // Payment provider the org used to subscribe — drives billing page behaviour
    paymentType: text('payment_type').default('stripe'), // 'stripe' | 'paystack'
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
// CONTENT PLAN (v3 — Monthly Plan feature)
//
// One row per org per month. Stores the full generated topic list as JSONB.
// Each topic in the array has the shape:
//   {
//     topic: string,
//     category: string,           // educational | social_proof | behind_the_scenes | promotional | engagement | trending
//     content_type: string,       // text_only | single_image | carousel | reel | ugc_ad | data_story
//     suggested_date: string,     // YYYY-MM-DD
//     rationale: string,
//     position: number,           // 1-based ordering within the plan
//     dismissed: boolean          // user-dismissed topics are hidden but not deleted
//   }
//
// Only one active plan per org per month — enforced by the unique index.
// Regeneration replaces the topics array in-place and increments
// regeneration_count. The row is never deleted on regenerate, only updated.
// -----------------------------------------------------------
export const contentPlanSchema = pgTable(
  'content_plan',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .references(() => organizationSchema.id, { onDelete: 'cascade' })
      .notNull(),
    month: text('month').notNull(), // YYYY-MM
    topics: jsonb('topics').default([]).notNull(), // PlanTopic[]
    regenerationCount: integer('regeneration_count').default(0).notNull(),
    generatedAt: timestamp('generated_at', { mode: 'date' }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    // Enforces one plan per org per month — upsert logic in the API route
    // relies on this index for onConflictDoUpdate targeting.
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

// -----------------------------------------------------------
// SUPPORT SYSTEM — Append these tables to src/models/Schema.ts
// -----------------------------------------------------------

// -----------------------------------------------------------
// SUPPORT TICKETS
// -----------------------------------------------------------
export const supportTicketSchema = pgTable('support_ticket', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id')
    .references(() => organizationSchema.id, { onDelete: 'cascade' })
    .notNull(),
  // Submitter
  submitterUserId: text('submitter_user_id').notNull(), // Clerk user ID
  submitterEmail: text('submitter_email').notNull(),
  submitterName: text('submitter_name').notNull(),
  // Ticket content
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  // AI-generated fields
  aiSummary: text('ai_summary'),
  aiCategory: text('ai_category'), // billing, content_generation, social_connection, analytics, account, technical, other
  aiPriority: text('ai_priority').default('medium'), // low, medium, high, urgent
  aiAutoResolved: boolean('ai_auto_resolved').default(false),
  aiConfidence: real('ai_confidence'), // 0-1, how confident the AI was in its response
  // Assignment & status
  status: text('status').default('open').notNull(), // open, in_progress, waiting_on_client, auto_resolved, resolved, closed
  assignedToUserId: text('assigned_to_user_id'), // Clerk user ID of agent
  // Source
  source: text('source').default('web').notNull(), // web, email, api, personal_assistant
  inboundEmailId: text('inbound_email_id'), // tracks email thread for replies
  // Resolution
  resolvedAt: timestamp('resolved_at', { mode: 'date' }),
  closedAt: timestamp('closed_at', { mode: 'date' }),
  // CSAT
  csatScore: integer('csat_score'), // 1-5 stars, collected on close
  csatFeedback: text('csat_feedback'),
  // Metadata
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// -----------------------------------------------------------
// SUPPORT MESSAGES (conversation thread on a ticket)
// -----------------------------------------------------------
export const supportMessageSchema = pgTable('support_message', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id')
    .references(() => supportTicketSchema.id, { onDelete: 'cascade' })
    .notNull(),
  // Author
  authorType: text('author_type').notNull(), // client, agent, ai
  authorUserId: text('author_user_id'), // Clerk user ID (null for AI)
  authorName: text('author_name').notNull(),
  authorEmail: text('author_email'),
  // Content
  body: text('body').notNull(),
  isInternal: boolean('is_internal').default(false).notNull(), // internal notes not sent to client
  // AI polish tracking
  originalBody: text('original_body'), // stored if body was AI-polished
  aiPolished: boolean('ai_polished').default(false),
  // Email delivery
  emailMessageId: text('email_message_id'), // for threading
  emailDelivered: boolean('email_delivered').default(false),
  // Metadata
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
  fileUrl: text('file_url').notNull(), // Supabase Storage URL
  fileSize: integer('file_size'), // bytes
  mimeType: text('mime_type'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// -----------------------------------------------------------
// KNOWLEDGE BASE ARTICLES (for RAG + agent reference)
// -----------------------------------------------------------
export const knowledgeArticleSchema = pgTable('knowledge_article', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Content
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  body: text('body').notNull(), // full markdown content
  excerpt: text('excerpt'), // short summary for search results
  // Categorisation
  category: text('category').notNull(), // billing, features, integrations, troubleshooting, account, getting_started
  tags: jsonb('tags').default([]),
  // Visibility
  isPublished: boolean('is_published').default(true).notNull(),
  isInternal: boolean('is_internal').default(false).notNull(), // internal-only articles for agents
  // SEO / helpful
  helpful: integer('helpful').default(0), // thumbs up count
  notHelpful: integer('not_helpful').default(0), // thumbs down count
  viewCount: integer('view_count').default(0),
  // Metadata
  authorUserId: text('author_user_id'), // who wrote it
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// -----------------------------------------------------------
// SUPPORT QUICK STATS VIEW (computed on-demand, not a real table)
// Used by the dashboard stats API
// -----------------------------------------------------------
// No schema needed — queried via SQL aggregates in the API route