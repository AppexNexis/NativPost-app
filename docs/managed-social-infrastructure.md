# NativPost — Managed Social Infrastructure (MSI)

**Status:** Living document — single source of truth for the Managed Social Infrastructure business unit.
**Last updated:** 2026-07-23 (v2 — added Capacity Engine, Workflow Engine, Operations ERP, Credential Vault, Business Intelligence, AI Operations Assistant, DR/Incident Response)
**Decision locked:** Compliant *Managed Local Presence* model (§2). The Fastlane-style mechanics (detection evasion, credential-withholding to preserve geo-spoofing, accounts-as-transferable-inventory) are **explicitly out of scope**. This document specifies only the compliant product.

---

## 0. TL;DR for reviewers

We are adding a business unit to NativPost: customers buy **done-for-you localized social presence** — real, on-brand accounts operated by NativPost's in-country teams, **owned by the customer**, published through the pipeline that already exists.

What makes it defensible and enterprise-grade:

1. **Real, disclosed, customer-owned brand identity.** Not anonymous per-country inventory. This one rule keeps us within platform ToS (§2).
2. **Two planes, one schema.** A customer plane in the existing dashboard, and an internal **Operations ERP** where staff see *structured jobs, never customer data* (§3, §8).
3. **A live managed account is a new _connection type_, not a new publishing path.** It links to a `social_account` row and reuses `lib/social-publish.ts` (§4.2). We add provisioning + operations, not a parallel product.
4. **The system knows if it can fulfill an order _before_ checkout.** A Capacity & Allocation Engine gives real ETAs and regional availability (§6).
5. **Everything is a Job.** A single workflow engine models create/update/publish/pause/transfer/recover/appeal/archive with SLAs, retries, QA gates, and audit (§7).
6. **Credentials are a security product, not a database field.** Dedicated vault, envelope encryption, dual-authorized transfer, full audit (§9).

**Customer-facing name:** the surface is called **Infrastructure** (not "Managed Accounts") — future-proof for non-social infrastructure later (§15). Internal/data-model noun stays `managed_account`.

---

## 1. Why this exists / positioning

### Job-to-be-done

> "I'm a business that needs a real, localized social presence in markets where I don't have staff, and I don't want to build the in-country team to run it."

This is what a global brand's agency does today (a French-language Instagram staffed by French creators; a US TikTok run by US operators). NativPost is uniquely positioned: we already own AI Studio (content), Brand Profiles (voice), Campaigns, multi-platform publishing (`lib/social-publish.ts`), Analytics, and enterprise Workspaces/RBAC. **MSI is the operations layer** that closes the loop from "generate content" to "there is a real local presence to publish it on."

MSI is not a second product bolted on. It's another business unit inside the platform — the Atlassian/Stripe/Vercel growth pattern:

```
NativPost
├── AI Studio
├── Campaigns
├── Publishing
├── Analytics
├── Brand Profiles
├── Influencers
└── Managed Social Infrastructure   ← new business unit
```

### Positioning vs. the field

| Product | What they sell | Gap MSI fills |
|---|---|---|
| **Fastlane** | Warmed/aged accounts as inventory, "anti-ban", withheld credentials | Ban risk baked in; no real brand identity; not enterprise-safe. We sell *managed presence you own*, no evasion layer. |
| **Buffer / Later / Publer** | Scheduling on accounts you already have | They don't create/operate presence. |
| **Hootsuite / Sprout / Vista Social** | Enterprise scheduling + light agency tooling | No provisioning of localized presence; no in-country operations. |
| **Traditional agencies** | Bespoke, opaque, slow, expensive | We productize it: transparent timeline, self-serve ordering, unified analytics, software margins. |

**One-liner:** *NativPost stands up and runs your brand's real, local social presence — owned by you, staffed by locals, published from one place.*

---

## 2. The compliance spine (read before designing anything)

Everything downstream of one rule:

> **An MSI account MUST represent a real, disclosed brand identity that the customer owns, operated by NativPost under the customer's written authorization.**

### 2.1 What we build (compliant)

- Accounts tied to a real `brand_profile` (customer brand or named sub-brand). Never anonymous.
- Genuine local operation: real local staff, genuine on-brand content, native publishing. Geo-authenticity is **real**, not spoofed.
- **Customer owns credentials** from day one; NativPost operates under a delegated, revocable **Authorization Grant** (§4.1). Customer can retrieve credentials / off-board at any time (§9).
- Full audit trail of every operator/system action (§7.4, `msi_activity_log`).

### 2.2 What we do NOT build (rejected Fastlane mechanics)

| Rejected mechanic | Why it's out |
|---|---|
| "Anti-ban" / warming to evade new-account detection | Circumvents platform integrity systems. |
| Withholding credentials to protect device/SIM/IP geo-spoofing | Deceives platform + owner about who/where operates the account. |
| Accounts as fungible transferable inventory divorced from a real brand | Account trafficking + coordinated inauthentic behavior. |
| **Proxies/IP tooling to *simulate* local provenance** | Detection evasion. Proxies are allowed **only** for legitimate secure-admin access, never to fake account location (§8.3). |

**Business rationale:** these mechanics would put NativPost's *own* Meta/TikTok OAuth apps (`social-connect.md`) in the blast radius of an integrity enforcement action — killing the legitimate publishing product for *every* customer. The compliant model is lower-risk, higher-margin, and more enterprise-credible.

### 2.3 Honest open risks (resolved in Phase 0, blocks Phase 3)

- **Per-platform operating model.** Confirm whether we operate via (a) official Business/Partner APIs, (b) delegated access (e.g. Meta Business Manager partner assignment), or (c) documented device-based operation with disclosure. Prefer (a)/(b).
- **Legitimate multi-account isolation** between clients (normal for agencies) vs. the line of never misrepresenting provenance.
- **KYC / acceptable-use** to prevent impersonation/spam use (§8.2).

---

## 3. Architecture: two planes, one schema

```
   CUSTOMER PLANE            app.nativpost.com (existing shell)
   (existing dashboard)      Clerk org roles: owner/admin/member
                             Infrastructure · Timeline · Review · Billing
                             Social Accounts (Managed badge) · Calendar target
                                     │
                                     │  one Postgres (Drizzle)
                                     │
   OPERATIONS PLANE          operations.nativpost.com (NEW) — internal only
   (internal ERP, §8)        Clerk roles: ops_admin / country_manager /
                             operator / reviewer / qa / ops_support / finance
                             Sees JOBS + TASKS + INVENTORY, never customer data

   SHARED SERVICES           Capacity Engine (§6) · Workflow Engine (§7) ·
                             Credential Vault (§9) · Notification svc ·
                             Append-only audit log · BI warehouse (§11)
```

### 3.1 Plane separation

