-- Polar.sh billing columns, mirroring the existing Stripe ones.
--
-- Polar runs ALONGSIDE Stripe rather than replacing it: BILLING_PROVIDER picks
-- which rail new checkouts go through, and both column sets can be populated on
-- one org (a customer who subscribed on Stripe and later re-subscribed on Polar
-- keeps their Stripe history). `organization.payment_type` records which rail
-- the LIVE subscription is on.
--
-- Note there is no polar_*_price_id: Polar has no separate price object — a
-- product carries its own pricing, which is also why monthly and yearly are two
-- distinct products in src/lib/plans.ts.
--
-- IF NOT EXISTS throughout so this is safe to re-run against a database where
-- part of it has already been applied by hand.

ALTER TABLE "organization"
  ADD COLUMN IF NOT EXISTS "polar_customer_id" text,
  ADD COLUMN IF NOT EXISTS "polar_subscription_id" text,
  ADD COLUMN IF NOT EXISTS "polar_product_id" text,
  ADD COLUMN IF NOT EXISTS "polar_subscription_status" text,
  ADD COLUMN IF NOT EXISTS "polar_subscription_current_period_end" integer;
--> statement-breakpoint

-- MSI managed-account orders paid through Polar.
ALTER TABLE "msi_provisioning_order"
  ADD COLUMN IF NOT EXISTS "polar_checkout_id" text,
  ADD COLUMN IF NOT EXISTS "polar_subscription_id" text;
--> statement-breakpoint

-- Reconciliation anchor for metered publishes reported to Polar. Holds the
-- `external_id` sent with the ingested event (this row's id) — Polar's ingest
-- response returns counts, not per-event ids. Exactly one of
-- stripe_usage_record_id / polar_usage_event_id is set per row, which also
-- records which provider metered the event.
ALTER TABLE "msi_billable_publish_event"
  ADD COLUMN IF NOT EXISTS "polar_usage_event_id" text;
--> statement-breakpoint

-- Polar has no per-item subscription API, so an add-on bought on Polar is its
-- own subscription against a dedicated add-on product rather than an extra item
-- on the org's plan subscription. See src/lib/msi/addon-billing.ts.
ALTER TABLE "msi_addon_subscription"
  ADD COLUMN IF NOT EXISTS "polar_subscription_id" text;
