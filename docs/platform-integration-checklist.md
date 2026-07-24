# MSI Platform Integration Checklist

Every platform integration follows the **same** checklist so no one reinvents
the process. Each platform is an implementation of the `PlatformClient`
interface (`src/lib/msi/execution-api.ts`); the workflow engine, billing, audit,
and provisioning are execution-agnostic and unchanged per platform.

Copy the template below for each new platform. **A row must be filled before an
account on that platform may be set to `official_api` / `delegated_access`** — an
unfilled Phase-0 sign-off keeps the strategy fail-closed (`manual` only).

---

## Template

| Field | Value |
|---|---|
| **Platform key** (`managed_account.platform`, registry key) | |
| **API + version** | |
| **API documentation** | |
| **OAuth flow** | |
| **Required scopes** | |
| **Required app review** | |
| **Supported operations** (publish / analytics / profile / …) | |
| **Media handling** (image / video / carousel) | |
| **Rate limits** | |
| **Token type + refresh** | |
| **Webhooks** (if any) | |
| **Error codes of note** | |
| **Retry strategy** | |
| **Compliance notes** | |
| **MSI execution strategy** (`manual` / `official_api` / `delegated_access`) | |
| **Phase-0 legal sign-off** (date / owner) | |
| **Client module** | |
| **Status** (not-started / in-progress / live) | |

---

## Instagram (Meta) — first integration

| Field | Value |
|---|---|
| **Platform key** | `instagram` |
| **API + version** | Instagram Content Publishing API (Graph) `v21.0` |
| **API documentation** | developers.facebook.com/docs/instagram-api/guides/content-publishing |
| **OAuth flow** | Facebook Login → Page + connected IG Business/Creator account; token authorized by the customer (account is customer-owned). |
| **Required scopes** | `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement` (+ `business_management` for delegated). |
| **Required app review** | Yes — Meta App Review for `instagram_content_publish` + advanced access; Business Verification. |
| **Supported operations** | `publish_post` (single image, REELS video, and multi-image carousel up to 10). Account create / profile edits stay `manual` (customer-owned). |
| **Media handling** | Container → poll `status_code` until `FINISHED` → `media_publish`. Image immediate-ish; REELS need processing. Media URLs must be publicly reachable. |
| **Rate limits** | 25 API-published posts per IG account per rolling 24h (Meta-enforced). Respect + surface as a capacity constraint. |
| **Token type + refresh** | Long-lived Page/IG token (~60 days). **Auto-refresh:** proactive by expiry via `fb_exchange_token` (needs `META_APP_ID`/`META_APP_SECRET`). Vault blob JSON `{ accessToken, igUserId, expiresAt? }`. |
| **Webhooks** | Optional (`comments`, `mentions`) — not used for publishing. |
| **Error codes of note** | `190` invalid/expired token; `10`/`200` permission; `9007`/`2207xxx` media processing; `4`/`17` rate limit. |
| **Retry strategy** | Container failure/timeout → job `failed`, retried by the worker (bounded `maxAttempts`). Publish is **not** re-attempted after a media id is returned (idempotency lives at the job level). |
| **Compliance notes** | Sanctioned API, customer-owned account, customer-authorized token. No evasion. Per-account Phase-0 sign-off required before `official_api`. |
| **MSI execution strategy** | `official_api` |
| **Phase-0 legal sign-off** | _pending — record date + owner here_ |
| **Client module** | `src/lib/msi/clients/meta-client.ts` (+ `meta-graph.ts`) |
| **Status** | in-progress (client + tests built; not yet registered for prod traffic) |

### Wiring notes (Instagram)
- **Credentials:** capture `{ "accessToken": "…", "igUserId": "…", "expiresAt": <ms?> }`
  as JSON via the Operations **Credential vault → Capture** surface. The client
  reveals + parses it, and refreshes the token proactively when `expiresAt` is near.
- **Register (when activating):**
  ```ts
  import { metaInstagramClient } from '@/lib/msi/clients/meta-client';
  import { createApiExecutionAdapter } from '@/lib/msi/execution-api';
  import { registerExecutionAdapter } from '@/lib/msi/execution';

  registerExecutionAdapter(
    createApiExecutionAdapter('official_api', new Map([['instagram', metaInstagramClient]])),
  );
  ```
  Do this at the point you turn Instagram on — not in a preemptive bootstrap.
  Until registered, `official_api` stays fail-closed and IG accounts run `manual`.
- **Follow-ups:** none outstanding. (Platform media id → billing, token
  auto-refresh, and multi-image carousel are all done.)

