# NativPost — Phase 3: Publishing Pipeline, Approvals & Analytics

## 10 Files

### File Mapping

| File | Drops Into |
|---|---|
| **Libraries** | |
| `lib/social-oauth.ts` | `src/lib/social-oauth.ts` (NEW) |
| `lib/social-publish.ts` | `src/lib/social-publish.ts` (NEW) |
| `lib/email.ts` | `src/lib/email.ts` (NEW) |
| **API Routes** | |
| `api/social-accounts/connect/route.ts` | `src/app/api/social-accounts/connect/route.ts` (NEW) |
| `api/social-accounts/callback/route.ts` | `src/app/api/social-accounts/callback/route.ts` (NEW) |
| `api/content/[id]/publish/route.ts` | `src/app/api/content/[id]/publish/route.ts` (NEW) |
| **Dashboard Pages** | |
| `dashboard/approvals/page.tsx` | `src/app/[locale]/(auth)/dashboard/approvals/page.tsx` (REPLACE) |
| `dashboard/content/[id]/page.tsx` | `src/app/[locale]/(auth)/dashboard/content/[id]/page.tsx` (NEW) |
| `dashboard/analytics/page.tsx` | `src/app/[locale]/(auth)/dashboard/analytics/page.tsx` (REPLACE) |
| `dashboard/social-accounts/page.tsx` | `src/app/[locale]/(auth)/dashboard/social-accounts/page.tsx` (REPLACE) |

---

## New Environment Variables

```env
# Social Platform OAuth (add when you have credentials)
META_APP_ID=
META_APP_SECRET=
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
TWITTER_CLIENT_ID=
TWITTER_CLIENT_SECRET=
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=

# Email (Resend — you have this)
RESEND_API_KEY=re_your_key_here
FROM_EMAIL=NativPost <notifications@nativpost.com>

# App URL (used for OAuth callbacks + email links)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## What Each Piece Does

### Social OAuth (`lib/social-oauth.ts`)
Centralized OAuth config for all 5 platforms (Meta/Facebook, Instagram, LinkedIn, X/Twitter, TikTok). Handles auth URL generation with correct scopes and token exchange. Platform-specific quirks handled (Twitter uses basic auth for tokens, TikTok uses `client_key` instead of `client_id`).

**Flow:** User clicks "Connect Instagram" → redirected to `/api/social-accounts/connect?platform=instagram` → redirected to Meta OAuth page → user authorizes → callback to `/api/social-accounts/callback` → tokens exchanged and saved → redirected back to Social Accounts page with success banner.

### Social Publishing (`lib/social-publish.ts`)
Platform-specific publishing functions for Facebook (Graph API), Instagram (container + publish two-step), LinkedIn (UGC Posts API), Twitter (v2 Tweets API), and TikTok (manual fallback for MVP). Each returns `{ success, platformPostId?, error? }`.

### Publish API (`/api/content/[id]/publish`)
Takes an approved content item, finds connected accounts for each target platform, publishes using platform-specific captions, records results in the publishing_queue table, and updates the content item status.

### Email Notifications (`lib/email.ts`)
Three email templates using Resend:
- **Approval notification** — "3 new posts ready for your review"
- **Published notification** — "Your post was published on Instagram"
- **Welcome email** — Onboarding with 4-step getting started guide

All emails use inline CSS with NativPost green branding, no external dependencies.

### Approvals Dashboard
Full approval workflow with: selectable content cards, checkbox multi-select, "Select all" / "Deselect all", bulk approve button, individual approve/reject buttons, rejection feedback textarea, quality score badges, hashtag display, copy-to-clipboard. Items disappear from the list after approval/rejection.

### Content Detail Page (`/dashboard/content/[id]`)
Two-column layout: main content (editable caption, hashtags, platform adaptations, rejection feedback) + sidebar (action buttons: approve/publish/reject/delete, metadata details, engagement data for published posts). Inline caption editing with save/cancel.

### Analytics Dashboard
Fetches all published content, computes aggregate metrics (total reach, likes, comments, shares, avg engagement rate). Shows 4 stat cards, top 5 performing content ranked by total engagement, posts-by-platform breakdown, and content quality summary.

### Social Accounts Page (Updated)
Now shows real connected accounts fetched from API. Connect button triggers OAuth flow. Connected platforms show green checkmark + username + disconnect button. Success/error banners based on URL params from OAuth callback.

---

## OAuth Setup Per Platform

When you're ready to connect real platforms:

### Meta (Facebook + Instagram)
1. Go to https://developers.facebook.com
2. Create an app → Business type
3. Add Facebook Login product
4. Set callback URL: `https://app.nativpost.com/api/social-accounts/callback`
5. Copy App ID → `META_APP_ID`, App Secret → `META_APP_SECRET`

### LinkedIn
1. Go to https://developer.linkedin.com
2. Create an app
3. Add "Share on LinkedIn" and "Sign In with LinkedIn using OpenID Connect" products
4. Set callback URL: `https://app.nativpost.com/api/social-accounts/callback`
5. Copy Client ID → `LINKEDIN_CLIENT_ID`, Client Secret → `LINKEDIN_CLIENT_SECRET`

### X / Twitter
1. Go to https://developer.x.com
2. Create a project + app
3. Enable OAuth 2.0 with PKCE
4. Set callback URL: `https://app.nativpost.com/api/social-accounts/callback`
5. Copy Client ID → `TWITTER_CLIENT_ID`, Client Secret → `TWITTER_CLIENT_SECRET`

### TikTok
1. Go to https://developers.tiktok.com
2. Create an app
3. Add Content Posting API scope
4. Set callback URL: `https://app.nativpost.com/api/social-accounts/callback`
5. Copy Client Key → `TIKTOK_CLIENT_KEY`, Client Secret → `TIKTOK_CLIENT_SECRET`

---

## What's Complete After Phase 3

| Phase | What | Status |
|---|---|---|
| Phase 1 | Dashboard shell + Brand Profile UI + DB schema | Done |
| Phase 2 | API routes + Python engine + Content creation + Calendar | Done |
| Phase 3 | Social OAuth + Approvals + Publishing + Analytics + Email | Done |

**Phase 4 (Weeks 9-12) is next:**
- Stripe subscription billing (wire to existing boilerplate integration)
- Paystack for African markets
- Plan enforcement (post limits, platform limits)
- 7-day free trial implementation
- Final QA + beta testing
- Production deployment + launch