- **Customer plane** in existing `src/app/[locale]/(auth)/dashboard/`. Nav via `getNavForRole` (`src/lib/roles.ts`) with plan + capability gating.
- **Operations plane**: separate route group (recommend `src/app/[locale]/(ops)/`, later a subdomain for hard isolation). `src/middleware.ts` hard-blocks ops roles from customer routes and vice-versa.
- **Why planes, not one role flag:** operators are contractors across 15 countries; they must receive *only the data a task needs* — never customer billing, other brands, or cross-account visibility. This is the line between an auditable ERP and support-account sprawl.

### 3.2 RBAC

- Customer roles: unchanged.
- Ops roles (new, internal org only): `ops_admin`, `country_manager`, `operator`, `reviewer`, `qa`, `ops_support`, `finance`.
- Least privilege enforced **at the query layer** (scoped by role + country), not just UI: `operator` → own jobs only; `country_manager` → their country queue; `qa`/`reviewer` → review stage; `finance` → billing/payroll; `ops_admin` → all.

---

### 3.3 The Execution Layer (hybrid, per-platform — Phase 0 approved)

The execution mechanism is **an implementation detail of the Execution Layer and is intentionally abstracted from the customer experience.** The workflow engine, audit trail, billing, provisioning, and analytics are execution-agnostic — they ask the layer to perform an operation and consume a uniform result, never knowing whether it ran through an official API, delegated business access, or a customer-authorized manual/device-based process.

```
Job → account.execution_strategy → adapter → execute(operation, ctx) → ExecutionResult → uniform pipeline effect
```

- **Strategy per account.** `managed_account.execution_strategy` (`official_api` | `delegated_access` | `manual`) is set at provisioning; the resolver falls back to a per-platform default, then to `manual` (always customer-authorized). Never surfaced to the customer — they see only Ordered → Building → Review → Live.
- **Adapters (`src/lib/msi/execution.ts`).** A small `ExecutionAdapter { strategy; execute(operation, ctx) }` interface. `manual` is implemented (defers to an in-country operator → `pending_operator`). `official_api` / `delegated_access` are declared strategies whose adapters require platform app credentials + their **own** Phase-0 sign-off; the registry **fails closed** (`AdapterNotConfiguredError`) so an unconfigured strategy never silently no-ops.
- **Uniform result.** `ExecutionResult { outcome: completed | pending_operator | failed }` → `executionEffect` → task/job effect, identical regardless of strategy. `jobToOperation` maps job types to platform operations.
- Adding/rewiring a platform's execution mechanism is a config + adapter change, not a change to the pipeline, UX, audit, or billing.

## 4. Data model (Drizzle, fits `src/models/Schema.ts` v7 patterns)

Conventions match the existing file: `pgTable`, `uuid().primaryKey().defaultRandom()`, `orgId text` FK → `organization` (`onDelete: 'cascade'`), `jsonb().default(...)`, `timestamp({ mode: 'date' })` with `$onUpdate`. MSI tables prefixed `msi_` except `managed_account`.

### 4.1 `authorization_grant` — the legal spine

No account is provisioned without an active grant.

```ts
export const authorizationGrantSchema = pgTable('authorization_grant', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').references(() => organizationSchema.id, { onDelete: 'cascade' }).notNull(),
  brandProfileId: uuid('brand_profile_id').references(() => brandProfileSchema.id).notNull(),
  grantVersion: text('grant_version').notNull(),
  scope: jsonb('scope').default({}),                    // platforms/countries authorized
  signedByUserId: text('signed_by_user_id').notNull(),
  signedAt: timestamp('signed_at', { mode: 'date' }).defaultNow().notNull(),
  documentUrl: text('document_url'),
  status: text('status').default('active').notNull(),   // active | revoked
  revokedAt: timestamp('revoked_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});
```

### 4.2 `managed_account` — the product unit

```ts
export const managedAccountSchema = pgTable('managed_account', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').references(() => organizationSchema.id, { onDelete: 'cascade' }).notNull(),
  brandProfileId: uuid('brand_profile_id').references(() => brandProfileSchema.id).notNull(), // MUST be real
  authorizationGrantId: uuid('authorization_grant_id').references(() => authorizationGrantSchema.id).notNull(),
  platform: text('platform').notNull(),
  country: text('country').notNull(),
  targetLocale: text('target_locale'),
  niche: text('niche'),
  handlePreferences: jsonb('handle_preferences').default([]),
  displayName: text('display_name'),
  lifecycleState: text('lifecycle_state').default('ordered').notNull(), // §5
  credentialCustody: text('credential_custody').default('customer_owned').notNull(),
  socialAccountId: uuid('social_account_id').references(() => socialAccountSchema.id), // set when live
  healthScore: integer('health_score'),                 // §11.3, denormalized latest
  liveAt: timestamp('live_at', { mode: 'date' }),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});
```

> **Integration keystone:** `socialAccountId`. Going live creates/links a `social_account` row; MSI accounts then flow through the *existing* publishing/scheduling/analytics code with a `Managed` badge. No parallel publishing path.

### 4.3 Ordering, workflow, operations, inventory (sketch — full columns at implementation)

- **`msi_provisioning_order`** — `orgId`, Stripe refs, `quantity`, `configSnapshot jsonb`, `capacityReservationId`, `status`.
- **`msi_job`** — the universal unit of work (§7). `managedAccountId?`, `jobType`, `state`, `assignedOperatorId?`, `assignedDeviceId?`, `priority`, `slaDueAt`, `attempts`.
- **`msi_task`** — checklist inside a job. `jobId`, `taskType`, `status`, `completedByRole`, `evidenceUrl`, `completedAt`.
- **`msi_account_review`** — customer 3-day window. `managedAccountId`, `windowOpensAt`, `windowClosesAt`, `status`, `requestedChanges jsonb`, `respondedAt`.
- **`msi_activity_log`** — append-only audit / event stream (powers the timeline §13.2). `managedAccountId?`, `jobId?`, `actorType`, `actorId`, `action`, `detail jsonb`, `occurredAt`.
- **Inventory (ops-plane):** `msi_country` (capacity rollups), `msi_operator` (`clerkUserId`, `role`, `country`, `capacity`, `activeLoad`), `msi_device` (`label`, `country`, `carrier`, `capacity`, `status`), `msi_sim`, `msi_device_assignment` (`deviceId`, `managedAccountId`, `assignedAt`, `releasedAt`).
- **`msi_capacity_reservation`** — soft-holds capacity at checkout (§6). `country`, `platform`, `quantity`, `expiresAt`, `status`.
- **`msi_credential`** — vault pointer only, **never plaintext** (§9). `managedAccountId`, `vaultRef`, `encryptedDek`, `custodyState`, `lastRotatedAt`.

---

