-- Free plan backfill
--
-- The /subscribe wall is gone: every org is auto-enrolled on the `free`
-- plan at signup and reaches the dashboard directly. This migrates the
-- orgs that were created under the old model so nobody is left staring
-- at a status the app no longer routes for.
--
-- Data only — no schema change. Deliberately narrow: an org is rewritten
-- only when it has never touched a payment provider, so subscribers,
-- scheduled Paystack subscriptions and past_due accounts mid-recovery
-- are all left exactly as they are.

--> statement-breakpoint
-- 1. Orgs that never got past the old paywall (`inactive`, the default the
--    Clerk webhook used to insert). Give them a fresh free window starting
--    now — they never had a usable one.
UPDATE "organization"
SET "plan" = 'free',
    "plan_status" = 'trialing',
    "trial_ends_at" = now() + interval '7 days',
    "posts_per_month" = 3,
    "platforms_limit" = 2,
    "updated_at" = now()
WHERE "plan_status" = 'inactive'
  AND "stripe_subscription_id" IS NULL
  AND "paystack_subscription_code" IS NULL;

--> statement-breakpoint
-- 2. Orgs mid-trial under the old model with no subscription behind them.
--    Relabel the plan to `free` but KEEP trial_ends_at — their remaining
--    days carry over untouched. Once it lapses they land on the billing
--    page instead of being locked out.
UPDATE "organization"
SET "plan" = 'free',
    "posts_per_month" = 3,
    "platforms_limit" = 2,
    "updated_at" = now()
WHERE "plan_status" = 'trialing'
  AND "plan" <> 'free'
  AND "stripe_subscription_id" IS NULL
  AND "paystack_subscription_code" IS NULL;

--> statement-breakpoint
-- 3. Trialing orgs with no end date at all (setup fee paid but the trial
--    clock never got written). Without this they compute as expired the
--    moment the app reads them.
UPDATE "organization"
SET "trial_ends_at" = now() + interval '7 days',
    "updated_at" = now()
WHERE "plan_status" = 'trialing'
  AND "trial_ends_at" IS NULL;