---

## TikTok — second integration

| Field | Value |
|---|---|
| **Platform key** | `tiktok` |
| **API + version** | TikTok Content Posting API v2 (`open.tiktokapis.com/v2`) |
| **API documentation** | developers.tiktok.com/doc/content-posting-api-get-started |
| **OAuth flow** | TikTok Login Kit; customer authorizes the account (customer-owned). |
| **Required scopes** | `video.publish` (+ `video.upload`), `user.info.basic`. |
| **Required app review** | Yes — audited-client review; **unaudited apps can only post to private accounts**. |
| **Supported operations** | `publish_post` (video via `PULL_FROM_URL`). Photo posts = separate endpoint (follow-up). Account create / profile edits stay `manual`. |
| **Media handling** | `video/init/` (PULL_FROM_URL) → poll `status/fetch/` until `PUBLISH_COMPLETE` → aweme id in `publicaly_available_post_id[0]`. Video only. |
| **Rate limits** | Per-account daily post cap (`spam_risk_too_many_posts`). Surface as a capacity constraint. |
| **Token type + refresh** | OAuth access token (~24h) + refresh token. **Auto-refresh:** proactive by expiry via the `refresh_token` grant (needs `TIKTOK_CLIENT_KEY`/`TIKTOK_CLIENT_SECRET`). Vault blob JSON `{ accessToken, username?, refreshToken?, expiresAt? }`. |
| **Webhooks** | None used for publishing. |
| **Error codes of note** | `access_token_invalid` (reconnect); `spam_risk_too_many_posts` (cap); `unaudited_client_can_only_post_to_private_accounts`. |
| **Retry strategy** | init/FAILED/timeout → throw → job `failed` → worker retries (bounded). No re-publish after a post id is returned (job-level idempotency). |
| **Compliance notes** | Sanctioned API, customer-owned account, customer-authorized token. Per-account Phase-0 sign-off before `official_api`. |
| **MSI execution strategy** | `official_api` |
| **Phase-0 legal sign-off** | _pending — record date + owner here_ |
| **Client module** | `src/lib/msi/clients/tiktok-client.ts` (+ `tiktok-content.ts`) |
| **Status** | in-progress (client + tests built; registered in `OFFICIAL_API_CLIENTS`; needs creds + Phase-0 for prod traffic) |

### Wiring notes (TikTok)
- **Credentials:** capture `{ "accessToken": "…", "username": "…", "refreshToken": "…", "expiresAt": <ms?> }`
  as JSON via the Operations **Credential vault → Capture** surface. The client
  refreshes proactively when `expiresAt` is near (needs `refreshToken`).
- **Registered** in `worker-service.ts` `OFFICIAL_API_CLIENTS` (`['tiktok', tiktokClient]`) —
  fail-closed until a real token is in the vault + the account is `official_api`.
- **Media:** routed through `/api/media/proxy` so TikTok's `PULL_FROM_URL` domain
  verification is satisfied by the app origin.
- **Async status pass (done):** publishing is split — `execute` inits (returns
  `pending` + a handle), the worker's confirmation pass calls `checkStatus` once
  per tick until PUBLISH_COMPLETE. No tick blocks on processing; respects the
  cron's 60s budget. Same mechanism serves IG REELS.
- **Follow-ups:** photo-post endpoint. (Token auto-refresh is now done.)

## LinkedIn — _not started_

## LinkedIn — third integration