## 5. Lifecycle state machine

One machine drives the customer timeline and the operator board — same states.

```
ordered
 → provisioning     (order paid, grant active, capacity reserved, job created)
  → brand_setup     (create account, apply brand_profile identity)
   → building       (profile, bio, initial on-brand content prepared)
    → qa_review     (internal QA gate — §7.3)
     → customer_review  (3-day window; approve or request changes)
       → revisions  (changes_requested → back to building)
       → live       (approved → connected as social_account)
        → active    (steady-state; publishes via existing pipeline)
         → paused | archived   (customer pause / off-board → credentials released)
failed  (any stage → visible reason + support handoff; never a silent dead end)
```

Transitions are **guarded** (`ordered → provisioning` requires active grant + confirmed payment + capacity reservation; `building → qa_review → customer_review` requires all tasks complete + QA pass). Implement as an explicit transition function with unit tests for every legal/illegal transition (repo gates: `npm run check-types`, vitest).

---

## 6. Capacity Planning & Allocation Engine

**The pre-purchase feasibility layer — the biggest omission in v1.** Before a customer checks out, the system must answer *"can we actually fulfill this, and by when?"*

### 6.1 What it computes

For a requested `{country, platform, niche, quantity}`:

```
US · TikTok · Fitness · 15
├── operators available?      (msi_operator.capacity − activeLoad, by country)
├── device/SIM headroom?      (msi_device.capacity − assignments)
├── current queue depth       (open msi_job in provisioning/building)
├── historical throughput     (accounts finished / operator / day, per country)
└── ⇒ feasibility + ETA + confidence
```

Result surfaced at order time:

```
United States   Capacity 92%   Est. delivery 4 days   Confidence 96%
France          Capacity full  Est. delivery 12 days  Waitlist available
```

### 6.2 Mechanics

- **Capacity model:** `country_capacity = Σ operator_capacity ∩ device_capacity`, minus reserved + in-flight. Materialized per country/platform, refreshed by the provisioning worker.
- **ETA:** queue depth ÷ recent throughput (rolling p50/p90), not a hardcoded "48h". Powers the SLA display (§7.5).
- **Reservation:** checkout creates a `msi_capacity_reservation` soft-hold (TTL, e.g. 30 min) so two buyers can't oversell the same US Fitness slots. Released on payment failure/timeout.
- **Admission control:** if capacity is full, offer waitlist + honest ETA rather than accepting an order we can't staff. Protects SLA credibility.
- **Regional load balancing:** the allocator picks the least-loaded qualified operator/device within the country, respecting per-device caps.

---

## 7. Workflow Engine — everything is a Job

Generalize provisioning into one durable job/task engine so *every* operation is structured, retryable, SLA-bound, and audited.

### 7.1 Job taxonomy

```
create_account · update_profile · replace_avatar · update_bio ·
prepare_first_posts · publish_post · pause_account · resume_account ·
transfer_ownership · recover_account · appeal_restriction · archive_account
```

`transfer_ownership` and `recover_account` are **off-boarding/security workflows** (customer already owns the account), not inventory transfers — see §9.

### 7.2 Job & task model

- A **Job** has a type, a target (`managed_account`), a state, priority, `slaDueAt`, `attempts`, and an assignee.
- A Job contains ordered **Tasks** (the operator checklist), each with instructions + required evidence upload.
- **Durable execution:** jobs are persisted rows advanced by the provisioning worker (state-machine cron). Idempotent transitions; retries with backoff; `attempts` cap → `failed` with reason + escalation.

### 7.3 QA pipeline (multi-stage, never operator-completes-to-customer)

```
Operator  →  Reviewer  →  QA  →  Customer
(does tasks) (peer check) (brand + compliance gate) (approves)
```

QA verifies brand-match, compliance (real identity, no policy red flags), and content quality before the customer review window opens. Each stage stamps `msi_task.completedByRole` for auditability.

### 7.4 Auditing

Every job/task transition writes `msi_activity_log` (append-only). This is both the customer-facing timeline (§13.2) and our own compliance defense.

### 7.5 SLAs

Every job type carries an SLA. Surface confidence, not spinners:

```
Average provision time   48h
Current estimate         41h   Confidence 96%
"95% of customers receive their account within 2.3 days."
```

SLA breaches auto-escalate (§8.4) and feed operator/country performance (§11).

---

## 8. Operations ERP (internal)

`operations.nativpost.com` — the "factory," built toward an ERP: *Linear + Stripe + Zendesk + Monday + Airtable* for social operations. Staff log into **jobs and inventory, not customers.**

### 8.1 Modules

```
Dashboard · Orders · Provisioning Queue · Jobs · Country Managers ·
Operators · Review Team · QA · Device Inventory · SIM Inventory ·
Country Inventory · Customer Requests · Escalations · Support ·
Analytics · Performance · Finance · Billing · Payroll · Country Reports
```

### 8.2 Onboarding / acceptable-use gate

Country managers verify brand legitimacy (KYC-lite) before a job enters `brand_setup`. Blocks impersonation/spam. Recorded in the audit log.

### 8.3 Inventory system (infrastructure, not products)

```
Country → Managers → Phones → SIMs → Active Accounts → Available Capacity
```

Example device row:

```
USA · Phone-18 · SIM T-Mobile · Manager: John · Accounts 14/20 (70%) · Active
```

**Compliance guardrail on proxies:** proxy/IP tooling is inventoried **only** for legitimate secure-admin access to management tooling — never to simulate an account's local provenance. Real local presence = real local device + real local connectivity. Any use that would misrepresent location is out of scope (§2.2).

### 8.4 Escalations

SLA breach, QA fail loops, platform restriction, or failed job → structured escalation to `country_manager` → `ops_admin`, with the account timeline attached.

---

## 9. Security & Credential Management (treat as a security product)

Per reviewer feedback: credential handling is **not** a database field. It is a dedicated security subsystem.

### 9.1 Custody

- **Model:** customer-owned, NativPost-operated under the Authorization Grant. Custody state machine: `provisioning → nativpost_operating → transfer_requested → released`.
- **Vault:** credentials stored in a dedicated secrets vault (e.g. KMS-backed / HashiCorp Vault-style), **never** in `social_account`/`managed_account` as plaintext. `msi_credential` holds only a `vaultRef` + envelope-encrypted DEK.
- **Envelope encryption:** per-credential Data Encryption Key wrapped by a KMS master key; rotation supported (`lastRotatedAt`).

### 9.2 Transfer / off-boarding workflow

Off-boarding is first-class and genuinely honors ownership:

```
transfer_requested
 → dual authorization (customer owner + ops_admin)
 → identity/authorization re-verification
 → credential rotation (reset to customer-controlled recovery)
 → secure handoff (one-time, expiring, audited channel)
 → custody = released ; account archived
```

