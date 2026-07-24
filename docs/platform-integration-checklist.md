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
| **Supported operations** | `publish_post` (image, REELS). Account create / profile edits stay `manual` (customer-owned). Carousel = follow-up. |
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
- **Follow-ups (not yet done):** carousel (multi-image) support. (Platform media
  id → billing `platform_post_id` and token auto-refresh are now done.)

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

## LinkedIn — _not started_

Copy the template. UGC / Posts API; `official_api`. Separate Phase-0.
