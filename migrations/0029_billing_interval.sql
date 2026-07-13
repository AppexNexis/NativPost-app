-- Annual/yearly billing interval column.
-- Existing monthly subscriptions get 'month' via the default; new rows pick
-- up whatever interval the user selected during checkout.
ALTER TABLE "organization" ADD COLUMN "billing_interval" text DEFAULT 'month' NOT NULL;
