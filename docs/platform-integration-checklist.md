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
| **Token type + refresh** | Long-lived Page/IG token (~60 days); refresh via `fb_exchange_token` before expiry. Stored in the vault as JSON `{ accessToken, igUserId }`. |
| **Webhooks** | Optional (`comments`, `mentions`) — not used for publishing. |
| **Error codes of note** | `190` invalid/expired token; `10`/`200` permission; `9007`/`2207xxx` media processing; `4`/`17` rate limit. |
| **Retry strategy** | Container failure/timeout → job `failed`, retried by the worker (bounded `maxAttempts`). Publish is **not** re-attempted after a media id is returned (idempotency lives at the job level). |
| **Compliance notes** | Sanctioned API, customer-owned account, customer-authorized token. No evasion. Per-account Phase-0 sign-off required before `official_api`. |
| **MSI execution strategy** | `official_api` |
| **Phase-0 legal sign-off** | _pending — record date + owner here_ |
| **Client module** | `src/lib/msi/clients/meta-client.ts` (+ `meta-graph.ts`) |
| **Status** | in-progress (client + tests built; not yet registered for prod traffic) |

### Wiring notes (Instagram)
- **Credentials:** capture `{ "accessToken": "…", "igUserId": "…" }` as JSON via the
  Operations **Credential vault → Capture** surface. The client reveals + parses it.
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
- **Follow-ups (not yet done):** thread the returned platform media id into the
  billable event's `platform_post_id` (needs the id persisted on the job at
  execution time, read at billing time); carousel support; token auto-refresh.

---

## TikTok — _not started_

Copy the template. Content Posting API; likely `official_api`. Separate Phase-0.

## LinkedIn — _not started_

Copy the template. UGC / Posts API; `official_api`. Separate Phase-0.