Every step audited. **Answer to "do I get my logins": yes, always — immediately on exit.**

### 9.3 Controls

Zero-plaintext-at-rest; access to vault scoped to the operating device/service, not humans browsing; every read/write audited; incident hooks (§12) can force-rotate and freeze.

---

## 10. AI Operations Assistant

We already have AI Studio — extend it *into operations* so one operator manages 50 accounts, not 10.

### 10.1 Operator copilot

When an operator opens a task, AI drafts (operator reviews + approves — human-in-the-loop, never auto-ships):

```
Handle ideas · Bio · Profile picture direction · Content strategy ·
First 30 posts · Content angles · Hashtags · Posting times ·
Competitor analysis · Niche research · Local trends
```

Reuses Brand Profiles (voice), AI Studio (generation), and existing content models — MSI is a new *consumer* of those, not new AI infra.

### 10.2 Other AI surfaces

- **Capacity forecasting** (§6): predict throughput and staffing needs per country.
- **QA assist:** flag brand-match / compliance risks for the QA reviewer.
- **Customer-request summarization:** turn free-text change requests into structured tasks.
- **Health/anomaly detection:** surface accounts trending down before the customer notices (§11.3).

---

## 11. Business Intelligence

### 11.1 Country Dashboard

Click a country, see the whole operation:

```
United States
Accounts 428 · Live 391 · Building 18 · Review 12 · Paused 7
Revenue $31,800/mo · Avg engagement 6.2% · Avg delivery 2.8 days
Operator utilization 78% · SLA attainment 95%
```

### 11.2 Operational KPIs

Fulfillment time (p50/p90), SLA attainment, operator productivity (accounts/day, QA pass rate), queue depth, capacity utilization, revenue by country/platform, churn/renewal.

### 11.3 Account Performance Score

Every managed account gets a composite score (denormalized to `managed_account.healthScore`):

```
Health 97 · Growth 88 · Consistency 94 · Compliance 100 · Brand Match 96
Overall 95/100
```

Shown to the customer (trust) and used internally for anomaly detection and operator performance.

---

## 12. Disaster Recovery & Incident Response

- **Account incidents:** platform restriction/suspension → `appeal_restriction` job, customer notified with honest status, escalation path (§8.4). Never silent.
- **Credential incidents:** suspected compromise → force-rotate via vault (§9), freeze operating access, audit review.
- **Customer off-boarding continuity:** the transfer workflow (§9.2) is the planned exit; no customer is ever locked in.
- **Business continuity:** DB backups + PITR (Supabase), vault backups with separate key custody, worker idempotency so a crashed provisioning run resumes without double-acting.
- **Runbooks:** each incident class (restriction, compromise, SLA breach storm, capacity outage) gets a documented runbook before GA.

---

## 13. Customer experience (surface = "Infrastructure")

- **Ordering** (`/dashboard/infrastructure/new`): Country → Platform → Brand Profile → Niche → Handle prefs → **live capacity/ETA (§6)** → **sign Authorization Grant** → checkout (reuse `features/billing`).
- **Infrastructure view** (`/dashboard/infrastructure`): grid of accounts with lifecycle state, ETA, health score, country/platform badges — mission-control pattern; reuses `StatCard`/`PageHeader`/`EmptyState`.
- **Account timeline** (§13.2).
- **Review flow:** per-field approve / request changes → `msi_account_review`.
- **Social Accounts page:** managed accounts appear alongside OAuth accounts with a `Managed` badge — same page, different badge.
- **Calendar/Scheduler:** managed accounts are just additional publish targets. Zero new publishing UX.
- MSI pages adopt **TanStack Query** from day one (per the overhaul doc direction), not `useEffect`+fetch.

### 13.2 GitHub-style account timeline

Event-sourced from `msi_activity_log` — the transparency win customers love:

```
Order created → Authorization signed → Payment received → Operator assigned →
Country manager assigned → Username reserved → Profile created → Avatar uploaded →
Bio added → First posts prepared → QA passed → Review started → Customer approved →
Connected → Publishing enabled → First post published → 100 followers → Active
```

Live ETAs at each open step.

---

## 14. Notifications, jobs, billing (reuse first)

- **Notifications:** reuse `notification` table + `lib/email.ts`. Each state transition can emit a customer notification.
- **Background work:** provisioning worker advances time-based transitions (open/close review window, ETA/capacity recompute, job retries). Pure functions over the state machine → testable.
- **Billing:** Stripe subscription + metered per-account + per-post; webhook → `msi_provisioning_order` → capacity check → fan out. Mirror `features/billing`.

---

## 15. Future vision (why the surface is "Infrastructure")

MSI need not stop at social accounts. The same provisioning + operations + capacity + vault machinery generalizes:

```
Managed Infrastructure
├── Social (TikTok, Instagram, LinkedIn, YouTube, Threads, Pinterest)
├── Business email
├── Local phone number
├── Creator marketplace (videographers, UGC actors, community managers)
├── Ad account / Business Manager (compliant, customer-owned)
├── Domain + landing pages
└── …
```

NativPost becomes the **operating system for launching brands globally** — not an AI content tool with a side feature. Each new infrastructure type is a new `jobType` + inventory class on the *same* engine. (Each also passes its own Phase-0-style compliance review before build.)

---

## 16. Phased roadmap (fitted to this codebase)

