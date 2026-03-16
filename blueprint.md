# NativPost Web App — Technical Blueprint & Implementation Plan

**app.nativpost.com**
**Version:** MVP (10-12 weeks)
**Date:** March 2026

---

## 1. Architecture Overview

NativPost is two codebases that work together:

```
nativpost.com          → Marketing site (NextSaaS template, already done)
app.nativpost.com      → Web app (Ixartz SaaS Boilerplate, this document)
```

The web app has three layers:

```
┌─────────────────────────────────────────────────────┐
│  FRONTEND (Next.js + Tailwind + shadcn/ui)          │
│  Dashboard, Brand Profile Builder, Content Calendar, │
│  Approval Workflow, Analytics, Billing, Settings     │
├─────────────────────────────────────────────────────┤
│  BACKEND (Next.js API Routes + Supabase Edge Fns)   │
│  Auth, CRUD, Scheduling Queue, Social API Proxy,    │
│  Stripe/Paystack Webhooks, File Upload              │
├─────────────────────────────────────────────────────┤
│  CONTENT ENGINE (Python FastAPI microservice)        │
│  Claude API, Anti-Slop Filter, Brand Profile        │
│  Injection, Graphics Generation, Variant Creation   │
└─────────────────────────────────────────────────────┘
           │                    │
    ┌──────┴──────┐     ┌──────┴──────┐
    │  Supabase   │     │  External   │
    │  PostgreSQL │     │  APIs       │
    │  Auth       │     │  Meta Graph │
    │  Storage    │     │  LinkedIn   │
    │  Realtime   │     │  X/Twitter  │
    └─────────────┘     │  TikTok    │
                        │  Stripe    │
                        │  Paystack  │
                        └────────────┘
```

---

## 2. Technology Decisions

