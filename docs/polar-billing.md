# Polar.sh billing

NativPost sells through **one of two international rails**, chosen by a single
env var:

```
BILLING_PROVIDER=stripe   # direct Stripe Billing (default when unset)
BILLING_PROVIDER=polar    # Polar.sh, Merchant of Record
```

Nothing was removed. Stripe remains fully implemented and is still the default,
so an existing deployment that never sets `BILLING_PROVIDER` behaves exactly as
it did before this work landed.

**Paystack is not part of this switch.** It is a regional rail the customer
picks at checkout (Nigerian/African cards) and keeps its own routes
(`create-paystack-subscription`, `paystack-webhook`, `paystack-manage`)
untouched. `BILLING_PROVIDER` only decides what the *other* button says.

---

## Why Polar

Polar is a **Merchant of Record**: it is the legal seller for the transaction
and handles international VAT/GST/sales-tax registration and remittance. For a
small SaaS selling into the US, UK, EU, Canada, Australia and Nigeria, that
removes an entire compliance workstream.

The trade is fee rate — Polar's Starter tier is 5% + $0.50 (plus a 1.5%
international-card fee) against raw Stripe processing — and less low-level
control. The comparison that matters is *Stripe plus your own tax compliance*
against *Polar's fee*, not the raw processing rates.

---

## Architecture

```
                     API routes  ·  UI  ·  MSI services
                                  │
                                  ▼
                     src/lib/billing/provider.ts        ← the seam
                                  │
                  ┌───────────────┴───────────────┐
                  ▼                               ▼
        stripe-provider.ts                polar-provider.ts
                  │                               │
                  ▼                               ▼
             Stripe API                       Polar API
```

**Nothing above `provider.ts` imports a payment SDK.** Both implementations are
loaded with a dynamic `import()`, so a Polar-only deployment never constructs a
Stripe client and vice versa.

### Files

| File | Role |
| --- | --- |
| `src/lib/billing/provider.ts` | `BillingProvider` interface + `getBillingProvider()` |
| `src/lib/billing/stripe-provider.ts` | Stripe implementation |
| `src/lib/billing/polar-provider.ts` | Polar implementation |
| `src/lib/billing/polar-client.ts` | Lazy Polar SDK client, sandbox/production resolution |
| `src/lib/billing/org-contact.ts` | Clerk lookup for billing emails (shared by both webhooks) |
| `src/app/api/billing/polar-webhook/route.ts` | Polar webhook (mirrors the Stripe one) |
| `src/lib/msi/billing.ts` | Metered publish reporting on both rails |
| `src/lib/msi/addon-billing.ts` | Add-on billing on both rails |

### Where the two models genuinely differ

These are real differences in what the providers can do, not implementation
shortcuts. Each is handled explicitly.

| | Stripe | Polar |
| --- | --- | --- |
| **Pricing object** | Product + separate Price; one product can have monthly and yearly prices | No price object — a product *is* its pricing, so **monthly and yearly are two separate products** |
| **Customer identity** | Must create a customer, store the id, look it up | `external_customer_id` is first-class — the Clerk `orgId` is passed directly and Polar creates/reuses its own record |
| **Portal** | Billing Portal session | Customer Session → pre-authenticated hosted portal URL (no email code needed) |
| **Success URL token** | `{CHECKOUT_SESSION_ID}` | `{CHECKOUT_ID}` |
| **Cancel URL** | `cancel_url` | No equivalent; `returnUrl` is the closest and is what the seam maps to |
| **Multi-item subscriptions** | A subscription holds many items; add-ons are extra items | One subscription = one product. **No subscription-item API** |
| **One-off charges** | Invoice items on the next invoice | No invoice-item API — billed as metered units instead |
| **Usage metering** | `billing.meterEvents.create`, idempotent on `identifier` | `events.ingest`, deduped on `external_id` |
| **Trial-ending webhook** | `customer.subscription.trial_will_end` | None — Polar sends its own conversion reminders |

---

## Setup

### 1. Create the Polar products

Polar dashboard → **Products**. Because a product carries its own pricing you
need **two products per tier** — one monthly, one yearly:

| Plan | Monthly | Yearly |
| --- | --- | --- |
| Starter | $19/mo | $182/yr |
| Growth | $39/mo | $374/yr |
| Pro | $79/mo | $758/yr |
| Agency | $149/mo | $1430/yr |

Then paste each product id into `src/lib/plans.ts`, replacing the
`polar_…_REPLACE` placeholders:

```ts
polarProductId:       { dev: '<sandbox id>', prod: '<production id>' },
polarAnnualProductId: { dev: '<sandbox id>', prod: '<production id>' },
```

`dev` = sandbox, `prod` = production, selected by `BILLING_PLAN_ENV` — the same
split Stripe and Paystack already use in that file.

To copy an id: **⋮** on the product row → **Copy Product ID** (a UUID like
`099faa4d-14a4-4a0f-836f-d68a78fb7bc1`).