Every phase leaves `npm run check-types` and `npm run test` green (repo's reliable gates; lint baseline dirty — hold only new files clean). Ship behind a feature flag; nav gated in `getNavForRole`.

| Phase | Objective | Key deliverables | Exit gate |
|---|---|---|---|
| **0 — Legal/platform review** | De-risk the model | Per-platform operating model (§2.3); Authorization Grant terms; acceptable-use + KYC policy — **checklist: [msi-phase-0-legal-review.md](./msi-phase-0-legal-review.md)** | **Counsel + platform sign-off (hard blockers §12 + sign-off §13). Blocks Phase 3.** |
| **1 — Schema & workflow core** | Foundation | `authorization_grant`, `managed_account`, `msi_*` tables + migration; lifecycle **+ workflow/job** state machines with unit tests | Types green; transition tests pass |
| **2 — Ownership & Credential Vault** | Compliance + security spine | Grant signing/storage; **vault + envelope encryption**; transfer/off-boarding workflow; audit log writer | Grant required before any account; no plaintext credentials |
| **3 — Capacity Engine + Ops ERP** | The factory | Capacity/allocation engine + reservations; ops route group + RBAC; job/task board; QA pipeline; device/SIM inventory; provisioning worker | Operator drives a job order→live in staging; capacity gates checkout |
| **4 — Customer portal** | Transparency UX | Order flow w/ live capacity/ETA; Infrastructure grid; **GitHub-style timeline**; review flow (TanStack Query) | Customer can order, watch, review, approve |
| **5 — Publishing integration** | Close the loop | `socialAccountId` link → Social Accounts + Calendar; publish via `lib/social-publish.ts` | Scheduled post publishes to a live managed account |
| **6 — Billing** | Monetize | Stripe subscription + metered per-account + per-post; webhook fan-out w/ capacity check | Real charge → real order in staging |
| **7 — AI Ops Assistant** | Operator leverage | Copilot drafts (handles/bio/content plan/first posts) w/ human approval; QA assist | 1 operator handles ≥ target accounts |
| **8 — BI & scale** | Enterprise depth | Country dashboards; KPIs; performance scores; list virtualization for large fleets; DR runbooks | Agency w/ 100+ accounts usable; runbooks signed off |

---

## 17. Open questions / decisions

1. **Ops plane hosting:** route group first vs. subdomain split. (Recommend route group first.)
2. **Which platforms first?** Pick the two with the cleanest §2.3 operating model (likely Instagram via Meta partner assignment, then TikTok).
3. **Vault choice:** KMS-backed app-layer envelope encryption vs. managed Vault service.
4. **Sub-brand modeling:** one `brand_profile` per account vs. brand → many accounts (leaning many-per-brand with per-account locale).
5. **Pricing:** confirm subscription tier + per-account + per-post with `features/billing`.
6. **Capacity granularity:** per country only, or country × platform × niche.

---

## 18. Changelog

- **2026-07-24 (Production build H + F — allocation 1:1 + off-boarding)** —
  - **H (account↔device 1:1):** `allocation.ts` split into `allocateOperator`/`allocateDevice`; `planAllocations` now allocates a device **per account** (reused by the account's later jobs, seeded by `existingDeviceByAccount`), operator per job, and returns `isNewDeviceAssignment`. Worker loads active account→device links and creates the `msi_device_assignment` **only** on first placement. Tests updated (device reuse, capacity-once). Fixes the earlier per-job assignment over-count.
  - **F (off-boarding endpoint layer):** `offboarding.ts` (`canOffboard`, tested) + `offboarding-service.ts` — `requestOffboard` (customer: custody → `transfer_requested`, audit `offboard_requested`) and `releaseAccount` (staff, requires the request = dual-auth: account → `archived`, custody → `released`, deactivates the managed `social_account`, audit `credentials_released`). Endpoints: `POST /api/msi/accounts/[id]/offboard` (customer) + `POST /api/admin/msi/accounts/[id]/release` (staff). The credential rotation + secure handoff itself is the external vault (recorded in the audit trail). Gates: `check-types` clean, suite **188/188**. **Remaining (all external/UI):** the prod vault backend + real `PlatformClient`s (yours); G polish (double-listing, calendar verify, BI score); customer-facing off-board button + marketing/pricing page.
- **2026-07-24 (Production build B–E — pipeline running for real)** — Four slices, all green.
  - **B (QA + account coordination):** `lifecycle-coordination.ts` (`pathToCustomerReview`, `advanceAccountThrough`, tested); `operations-service.reviewJob` (peer_review→qa→completed / reject→in_progress) + `openCustomerReview` (a completed provisioning job walks the account to `customer_review` + opens the review window); endpoint `POST /api/admin/msi/jobs/[jobId]/review`. Closes operator→customer loop.
  - **C (notifications):** `notify.ts` (`buildManagedAccountNotification` tested, `notifyManagedAccount`) → in-app notification to the org on `review_ready`; wired into `openCustomerReview`.
  - **D (billing, Phase 6):** `pricing.ts` ($80/account/mo, $1.50/post; tested); `POST /api/msi/orders/[orderId]/checkout` (Stripe subscription Checkout, `type: msi_order`); the existing `stripe-webhook` `checkout.session.completed` now marks the order paid + calls `fulfillOrder`; the configure flow's submit now creates the order → checkout → **redirects to Stripe** (falls back to saved state), shows the monthly total, button "Continue to payment".
  - **E (operator/QA UI):** `components/admin/msi/JobActions.tsx` (client) — "Mark done" per pending task + Approve/Reject on review, calling the B endpoints + `router.refresh()`; embedded in the Ops job board (now actionable, not read-only).
  - **The whole pipeline now runs:** order → Stripe → webhook → fulfil → provisioning jobs → worker allocates+starts → operator completes tasks (board buttons) → QA approves → account `customer_review` + notification → customer approves → live + publishing. Gates: `check-types` clean, suite **185/185**. **Remaining:** F off-boarding (partly needs the prod vault backend), G polish (double-listing/calendar/BI), H account↔device 1:1.
- **2026-07-24 (Production build A — fulfilment + operator task completion)** — Turns the pipeline on. **Fulfilment:** pure `buildProvisioningJob` (create_account job + 4-task checklist) + `allTasksDoneAfter` (`provisioning-jobs.ts`, tested); `provisioning.ts` gained `startProvisioning` (ordered→provisioning, sets `execution_strategy` via resolveStrategy, creates the job+tasks, audit `provisioning_started`) and `fulfillOrder(orderId)` (loads a pending/paid order + its grant → `createManagedAccount` ×quantity → `startProvisioning` each → order `fulfilling`). Endpoint `POST /api/admin/msi/orders/[orderId]/fulfill` (staff). **Operator loop:** `operations-service.ts` `completeTask(jobId, taskId, userId)` marks a task done and, when all are done, submits the job (`in_progress → peer_review`, audit `work_submitted`); endpoint `POST /api/admin/msi/jobs/[jobId]/complete-task`. So: order → provisioning jobs → worker allocates+starts → operator completes tasks → job submitted for review. +3 tests. Gates: `check-types` clean, suite **176/176**. **Next slices:** QA approve (peer_review→qa→completed) + job-completion→account customer_review coordination + notifications; Phase 6 billing (Stripe checkout + webhook→fulfillOrder); operator/QA UI on the Ops board; off-boarding.
- **2026-07-24 (Phase 3 slice 5b — thread content ref into ExecutionContext)** — Closed the publish → execution data gap: a `publish_post` job's `content_item_id` now flows into `ExecutionContext.payload.contentItemId` during orchestration, so a publish adapter/client knows what to publish (provisioning jobs carry no payload). `OrchestrationJob` gained `contentItemId?`; `planJobOrchestration` conditionally sets `ctx.payload`; worker-service maps it from the job row. Migrations `0044`/`0045` applied. +1 test. Gates: `check-types` clean, suite **173/173**.
- **2026-07-24 (Phase 3 slice 5 — publish routing: content → publish_post job)** — Content targeting a managed account now routes into the execution pipeline instead of OAuth. Added `msi_job.content_item_id` (FK → content_item, set null) → migration `0045_msi_job_content_ref.sql` (additive, **not yet applied**). Pure `buildPublishJob({orgId, managedAccountId, contentItemId})` in `publishing.ts` → a queued `publish_post` job + `prepare_media`/`publish` tasks (tested). Service `publishing-service.ts` `enqueueManagedPublish` inserts the job+tasks. Hook in `POST /api/content/[id]/publish`: for each target, if `isManagedSocialAccount(account)` → `enqueueManagedPublish` + result `{ managed, queued }`, `continue` (skips the OAuth publish + token check); non-managed accounts are untouched. So a scheduled managed post becomes a queued job the worker picks up (allocation → adapter → execute). +2 tests. Gates: `check-types` clean, suite **172/172**. Remaining companion: exclude managed connections from the OAuth connected-list to avoid double-listing (left as a one-line filter).
- **2026-07-24 (Phase 3 slice 4 — typed API adapter seam)** — The `official_api` / `delegated_access` strategies now have a real, tested adapter. `src/lib/msi/execution-api.ts`: a `PlatformClient` interface (per-platform integration contract) + `createApiExecutionAdapter(strategy, clients)` that dispatches each operation to the platform's client and maps results uniformly (success→completed+evidence; client throws→failed with reason; no client→failed, never a silent no-op). One factory serves both strategies (the auth difference lives inside the client). Registry gained `registerExecutionAdapter` / `unregisterExecutionAdapter` (execution.ts) — bootstrap registers the adapter once real clients exist; until then the strategy stays fail-closed. Fully testable with a fake client (+5 tests). **Wiring point (yours):** implement `PlatformClient` for Meta/TikTok/etc. with real HTTP + credentials (each needs its own Phase-0 sign-off), then register at worker bootstrap. Gates: `check-types` clean, suite **170/170**. Once registered, the *existing* worker orchestration drives these accounts with zero pipeline changes.
- **2026-07-24 (Phase 3 slice 3 — go-live publishing: connect on approval)** — The keystone integration (docs §13). On customer approval (customer_review → live), the account is connected as a `social_account` row and linked via `managed_account.social_account_id` — so it becomes a live publish target. Pure `src/lib/msi/publishing.ts`: `buildManagedSocialAccount` (marks `accountType='managed'`, `metadata.managedAccountId`, **no OAuth tokens** — managed accounts publish via the execution layer, not the OAuth path), `isManagedSocialAccount`, `managedAccountIdOf`. Wired into `POST /api/msi/accounts/[id]/review` approve branch (idempotent — skips if already linked); writes a `publishing_enabled` audit event. +4 tests. Gates: `check-types` clean, suite **165/165**. **Companion (next):** route content scheduled to a managed target into a `publish_post` job through the execution pipeline (needs a content-ref on the job + a scheduling hook); optionally exclude managed connections from the OAuth connected-list to avoid double-listing with the Infrastructure/ManagedAccountsSection view.
- **2026-07-24 (Phase 3 slice 2 — allocation: queued → assigned)** — The worker now allocates operators + devices to queued jobs, closing the queued → assigned → in_progress loop in one tick. Pure `planAllocations(jobs, operators, devices)` in `allocation.ts` — reuses the tested `allocate`, consuming operator/device capacity across the batch so a single tick can't oversell a slot; jobs with no capacity stay queued. `worker-service.runWorkerTick` allocation block (before orchestration): loads by-country operators/devices + active device loads, plans, then per assignment transitions queued→assigned (validated), sets `assignedOperatorId`/`assignedDeviceId`, increments operator `activeLoad` (sql), creates the `msi_device_assignment`, and writes an `operator_assigned` audit event; newly-assigned jobs are started the same tick. Shared account fetch dedups the two blocks. Demo seed's job flipped to `queued`. +4 tests. Gates: `check-types` clean, suite **161/161**. Refinement noted: device link is per-account 1:1 (currently one assignment per allocation) — fine for the single-provisioning-job case.
- **2026-07-24 (Phase 3 slice 1 — worker orchestration through the Execution Layer)** — The worker now advances provisioning jobs, not just time-based bookkeeping. Pure core `src/lib/msi/orchestration.ts`: `selectJobsToStart` (assigned + unstarted + has-operation), `planJobOrchestration` (→ execution intents with per-account resolved strategy + `ExecutionContext`), `resolveStartOutcome` (ExecutionResult → job next-state: `pending_operator`→stays in_progress; `completed`→peer_review + tasks done; `failed`→failed) — all strategy-agnostic. `worker-service.runWorkerTick` extended with a thin executor: for each intent it resolves the adapter (**fails closed** — unconfigured strategies skipped), calls `execute()`, applies the outcome via validated `transitionJob` calls (assigned→in_progress→{peer_review|failed}) + task/audit writes. Real trigger added: `POST /api/cron/msi-worker` (Bearer `CRON_SECRET`, wire in `vercel.json`). Demo seed gains an `assigned` job so a tick has work to start. +7 tests. Gates: `check-types` clean, suite **157/157**. With only the `manual` adapter live, a tick starts an assigned job → `in_progress` + `execution_started` (awaiting operator) — nothing is auto-operated on a platform.
- **2026-07-24 (Phase 0 CLEARED → Phase 3 execution begun: the Execution Layer)** — Legal review passed all §12 hard blockers (green light). Counsel approved a **hybrid, per-platform execution model behind an adapter abstraction** — workflow/audit/billing/UX are execution-agnostic (docs §3.3). Built `src/lib/msi/execution.ts`: `ExecutionStrategy` (`official_api`|`delegated_access`|`manual`), `ExecutionAdapter` interface, the working **manual** adapter (→ `pending_operator`, in-country operator), a fail-closed registry (`AdapterNotConfiguredError` for unconfigured strategies), account+platform strategy `resolveStrategy`, uniform `executionEffect`, and `jobToOperation`. Added `managed_account.execution_strategy` column → migration `0044_msi_execution_strategy.sql` (additive; **not yet applied**). +10 tests. Gates: `check-types` clean, suite **150/150**. **Next slices:** wire the worker to orchestrate provisioning through the adapter (Job→strategy→adapter→execute→apply); build the `official_api`/`delegated_access` adapters (each needs platform app credentials + its own Phase-0 sign-off); connect a live account's `socialAccountId` for publishing.
- **2026-07-24 (Ops — cross-org job queue landed)** — The operator work-list (docs §8): every job across all accounts grouped by state (attention-first: failed → peer_review → qa → in_progress → … → completed), each row linking to its account board, with SLA-breach flags. Page `admin/msi/queue/page.tsx` (server, cross-org, staff-gated, read-only). Pure core `src/lib/msi/job-queue.ts` (`groupJobsByState`, `jobSlaBreached` — reuses the worker's breach rule, `countByState`) + tests. Nav: "Managed Social → Queue" (`ListChecks`). Complements the per-account board (drill-down) with the primary cross-account view. Gates: `check-types` clean, suite **140/140**. **This reaches the ceiling of substantive pre-Phase-0 build** — remaining work needs real execution (Phase 0) or billing (Phase 6).
- **2026-07-24 (Ops — read-only per-account job board landed)** — Drill-down from the cross-org Ops overview into a specific account's jobs + tasks (docs §7, §8). New page `admin/msi/[id]/page.tsx` (server-rendered, cross-org, staff-gated via middleware, read-only): account header + each `msi_job` with type/state/priority/attempts/SLA/progress and its sequenced `msi_task` checklist; honest empty state ("Provisioning execution begins after Phase 0"). Reachable via a new **Accounts** list on the Ops overview (`/admin/msi`) linking each account to its board. Pure core `src/lib/msi/job-board.ts` (`buildJobBoard` nests tasks under jobs with done/total counts; `jobStateTone`/`taskStatusTone`) + tests. Gates: `check-types` clean, suite **135/135**. No execution — pure observability.
- **2026-07-24 (Hardening pass 2 — worker application logic)** — Extracted the provisioning worker's *application* logic (previously inline in `runWorkerTick`, only type-checked) into a pure, tested `deriveWorkerMutations(plan, jobs)` in `worker.ts`. It turns a `WorkerPlan` into concrete `WorkerMutations`: retry updates carrying the incremented attempt count (validated against the job state machine), and SLA breaches as built, attributed activity events; unknown ids are skipped/null-attributed. `WorkerJob` gained an optional `managedAccountId`. `worker-service.runWorkerTick` is now a thin executor of the derived mutations (moved `transitionJob`/`buildActivityEvent` usage into the pure layer). +3 tests. Gates: `check-types` clean, suite **131/131**. No behavior change.
- **2026-07-24 (Hardening pass — write-path validation)** — Extracted the request-validation logic from the two write-path routes into pure, fully-tested parsers, and slimmed the routes to use them. `order-request.ts` (`parseOrderRequest`/`parseHandles`): discriminated-union result, requires authorization, validates supported country/platform, **caps quantity 1–100** (API previously accepted any positive int) and handle count at 10, trims/normalizes niche + handles. `review-request.ts` (`parseReviewRequest`/`parseChanges`): validates action, **normalizes requested changes to a clean `[{field,note}]`** shape (was storing raw filtered objects) with `field` defaulting to `general`. Routes `POST /api/msi/orders` and `POST .../review` now parse-then-proceed; net removal of inline validation. +15 unit tests. Gates: `check-types` clean, suite **128/128**. Behavior tightened, not changed for valid inputs.
- **2026-07-24 (Ops ERP — read-only factory view landed)** — First internal operations surface (docs §8), on the **cross-org** admin plane. It lives under the existing `/admin` route group (`src/app/[locale]/(admin)/admin/msi/page.tsx`), which `middleware.ts` gates to NativPost staff (`orgId === NATIVPOST_TEAM_ORG_ID && orgRole === 'org:admin'`) — that gate is what makes an all-customers view safe. Server-rendered (no client/query dep), read-only, cross-org: pipeline counts by lifecycle state, pending orders, a per-country inventory table (accounts · operators+cap · devices+cap), and a recent-activity feed. Pure aggregation core `src/lib/msi/ops-overview.ts` (`summarizePipeline`, `rollupCountries`) + tests. Nav: "Managed Social → Operations" added to `AdminShell` (`Boxes` icon). This realizes the "two planes" split (docs §3) via the existing admin area rather than a separate subdomain (the §17 "route group first" recommendation). NO operator task execution (Phase-0-gated). Gates: `check-types` clean, suite **113/113**.
- **2026-07-24 (Phase 5 first slice — Social Accounts integration, read-only)** — Managed accounts now surface on the existing Social Accounts page with a "Managed" badge alongside OAuth-connected accounts (docs §13 "same page, different badge"). Built as a self-contained `src/features/dashboard/ManagedAccountsSection.tsx` (fetches `/api/msi/accounts`, shares the `['msi-accounts']` cache, renders nothing when the org has no managed accounts) + a 2-line additive insertion into `social-accounts/page.tsx` (import + one `<ManagedAccountsSection />`), leaving all existing page logic untouched. Each row shows handle · platform · country + a state chip and links to the Infrastructure detail. Read-only. Gates: `check-types` clean, suite 110/110. (Full Phase 5 — `socialAccountId` link + Calendar publish target — needs a real connected `social_account`, which is Phase-0-gated.)
- **2026-07-24 (Phase 4 review flow landed — bookkeeping-only)** — Completes the customer review loop (docs §5, §13). `POST /api/msi/accounts/[id]/review` with `action: approve | request_changes`: validates the transition via the lifecycle state machine (`customer_review → live` on approve w/ `customerApproved` guard; `→ revisions` on request-changes), writes an `msi_account_review` row + a `customer_approved`/`changes_requested` audit event; org-scoped, 409 if the account isn't awaiting review. Detail-page `ReviewActions` panel (shown only in `customer_review`): Approve, or Request changes with per-field chips (Username/Bio/Profile photo/Display name/Niche) + a note; invalidates the query on success. **Clarified safety stance:** these are INERT state transitions — they flip `lifecycle_state` + write review/audit rows but call no platform, take no payment, and provision nothing (go-live *execution* is unbuilt + Phase-0-gated). Gates: `check-types` clean, suite 110/110.
- **2026-07-24 (Phase 4 order/configure flow landed — no payment/provisioning)** — The customer "Configure" journey up to the compliance gate. `catalog.ts` (+test) supported platforms/countries (launch scope; expand only post-Phase-0 per §15). API: `GET /api/msi/brands` (brand picker), `POST /api/msi/orders` — records the Authorization Grant (via `createAuthorizationGrant`) + a **pending** `msi_provisioning_order`; deliberately **no payment, no managed_account, no provisioning** (fulfilment waits for Phase 0 + Phase 6 billing). Page `dashboard/infrastructure/new/page.tsx`: brand/country/platform/niche/handles/quantity form with a **live capacity + ETA preview** (queries `/api/msi/capacity` on change), an authorization consent step reflecting grant semantics (own the brand, revocable, credentials retrievable), and a success state that states nothing was charged/created. Entry point: "Configure accounts" button on the Infrastructure list header. Gates: `check-types` clean, suite **110/110**. Read-mostly; the only writes are the consent grant + pending order (inert bookkeeping).
- **2026-07-24 (Phase 4 read-only customer surfaces landed)** — The transparency UX (read-only slice; no ordering/approve mutations, which stay Phase 0-gated). Pure `display.ts` (state→label/tone, 4-stage bar, `humanizeAction` for the timeline) + tests. Three read-only API routes: `GET /api/msi/accounts` (org-scoped list), `GET /api/msi/accounts/[id]` (account + append-only timeline, 404 if not owned), `GET /api/msi/capacity` (wraps `assessCountryCapacity` for the order-flow ETA preview). Two pages under `dashboard/infrastructure/`: the **Infrastructure grid** (StatCards + account cards with stage bar) and the **account detail + GitHub-style timeline** (§13.2). Nav: "Infrastructure" added to `getNavForRole` (Workspace group, `Boxes` icon). Uses existing TanStack Query provider + dashboard primitives. Gates: `check-types` clean, suite **107/107**. **Not verified visually** — dashboard is Clerk-authed, not drivable in this env; correctness is by convention-match + type-check. No write paths built.
- **2026-07-23 (Phase 0 checklist drafted)** — [msi-phase-0-legal-review.md](./msi-phase-0-legal-review.md) added: the legal/platform review gate that blocks provisioning execution. Grounded in the built compliant model; covers per-platform operating model, Authorization Grant, AUP/KYC/sanctions, privacy, credential security, in-country labor, telecom/SIM, tax, and marketing claims. Defines 9 hard blockers (§12) + a domain sign-off matrix (§13) + re-review triggers (§14). Verify/smoke: seed→smoke→teardown confirmed the capacity gate flips correctly against the live DB (empty=waitlist; seeded US operator cap10 + device cap5, request 5 → immediate/eta 2/confidence 0.95).
- **2026-07-23 (Phase 3 DB service layer landed — non-provisioning)** — Migration `0043` applied to the DB. Wired the tested pure engines to the real schema with four services in `src/lib/msi/`: `capacity-service.ts` (`assessCountryCapacity` — assembles a live inventory snapshot → `assessCapacity`; the checkout gate, read-only), `grant-service.ts` (`createAuthorizationGrant`/`revokeAuthorizationGrant`/`getActiveGrant` — the compliance prerequisite), `reservation-service.ts` (create/consume/release/expire soft-holds), `worker-service.ts` (`runWorkerTick` — loads due work, runs `planWorkerTick`, applies it: expire reservations, close review windows, requeue failed jobs via the validated state machine, record SLA-breach escalations — no platform operations). Gate: `check-types` clean; suite unchanged at 103/103 (services compose already-tested logic; not DB-integration-tested here). **Still Phase 0-gated:** real account-operation execution + the operator task/QA UI. **Still pending:** prod credential blob-store backend; Phase 4 customer/ops UI (Clerk-auth, not verifiable in this env).
- **2026-07-23 (Phase 3 compute engines landed — non-provisioning)** — The pure decision layer of the factory, safe pre-Phase-0 (nothing here provisions or operates a real account). `capacity.ts` (Capacity Engine §6: `assessCapacity` → feasibility/ETA/confidence/waitlist that gates checkout; `availableSlots`, `buildSnapshot`), `allocation.ts` (least-loaded operator+device allocator respecting caps/role/country/status), `reservation.ts` (30-min soft-hold TTL + `countHeldSlots` oversell guard), `sla.ts` (per-job-type `slaDueAt`, nearest-rank `percentile`, `summarizeSla`), `worker.ts` (`planWorkerTick` — the provisioning worker's pure PLANNING tick: expire reservations, close review windows, retry failed jobs under limit, flag SLA breaches; executes nothing itself). +27 unit tests. Gates: `check-types` clean, full suite **103/103**. **Still remaining for full Phase 3 (needs Phase 0 legal sign-off + DB/UI):** applying the worker plan to the DB, the Ops ERP route group + RBAC UI, and actual account-operation execution. Migration 0043 still not applied.
- **2026-07-23 (Phase 2 landed)** — Ownership + Credential Vault (the compliance & security spine) shipped in `src/lib/msi/`. **Grant enforcement** (`grant.ts`): `isGrantActive`/`grantCoversScope` + `assertActiveGrant`/`assertGrantCoversScope`, `GrantRequiredError`; composed by `provisioning.ts` `createManagedAccount` so **no account row can be created without an active, in-scope grant**. **Credential vault** (`vault.ts` pure AES-256-GCM envelope encryption: DEK-per-secret wrapped by a KEK; `vault-env.ts` fail-closed key loader reading new `MSI_VAULT_MASTER_KEY`; `credentials.ts` `CredentialVault` storing ciphertext blob and wrapped DEK **separately** — a leak of either store alone reveals nothing). **Custody state machine** (`custody.ts`): `provisioning → nativpost_operating → transfer_requested → released`; release requires dual auth + rotation (off-boarding workflow §9.2). **Audit builder** (`audit.ts`): append-only `buildActivityEvent`. 26 new unit tests (round-trip, no-plaintext, tamper detection, KEK rotation, grant/scope enforcement, custody guards). Gates: `check-types` clean, full suite **76/76**. Pure modules avoid `db`/`Env` imports for test isolation; DB service (`provisioning.ts`) + prod blob-store backend are the wiring left for Phase 3. **Migration 0043 still not applied.**
- **2026-07-23 (Phase 1 landed)** — Schema + state machines shipped. Added 12 MSI tables to `src/models/Schema.ts` (`authorization_grant`, `managed_account`, `msi_provisioning_order`, `msi_job`, `msi_task`, `msi_account_review`, `msi_activity_log`, `msi_operator`, `msi_device`, `msi_device_assignment`, `msi_capacity_reservation`, `msi_credential`) → migration `0043_msi_phase_1.sql`. State machines in `src/lib/msi/` (`state-machine.ts` generic FSM helper, `lifecycle.ts` account lifecycle §5, `job-workflow.ts` job engine §7) with 24 unit tests covering every legal/illegal transition + guard. Gates: `check-types` clean, full suite 50/50 green. **Not yet wired to any DB writes / UI** — that's Phase 2+.
- **2026-07-23 (v2)** — Added Capacity & Allocation Engine (§6), Workflow Engine / jobs model + QA pipeline + SLAs (§7), Operations ERP (§8), Security & Credential Vault (§9), AI Operations Assistant (§10), Business Intelligence + country dashboards + performance score (§11), Disaster Recovery & Incident Response (§12), GitHub-style account timeline (§13.2), Future Vision (§15). Renamed customer surface to **Infrastructure**. Reinforced proxy compliance guardrail (§2.2, §8.3). Updated roadmap to 9 phases.
- **2026-07-23 (v1)** — Initial doc. Locked compliant *Managed Local Presence* model; rejected Fastlane evasion/inventory mechanics; two-plane architecture; Drizzle entities; lifecycle state machine; Phase-0-gated roadmap.
```