| Field | Value |
|---|---|
| **Platform key** | `linkedin` |
| **API + version** | UGC Posts API (`api.linkedin.com/v2/ugcPosts`, `X-Restli-Protocol-Version: 2.0.0`) |
| **API documentation** | learn.microsoft.com/linkedin/marketing/integrations/community-management/shares/ugc-post-api |
| **OAuth flow** | LinkedIn OAuth; customer authorizes the member/organization identity (customer-owned). |
| **Required scopes** | `w_member_social` (+ `w_organization_social` for pages). |
| **Required app review** | Yes — Marketing Developer Platform access for posting scopes. |
| **Supported operations** | `publish_post` (text, single + multi image up to 9). Video = follow-up (chunked upload). Profile/create stay `manual`. |
| **Media handling** | `assets?action=registerUpload` → PUT bytes to the returned URL → `ugcPosts` with `shareMediaCategory: IMAGE`. **No pull-from-URL** — media is uploaded as bytes. **Synchronous** (no processing poll). |
| **Rate limits** | Per-member/app daily throttles; duplicate-content rejection. |
| **Token type + refresh** | Access token ~60d + refresh token ~1y. **Auto-refresh:** proactive by expiry via `refresh_token` grant (needs `LINKEDIN_CLIENT_ID`/`SECRET`). Vault blob JSON `{ accessToken, authorUrn, refreshToken?, expiresAt? }`. |
| **Webhooks** | None used for publishing. |
| **Error codes of note** | `401` invalid token; `422` duplicate/invalid share; `403` missing scope. |
| **Retry strategy** | Any step throws → `execute` throws → job `failed` → worker retries (bounded). Synchronous, so no confirmation pass. |
| **Compliance notes** | Sanctioned API, customer-owned identity, customer-authorized token. Per-account Phase-0 sign-off before `official_api`. |
| **MSI execution strategy** | `official_api` |
| **Phase-0 legal sign-off** | _pending — record date + owner here_ |
| **Client module** | `src/lib/msi/clients/linkedin-client.ts` (+ `linkedin-posts.ts`) |
| **Status** | in-progress (client + tests built; registered in `OFFICIAL_API_CLIENTS`; needs creds + Phase-0 for prod traffic) |

### Wiring notes (LinkedIn)
- **Credentials:** capture `{ "accessToken": "…", "authorUrn": "urn:li:person:…", "refreshToken": "…", "expiresAt": <ms?> }`
  as JSON via the Operations **Credential vault → Capture** surface.
- **Registered** in `worker-service.ts` `OFFICIAL_API_CLIENTS` (`['linkedin', linkedinClient]`).
- **Synchronous client:** `execute` publishes and returns `completed` in one call —
  no `checkStatus` (validates the model supports sync clients too).
- **Follow-ups:** video (chunked upload); LinkedIn is image/text in v1.

## Facebook — fourth integration

| Field | Value |
|---|---|
| **Platform key** | `facebook` |
| **API + version** | Facebook Graph API `v21.0` (Page publishing) |
| **API documentation** | developers.facebook.com/docs/pages-api/posts |
| **OAuth flow** | Facebook Login → Page access token; customer authorizes (customer-owned Page). |
| **Required scopes** | `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`. |
| **Required app review** | Yes — Meta App Review for the pages_* posting permissions + Business Verification. |
| **Supported operations** | `publish_post` (text, single image, multi-image carousel, video). Account/profile stay `manual`. |
| **Media handling** | Pull-from-URL: video `POST /{page}/videos` (`file_url`); single image `/{page}/photos` (`url`); carousel = unpublished `/photos` (`published:false`) → `/{page}/feed` (`attached_media`). **Synchronous** (no processing poll). |
| **Rate limits** | Standard Graph per-app/page rate limits. |
| **Token type + refresh** | Long-lived Page token. **Auto-refresh:** shares Meta's `fb_exchange_token` (needs `META_APP_ID`/`META_APP_SECRET`). Vault blob JSON `{ accessToken, pageId, expiresAt? }`. |
| **Webhooks** | None used for publishing. |
| **Error codes of note** | `190` invalid/expired token; `200`/`10` permission; `100` bad param. |
| **Retry strategy** | Any step throws → `execute` throws → job `failed` → worker retries. Synchronous, no confirmation pass. |
| **Compliance notes** | Sanctioned API, customer-owned Page, customer-authorized token. Per-account Phase-0 sign-off before `official_api`. |
| **MSI execution strategy** | `official_api` |
| **Phase-0 legal sign-off** | _pending — record date + owner here_ |
| **Client module** | `src/lib/msi/clients/facebook-client.ts` (+ `facebook-graph.ts`) |
| **Status** | in-progress (client + tests built; registered in `OFFICIAL_API_CLIENTS`; needs creds + Phase-0 for prod traffic) |

### Wiring notes (Facebook)
- **Credentials:** capture `{ "accessToken": "…", "pageId": "…", "expiresAt": <ms?> }` as
  JSON via the Operations **Credential vault → Capture** surface.
- **Registered** in `worker-service.ts` `OFFICIAL_API_CLIENTS` (`['facebook', facebookClient]`).
- Shares Meta's token refresh (`fb_exchange_token`, `META_APP_*`) — no separate refresh token.

## YouTube — catalog-listed, client not built

Orderable in the configure flow (`MSI_PLATFORMS`), but **no execution client yet** —
YouTube accounts run the `manual` (operator) strategy until a `PlatformClient` is
built (resumable video upload + `videos.insert`). Copy the template when starting.

## Threads / Pinterest — not planned

Deliberately excluded from the launch catalog.