### 1b. Two more products, for the non-plan purchases

These are the `POLAR_CREDITS_PRODUCT_ID` / `POLAR_MSI_ACCOUNT_PRODUCT_ID` env
vars. Both use **ad-hoc pricing**: the app overrides the amount on every
checkout, so the price you set in the catalog is only a placeholder and never
what the customer pays. That is why one product covers every credit pack size
and every managed-account quantity, instead of needing dozens of products.

**AI Credits** → `POLAR_CREDITS_PRODUCT_ID`

| Field | Value |
| --- | --- |
| Name | `NativPost AI Credits` |
| Billing | **One-time purchase** |
| Price | Fixed, `$10` (placeholder — overridden per checkout) |

The real amount comes from the top-up form: $1 buys 10 credits, so a $25 top-up
is sent to Polar as `2500` cents with `credits: 250` in metadata. The webhook
reads that metadata to grant the credits.

**Managed social account** → `POLAR_MSI_ACCOUNT_PRODUCT_ID`

| Field | Value |
| --- | --- |
| Name | `Managed social account` |
| Billing | **Recurring — monthly** |
| Price | Fixed, `$80` (placeholder — overridden per checkout) |

$80 is `MSI_PER_ACCOUNT_USD` in `src/lib/msi/pricing.ts`. An order for 3
accounts is charged as one line of `$240`, because Polar checkout has no
per-line quantity for a fixed price — the real quantity stays on the
`msi_provisioning_order` row and fulfilment fans out from there, unchanged.

> Set these in the **same** Polar instance as your token. Sandbox products are
> invisible to a production token and vice versa, and a mismatch fails at
> checkout with a 404 on the product id, not at boot.

### 2. Environment

```bash
BILLING_PROVIDER=polar
POLAR_ACCESS_TOKEN=polar_oat_…      # Settings → Developers → New Token
POLAR_WEBHOOK_SECRET=…              # from the webhook endpoint, or `polar listen`
POLAR_SERVER=sandbox                # or production; defaults from BILLING_PLAN_ENV

POLAR_CREDITS_PRODUCT_ID=…
POLAR_MSI_ACCOUNT_PRODUCT_ID=…
POLAR_MSI_METER_EVENT_NAME=nativpost_managed_post
POLAR_ADDON_FEE_METER_EVENT_NAME=nativpost_addon_fee
```

**Sandbox and production are separate instances with separate tokens.** A
production token is rejected by the sandbox API and vice versa. Sandbox lives at
`sandbox.polar.sh`; get its token from there, not the main dashboard.

### 3. Webhook endpoint

Polar dashboard → **Settings → Webhooks → Add Endpoint**

- URL: `https://app.nativpost.com/api/billing/polar-webhook`
- Format: **Raw**
- Secret: generate one, put it in `POLAR_WEBHOOK_SECRET`
- Events: `order.paid`, `subscription.created`, `subscription.active`,
  `subscription.updated`, `subscription.uncanceled`, `subscription.past_due`,
  `subscription.canceled`, `subscription.revoked`

The route is already exempt from Clerk auth in `src/middleware.ts`; it verifies
Standard Webhooks signatures itself and returns 403 on a bad signature.

### 4. Meters (only if metered MSI billing is turned on)

Polar dashboard → **Usage Billing → Meters**:

- `nativpost_managed_post` — aggregation **Count**. Attach a metered price to
  the managed-account product for the per-post rate.
- `nativpost_addon_fee` — aggregation **Sum** over `metadata.units`, priced at
  **$0.01 per unit**. One-off add-on fees are reported in cents-as-units, so
  N cents bills as N × $0.01. Getting this price wrong misbills by 100×.

Then flip `MSI_METERED_BILLING_ENABLED=true`.

---

## Local development

The Polar CLI tunnels webhooks to localhost without ngrok.

Polar ships binaries for macOS and Linux only. On Windows it is built from
source with Bun and installed to `C:\Users\<you>\.polar\bin\polar.exe` (already
on the user PATH on this machine):

```bash
git clone --depth 1 https://github.com/polarsource/cli.git && cd cli && bun install && bun build ./src/cli.ts --compile --target=bun-windows-x64 --outfile polar.exe
```

Then:

```bash
polar login
```

```bash
polar listen http://localhost:3000/api/billing/polar-webhook
```

It prints a secret — put that in `POLAR_WEBHOOK_SECRET` for the dev session.

Test cards are Stripe's, e.g. `4242 4242 4242 4242` with any future expiry and
any CVC. Note that sandbox customer emails only reach organisation members, so
add test addresses under Settings → Members (`you+test@example.com` works).

---

## Event mapping