### What to KEEP from the Ixartz Boilerplate
- Clerk for authentication (it works, has org management, social login — don't fight it)
- Drizzle ORM for database queries
- Next.js App Router with [locale] structure
- next-intl for i18n (Phase 2: Spanish, French, Portuguese)
- Sentry for error tracking
- GitHub Actions CI/CD
- shadcn/ui component library
- Stripe integration (already wired for subscriptions)

### What to ADD
- Supabase (PostgreSQL database + Storage + Realtime) alongside Clerk
- Python FastAPI microservice for Content Engine
- Paystack for African market payments
- Resend for transactional emails
- PostHog for product analytics
- Crisp for live chat support widget
- Cloudinary for image optimization/CDN

### What to MODIFY
- Dashboard layout → NativPost-specific sidebar + navigation
- Auth pages → Custom Clerk appearance matching NativPost marketing site
- Database schema → NativPost tables (brand_profiles, content, schedules, social_accounts, etc.)
- Landing/homepage → Redirect to nativpost.com (marketing site is separate)

### Clerk Customization for Auth Pages
Clerk supports custom pages. To match the NativPost marketing site login/signup design:

```tsx
// In your auth layout, use Clerk's appearance prop:
<ClerkProvider
  appearance={{
    variables: {
      colorPrimary: '#16A34A',      // NativPost green
      colorBackground: '#f4f5f8',    // background-3
      colorText: '#1A1A1C',          // secondary
      fontFamily: 'Inter Tight, sans-serif',
      borderRadius: '9999px',        // rounded-full to match marketing
    },
    elements: {
      card: 'shadow-none border border-stroke-3 rounded-[20px]',
      formButtonPrimary: 'bg-[#16A34A] hover:bg-[#15803d] rounded-full',
      footerActionLink: 'text-[#16A34A]',
    },
  }}
>
```

For a fully custom auth UI (matching the LoginHero/SignupHero from the marketing site), use Clerk's `<SignIn>` and `<SignUp>` components with custom pages and redirect the hosted UI.

---

## 3. Database Schema

Using Drizzle ORM with Supabase PostgreSQL:

### Core Tables

```sql
-- Organizations (Clerk handles this, but we extend it)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_org_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  plan TEXT DEFAULT 'starter',          -- starter, growth, pro, agency, enterprise
  plan_status TEXT DEFAULT 'trialing',  -- trialing, active, past_due, cancelled
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  paystack_customer_code TEXT,
  posts_per_month INTEGER DEFAULT 20,
  platforms_limit INTEGER DEFAULT 3,
  setup_fee_paid BOOLEAN DEFAULT FALSE,
  trial_ends_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Brand Profiles (THE core product)
CREATE TABLE brand_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  -- Voice & Personality
  brand_name TEXT NOT NULL,
  industry TEXT,
  target_audience TEXT,
  tone_formality INTEGER DEFAULT 5,     -- 1=very casual, 10=very formal
  tone_humor INTEGER DEFAULT 5,         -- 1=serious, 10=playful
  tone_energy INTEGER DEFAULT 5,        -- 1=calm, 10=energetic
  vocabulary JSONB DEFAULT '[]',        -- preferred words/phrases
  forbidden_words JSONB DEFAULT '[]',   -- words to NEVER use
  communication_style TEXT,             -- paragraph description
  -- Visual Identity
  primary_color TEXT,
  secondary_color TEXT,
  accent_color TEXT,
  font_preference TEXT,
  image_style TEXT,                     -- e.g., "minimal", "vibrant", "professional"
  logo_url TEXT,
  -- Content Preferences
  content_examples JSONB DEFAULT '[]',  -- URLs or descriptions of admired content
  anti_patterns JSONB DEFAULT '[]',     -- specific things to avoid
  -- Platform-Specific
  linkedin_voice TEXT,
  instagram_voice TEXT,
  twitter_voice TEXT,
  facebook_voice TEXT,
  tiktok_voice TEXT,
  -- Company Knowledge
  mission TEXT,
  values JSONB DEFAULT '[]',
  products_services JSONB DEFAULT '[]',
  key_differentiators TEXT,
  -- Metadata
  profile_completeness INTEGER DEFAULT 0,  -- 0-100%
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Social Accounts (connected platforms)
CREATE TABLE social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,               -- instagram, facebook, linkedin, twitter, tiktok
  platform_user_id TEXT,
  platform_username TEXT,
  access_token TEXT,                    -- encrypted
  refresh_token TEXT,                   -- encrypted
  token_expires_at TIMESTAMP,
  account_type TEXT,                    -- personal, page, company
  is_active BOOLEAN DEFAULT TRUE,
  connected_at TIMESTAMP DEFAULT NOW()
);

-- Content Items (generated posts)
CREATE TABLE content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  brand_profile_id UUID REFERENCES brand_profiles(id),
  -- Content
  caption TEXT NOT NULL,
  hashtags JSONB DEFAULT '[]',
  content_type TEXT NOT NULL,           -- single_image, carousel, story, text_only, reel
  topic TEXT,
  -- Graphics
  graphic_urls JSONB DEFAULT '[]',      -- array of image URLs
  graphic_template_id TEXT,
  -- Variants
  variant_group_id UUID,                -- groups variants of same post
  variant_number INTEGER DEFAULT 1,
  is_selected_variant BOOLEAN DEFAULT FALSE,
  -- Platform targeting
  target_platforms JSONB DEFAULT '[]',  -- ['instagram', 'linkedin', 'twitter']
  platform_specific JSONB DEFAULT '{}', -- platform-specific caption overrides
  -- Status & Workflow
  status TEXT DEFAULT 'draft',          -- draft, pending_review, approved, scheduled, published, rejected
  scheduled_for TIMESTAMP,
  published_at TIMESTAMP,
  rejection_feedback TEXT,
  -- Quality
  anti_slop_score FLOAT,               -- 0-1, higher = more human-like
  quality_flags JSONB DEFAULT '[]',     -- any quality issues detected
  -- Engagement (post-publish)
  engagement_data JSONB DEFAULT '{}',   -- {reach, likes, comments, shares, clicks}
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Content Calendar
CREATE TABLE content_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  content_item_id UUID REFERENCES content_items(id),
  scheduled_date DATE NOT NULL,
  scheduled_time TIME,
  timezone TEXT DEFAULT 'UTC',
  is_published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Publishing Queue
CREATE TABLE publishing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID REFERENCES content_items(id) ON DELETE CASCADE,
  social_account_id UUID REFERENCES social_accounts(id),
  platform TEXT NOT NULL,
  scheduled_for TIMESTAMP NOT NULL,
  status TEXT DEFAULT 'queued',         -- queued, publishing, published, failed
  platform_post_id TEXT,                -- ID returned by platform after publishing
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Client Feedback (on individual content items)
CREATE TABLE content_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID REFERENCES content_items(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,                -- Clerk user ID
  feedback_type TEXT NOT NULL,          -- thumbs_up, thumbs_down, edit, rejection
  feedback_text TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Onboarding Progress
CREATE TABLE onboarding_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  step TEXT NOT NULL,                   -- brand_basics, voice_config, visual_identity, etc.
  completed BOOLEAN DEFAULT FALSE,
  data JSONB DEFAULT '{}',
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 4. Dashboard Pages & Routes

### App Route Structure

```
app/[locale]/(auth)/
├── dashboard/
│   ├── page.tsx                     → Dashboard home (overview)
│   ├── layout.tsx                   → Dashboard shell (sidebar + topbar)
│   │
│   ├── brand-profile/
│   │   ├── page.tsx                 → Brand Profile overview
│   │   └── onboarding/
│   │       └── page.tsx             → Guided onboarding wizard
│   │
│   ├── content/
│   │   ├── page.tsx                 → Content calendar (weekly/monthly view)
│   │   ├── create/
│   │   │   └── page.tsx             → Manual content creation
│   │   └── [id]/
│   │       └── page.tsx             → Single content item detail/edit
│   │
│   ├── approvals/
│   │   └── page.tsx                 → Pending approvals queue
│   │
│   ├── social-accounts/
│   │   └── page.tsx                 → Connected platforms management
│   │
│   ├── analytics/
│   │   └── page.tsx                 → Performance dashboard
│   │
│   ├── billing/
│   │   └── page.tsx                 → Plan, payment history, upgrade
│   │
│   ├── settings/
│   │   └── page.tsx                 → Org settings, team management
│   │
│   └── organization-profile/        → Clerk org management (keep from boilerplate)
│       └── [[...organization-profile]]/
│           └── page.tsx
│
├── onboarding/
│   └── organization-selection/
│       └── page.tsx                 → Clerk org selection (keep from boilerplate)
│
└── (center)/
    ├── sign-in/[[...sign-in]]/
    │   └── page.tsx                 → Clerk sign-in
    └── sign-up/[[...sign-up]]/
        └── page.tsx                 → Clerk sign-up
```

### Dashboard Sidebar Navigation

```
┌──────────────────────┐
│  [NativPost Logo]     │
│                       │
│  ● Dashboard          │
│  ● Brand Profile      │
│  ● Content Calendar   │
│  ● Approvals (3)      │  ← badge with pending count
│  ● Social Accounts    │
│  ● Analytics          │
│  ─────────────────    │
│  ● Billing            │
│  ● Settings           │
│  ● Support            │  ← opens Crisp chat
└──────────────────────┘
```

---

## 5. Content Engine (Python Microservice)

This is the brain of NativPost. A separate Python FastAPI service that handles:

### Why Python (not Node)?
- Claude/OpenAI SDK has first-class Python support
- NLP libraries (for anti-slop filter) are Python-native
- Image manipulation (Pillow, etc.) is better in Python
- Can run on Railway or Supabase Edge Functions
- Separation of concerns — frontend team doesn't touch engine code

### Project Structure

```
nativpost-engine/
├── app/
│   ├── main.py                    → FastAPI app entry
│   ├── config.py                  → Environment config
│   │
│   ├── api/
│   │   ├── routes/
│   │   │   ├── generate.py        → POST /generate (create content)
│   │   │   ├── variants.py        → POST /variants (generate alternatives)
│   │   │   ├── calendar.py        → POST /calendar (generate content plan)
│   │   │   └── graphics.py        → POST /graphics (generate visuals)
│   │   └── dependencies.py        → Auth, rate limiting
│   │
│   ├── engine/
│   │   ├── brand_profile.py       → Brand Profile injection/formatting
│   │   ├── content_generator.py   → Main content generation (Claude API)
│   │   ├── anti_slop_filter.py    → Quality gate / pattern detection
│   │   ├── hashtag_engine.py      → Smart hashtag generation
│   │   ├── platform_optimizer.py  → Platform-specific formatting
│   │   └── calendar_planner.py    → Content calendar algorithm
│   │
│   ├── graphics/
│   │   ├── template_engine.py     → Template-based graphics
│   │   ├── brand_injector.py      → Color/font injection into templates
│   │   └── templates/             → JSON template definitions
│   │
│   ├── models/
│   │   └── schemas.py             → Pydantic models
│   │
│   └── utils/
│       ├── claude_client.py       → Anthropic API wrapper
│       ├── openai_client.py       → OpenAI fallback
│       └── image_utils.py         → Image processing helpers
│
├── tests/
├── requirements.txt
├── Dockerfile
└── railway.json                   → Railway deployment config
```

### Anti-Slop Filter (Critical Innovation)

```python
# anti_slop_filter.py

SLOP_PATTERNS = {
    # Em-dash abuse
    'em_dashes': r'—',
    # Generic openings
    'generic_openings': [
        r"in today's fast-paced",
        r"in the ever-evolving",
        r"in this day and age",
        r"it's no secret that",
        r"let's face it",
        r"here's the thing",
        r"at the end of the day",
    ],
    # Corporate buzzwords
    'buzzwords': [
        'leverage', 'synergy', 'paradigm', 'disrupt',
        'game-changer', 'best-in-class', 'deep dive',
        'move the needle', 'circle back', 'low-hanging fruit',
        'think outside the box', 'take it to the next level',
    ],
    # AI tells
    'ai_tells': [
        r'as an? (?:ai|language model)',
        r'(?:certainly|absolutely)!',
        r'(?:great|excellent) question',
        r'I(?:\'d be| am) happy to',
        r'delve into',
        r'it\'s important to note',
        r'stands as a testament',
        r'navigating the (?:complex|intricate)',
        r'a testament to',
        r'the power of',
    ],
    # Unnatural enthusiasm
    'false_enthusiasm': [
        r'🚀', r'💪', r'🔥',  # overused emojis
        r'amazing', r'incredible', r'game-changing',
        r'revolutionary', r'groundbreaking',
    ],
}

def calculate_slop_score(text: str) -> tuple[float, list[str]]:
    """Returns (score 0-1 where 1=clean, list of flagged patterns)"""
    flags = []
    penalty = 0

    for category, patterns in SLOP_PATTERNS.items():
        if isinstance(patterns, str):
            matches = re.findall(patterns, text, re.IGNORECASE)
            if matches:
                flags.append(f"{category}: {len(matches)} instances")
                penalty += len(matches) * 0.05
        else:
            for pattern in patterns:
                if re.search(pattern, text, re.IGNORECASE):
                    flags.append(f"{category}: matched '{pattern}'")
                    penalty += 0.1

    score = max(0, 1 - penalty)
    return score, flags

def filter_content(text: str, threshold: float = 0.7) -> dict:
    """Main filter function. Returns pass/fail with details."""
    score, flags = calculate_slop_score(text)
    return {
        'passed': score >= threshold,
        'score': score,
        'flags': flags,
        'recommendation': 'approve' if score >= threshold else 'regenerate'
    }
```

### Content Generation Flow

```python
# content_generator.py

async def generate_content(
    brand_profile: BrandProfile,
    content_type: str,
    topic: str | None,
    target_platforms: list[str],
    num_variants: int = 3,
) -> list[ContentItem]:
    """
    Main content generation pipeline:
    1. Build prompt from Brand Profile
    2. Generate with Claude API
    3. Run Anti-Slop Filter
    4. If fails filter → regenerate (max 3 attempts)
    5. Optimize per platform
    6. Return variants
    """

    # Step 1: Build prompt
    system_prompt = build_brand_prompt(brand_profile)
    user_prompt = build_content_request(content_type, topic, target_platforms)

    variants = []
    for i in range(num_variants):
        attempts = 0
        max_attempts = 3

        while attempts < max_attempts:
            # Step 2: Generate
            response = await claude_client.generate(
                system=system_prompt,
                user=user_prompt,
                temperature=0.8 + (i * 0.05),  # slightly different per variant
            )

            # Step 3: Anti-Slop Filter
            filter_result = filter_content(response.text)

            if filter_result['passed']:
                # Step 4: Optimize per platform
                platform_versions = optimize_for_platforms(
                    response.text, target_platforms, brand_profile
                )

                variants.append(ContentItem(
                    caption=response.text,
                    platform_specific=platform_versions,
                    anti_slop_score=filter_result['score'],
                    variant_number=i + 1,
                ))
                break

            attempts += 1

        if attempts == max_attempts:
            # Log for manual review, still include but flag it
            variants.append(ContentItem(
                caption=response.text,
                anti_slop_score=filter_result['score'],
                quality_flags=filter_result['flags'],
                status='needs_review',
                variant_number=i + 1,
            ))

    return variants
```

---

## 6. Implementation Phases (Aligned to MVP Roadmap)

### Phase 1: Foundation (Weeks 1-2)

**Week 1:**
- [ ] Set up Supabase project (Pro tier)
- [ ] Configure Clerk with NativPost branding (custom appearance)
- [ ] Set up GitHub repos (nativpost-app, nativpost-engine)
- [ ] Initialize database with Drizzle migrations
- [ ] Deploy boilerplate to Vercel (app.nativpost.com)
- [ ] Set up Sentry, PostHog
- [ ] Configure DNS: nativpost.com → marketing, app.nativpost.com → web app

**Week 2:**
- [ ] Build dashboard shell (sidebar + topbar + NativPost branding)
- [ ] Dashboard home page (overview with empty states)
- [ ] Social accounts page (connect platforms UI — OAuth flows come later)
- [ ] Settings page (org management via Clerk)
- [ ] Install Crisp chat widget

### Phase 2: Core Engine (Weeks 3-5)

**Week 3: Brand Profile Builder**
- [ ] Database: brand_profiles table + onboarding_progress
- [ ] Multi-step onboarding wizard UI (shadcn/ui form components)
  - Step 1: Business basics (name, industry, audience)
  - Step 2: Brand voice (tone sliders, vocabulary, forbidden words)
  - Step 3: Visual identity (colors, fonts, logo upload to Supabase Storage)
  - Step 4: Content examples (URLs, file uploads)
  - Step 5: Platform-specific preferences
  - Step 6: Anti-patterns
- [ ] Brand Profile overview/edit page
- [ ] Profile completeness indicator

**Week 4: Content Engine**
- [ ] Set up Python FastAPI project (nativpost-engine)
- [ ] Claude API integration
- [ ] Brand Profile → System prompt builder
- [ ] Anti-Slop Filter implementation
- [ ] Caption generation endpoint (POST /generate)
- [ ] Variant generation (3 options per post)
- [ ] Platform-specific optimization
- [ ] Deploy engine to Railway
- [ ] API auth between Next.js app and Python engine

**Week 5: Graphics & Content Calendar**
- [ ] Template system for graphics (JSON-defined templates)
- [ ] Brand color/font injection into templates
- [ ] Carousel, single image, story format support
- [ ] Unsplash/Pexels integration for stock images
- [ ] Content calendar algorithm
- [ ] Calendar view UI (weekly + monthly)
- [ ] Hashtag generation engine

### Phase 3: Publishing & Management (Weeks 6-8)

**Week 6: Social Platform Integrations**
- [ ] Meta Graph API (Instagram + Facebook)
- [ ] LinkedIn API
- [ ] X/Twitter API v2
- [ ] TikTok Content Posting API
- [ ] OAuth flows for each platform
- [ ] Token refresh management
- [ ] Publishing queue system

**Week 7: Approval Dashboard**
- [ ] Approval queue UI (pending items with previews)
- [ ] Post preview cards (platform-specific mockups)
- [ ] Approve / Edit / Reject workflow
- [ ] Bulk approve functionality
- [ ] Email notifications (Resend) for pending approvals
- [ ] Realtime updates (Supabase Realtime)

**Week 8: Analytics**
- [ ] Pull engagement metrics from connected platforms
- [ ] Analytics dashboard UI (recharts/shadcn)
- [ ] Key metrics: reach, engagement rate, follower growth
- [ ] Best performing content analysis
- [ ] Monthly report generation (PDF export)
- [ ] Feedback loop: engagement data → content engine scoring

### Phase 4: Payments & Launch (Weeks 9-12)

**Week 9-10: Payments**
- [ ] Stripe subscription billing (already partially in boilerplate)
- [ ] Paystack integration for African markets
- [ ] Pricing page with plan comparison
- [ ] Currency toggle (USD / NGN / GBP / EUR)
- [ ] Billing dashboard (current plan, history, invoices)
- [ ] 7-day free trial implementation
- [ ] Plan enforcement (post limits, platform limits)

**Week 11: Testing & Beta**
- [ ] Internal QA
- [ ] Onboard 5-10 beta clients
- [ ] Content quality validation with real brands
- [ ] Cross-browser + mobile testing
- [ ] Security review
- [ ] Load testing

**Week 12: Launch**
- [ ] Bug fixes from beta
- [ ] Production monitoring
- [ ] Waitlist launch emails
- [ ] Product Hunt launch
- [ ] Social media campaign (eat our own dog food!)

---

## 7. Key Technical Decisions

### Auth: Clerk (Keep it)
The boilerplate already has Clerk working with org management, role-based access, and social login. Replacing it with Supabase Auth would cost 1-2 weeks of dev time for no gain. Use Clerk for auth, Supabase for everything else.

### Database: Supabase PostgreSQL (via Drizzle ORM)
The boilerplate uses Drizzle ORM which works with any PostgreSQL. Point it at Supabase. Benefits: Row Level Security, realtime subscriptions, built-in file storage.

### Content Engine: Python FastAPI (Separate Service)
This is the right call. Claude's Python SDK is mature, NLP tooling is Python-native, and separating the engine means the frontend team and engine team can work independently. Deploy to Railway ($5/mo), communicate via REST API with a shared secret.

### Graphics: Template System (Not AI Image Generation)
Per the roadmap: "Templates ensure brand consistency. Avoids 'AI art' aesthetic completely." Build a JSON-based template system with brand color/font injection. Use Pillow or sharp for image composition. Carousel templates, quote cards, tip posts, announcements.

### Payments: Stripe + Paystack
Stripe for international (135+ currencies). Paystack for Nigerian/African markets (local cards, bank transfers, mobile money). The boilerplate already has Stripe — add Paystack as a parallel payment provider with a currency toggle.

---

## 8. Environment Variables

```env
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Content Engine
NATIVPOST_ENGINE_URL=https://nativpost-engine.up.railway.app
NATIVPOST_ENGINE_API_KEY=np_engine_...

# Anthropic (used by Python engine)
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI (fallback, used by Python engine)
OPENAI_API_KEY=sk-...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Paystack
PAYSTACK_SECRET_KEY=sk_live_...
PAYSTACK_PUBLIC_KEY=pk_live_...

# Social Platform APIs
META_APP_ID=...
META_APP_SECRET=...
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
TWITTER_CLIENT_ID=...
TWITTER_CLIENT_SECRET=...
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...

# Email (Resend)
RESEND_API_KEY=re_...

# Monitoring
SENTRY_DSN=https://...
NEXT_PUBLIC_POSTHOG_KEY=phc_...

# Image CDN
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

---

## 9. Where to Start (First 3 Days)

**Day 1:**
1. Clone the Ixartz boilerplate
2. Set up Supabase project, get connection string
3. Update Drizzle config to point at Supabase
4. Run the boilerplate locally, verify Clerk auth works
5. Deploy to Vercel as app.nativpost.com
6. Create the nativpost-engine Python project (just the FastAPI skeleton + health check)

**Day 2:**
1. Write the database schema (Drizzle migration files)
2. Run migrations against Supabase
3. Customize the Clerk appearance to match NativPost branding
4. Start building the dashboard sidebar layout
5. Create empty page shells for all dashboard routes

**Day 3:**
1. Build the Brand Profile onboarding wizard UI (Step 1-2)
2. Set up Supabase Storage for file uploads (logos, brand assets)
3. Start the Python engine: Claude API integration + basic prompt
4. Wire the first API call: dashboard → engine → Claude → response

After Day 3 you'll have: a deployed app with auth, a branded dashboard shell, the first two steps of the Brand Profile builder working, and a Python engine that can talk to Claude. That's the foundation everything else builds on.

---

## 10. Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Content quality doesn't meet "human" bar | Anti-slop filter + human review layer + 3 regeneration attempts + client feedback loop |
| Social platform API restrictions | Build modular integrations, manual posting fallback for restrictive platforms |
| Scaling the onboarding | Template Brand Profiles per industry, self-service for Starter tier |
| LLM API costs | Multi-provider (Claude primary, OpenAI fallback), response caching, prompt optimization |
| Engine latency | Async generation, queue-based processing, pre-generate content batches |

---

*This document is the technical north star for NativPost development. Every decision traces back to the MVP roadmap. The marketing site is done. The blueprint is drawn. Time to build.*