| Polar event | Stripe equivalent | What NativPost does |
| --- | --- | --- |
| `order.paid` | `checkout.session.completed` | MSI order → mark paid + fulfil; AI credits → top up wallet |
| `subscription.created` | `checkout.session.completed` | Sync plan/status/ids |
| `subscription.active` | `customer.subscription.updated` | Sync; fire plan.upgraded + Trustpilot on first activation |
| `subscription.updated` | `customer.subscription.updated` | Sync (also covers renewals) |
| `subscription.past_due` | `invoice.payment_failed` | `plan_status = past_due` + in-app notification |
| `subscription.uncanceled` | — | Sync |
| `subscription.canceled` | — | Cancellation **scheduled**; access continues, cancellation email sent |
| `subscription.revoked` | `customer.subscription.deleted` | Access ends; `plan_status = cancelled` |

Two Polar behaviours to keep in mind:

- **`subscription.canceled` does not end access.** Polar keeps the subscription
  `active` with `cancel_at_period_end` until the period ends, then sends
  `subscription.revoked`. That is why the email fires on one event and the plan
  reset on the other.
- **`subscription.cycled` exists in the API but is not typed by SDK 0.49**, so
  renewals are handled through `subscription.updated`, which covers the same
  transition.

### Dunning

Polar retries a failed renewal 4 times over 21 days (+2d, +5d, +7d, +7d),
holding the subscription in `past_due`. If all fail it revokes. A grace period
for benefit revocation is configurable under **Settings → Subscriptions**;
NativPost's own limit checks already refuse writes while `past_due`, so a short
grace period is safe.

---

## Add-ons: two different activation flows

Polar only creates **paid** subscriptions through a checkout the customer
completes (`POST /v1/subscriptions` accepts free products only), so a flat
add-on cannot be provisioned server-side the way Stripe does it. The add-on
flow therefore branches by rail — but the branch is contained in
`beginAddonActivation()`, and the UI just follows what the API returns.

| | Stripe | Polar |
| --- | --- | --- |
| First activation | subscription **item** added to the org's plan subscription, immediately | customer sent to **checkout**; the add-on activates from the `msi_addon` webhook branch once paid |
| Tier change | item re-priced in place (`proration_behavior: 'none'`) | subscription moved to the new product (`prorationBehavior: 'prorate'`) — no checkout |
| Deactivation | subscription item deleted | add-on's own subscription revoked |
| One-off fees | invoice item on the next invoice | metered units on `nativpost_addon_fee`, same economic outcome |

**Activation is deliberately ordered payment-first on Polar.** Activating the
row and billing afterwards would hand the add-on out free to anyone who
abandons checkout — exactly the failure Stripe avoids by billing in the same
server-side call. So `beginAddonActivation()` returns a checkout URL and writes
nothing; `activateAddonFromCheckout()` (called only by the webhook) is what
grants entitlement.

`POST /api/msi/addons` with `action: 'activate'` returns one of:

```jsonc
{ "ok": true, "status": "active" }                        // activated server-side
{ "ok": true, "requiresCheckout": true, "checkoutUrl": … } // customer must pay first
```

The add-ons page redirects on the second shape and shows a "payment received"
banner on return, refetching after ~2s to cover webhook lag.

Per-add-on product ids come from env, mirroring the Stripe price keys:

```bash
POLAR_ADDON_PRODUCT_MANAGED_POSTING_STARTER=…       # cf. STRIPE_ADDON_PRICE_…
POLAR_ADDON_PRODUCT_MANAGED_POSTING_PROFESSIONAL=…
POLAR_ADDON_PRODUCT_MANAGED_CONTENT_LITE=…
```

An add-on with no configured product id activates immediately and unbilled on
both rails — the same behaviour as today with `MSI_ADDON_BILLING_ENABLED` off.

---

## Go-live checklist

Run against **sandbox** first, with `BILLING_PROVIDER=polar` and
`BILLING_PLAN_ENV=dev`:

1. New subscription — free org upgrades to a paid plan
2. Renewal — subscription cycles and stays active
3. Failed payment — `past_due` set, in-app notification fires
4. Recovery — payment method updated in the portal restores `active`
5. Cancellation — access continues to period end
6. Cancellation reversal — uncancel restores normal renewal
7. Upgrade / downgrade between tiers
8. Monthly ↔ yearly switch (a *different product* on Polar)
9. Refund
10. Webhook redelivery — replay an event, confirm nothing double-applies
11. Customer portal — invoices, receipts, payment method
12. AI credit top-up credits the wallet exactly once
13. MSI order — paid, fulfilled, accounts provisioned
14. Payout reaches the business account

Only after all 14 pass should `BILLING_PROVIDER=polar` go to production. Because
the switch is per-environment, production can stay on Stripe while staging runs
Polar.

## Rollback

Set `BILLING_PROVIDER=stripe` and redeploy. Existing Polar subscriptions keep
renewing and their webhooks keep being processed (the webhook route is always
live, independent of the switch) — only *new* checkouts move back to Stripe.
Orgs carry both sets of ids, so nothing is lost either way.
