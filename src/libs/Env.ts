import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

/**
 * An optional secret that may be declared-but-blank.
 *
 * `.env` files commonly carry placeholder keys with empty values (`FOO=`) for
 * documentation. Plain `z.string().min(1).optional()` rejects those, because
 * the variable IS present — it is just empty — so a blank placeholder would
 * fail startup for everyone. This coerces '' to undefined first, so blank and
 * absent mean the same thing: not configured.
 */
const optionalSecret = z.preprocess(
  v => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().min(1).optional(),
);

/** Same treatment for an optional enum with a blank placeholder. */
function optionalEnum<T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess(
    v => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.enum(values).optional(),
  );
}

export const Env = createEnv({
  server: {
    CLERK_SECRET_KEY: z.string().min(1),
    DATABASE_URL: z.string().optional(),
    LOGTAIL_SOURCE_TOKEN: z.string().optional(),
    // Which international billing provider is live. Paystack is a separate,
    // region-specific rail and is NOT selected by this switch — it stays
    // available alongside whichever provider is chosen here.
    // Unset → 'stripe', so existing deployments keep their current behaviour.
    BILLING_PROVIDER: optionalEnum(['stripe', 'polar']),
    // Optional so the app can boot on a Polar-only deployment. The Stripe
    // provider fails loudly at call time when it is selected without these.
    STRIPE_SECRET_KEY: optionalSecret,
    STRIPE_WEBHOOK_SECRET: optionalSecret,
    // Polar (Merchant of Record). Organization Access Token from
    // polar.sh → Settings → Developers. Optional for the same reason.
    POLAR_ACCESS_TOKEN: optionalSecret,
    POLAR_WEBHOOK_SECRET: optionalSecret,
    // Which Polar instance the access token belongs to. Sandbox tokens do NOT
    // work against production and vice versa. Unset → derived from
    // BILLING_PLAN_ENV ('prod' → production, anything else → sandbox).
    POLAR_SERVER: optionalEnum(['sandbox', 'production']),
    BILLING_PLAN_ENV: z.enum(['dev', 'test', 'prod']),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
    // Optional — middleware fails closed (denies all admin access) if unset.
    // Set in Vercel env vars. Never hardcode the value.
    NATIVPOST_TEAM_ORG_ID: z.string().min(1).optional(),
    // Optional. When set, uploads in the seed pipeline pass this URL to
    // Cloudinary as `notification_url` so async video-moderation verdicts
    // POST back to /api/webhooks/cloudinary-moderation.
    // Format: https://<prod-host>/api/webhooks/cloudinary-moderation
    CLOUDINARY_MODERATION_WEBHOOK: z.string().url().optional(),
    // Optional Discord webhook for in-app feedback notifications.
    // Set the URL in Vercel env vars; leave unset to skip.
    FEEDBACK_DISCORD_WEBHOOK_URL: z.string().url().optional(),
    // Base64-encoded 32-byte master key (KEK) for the MSI credential vault
    // (docs/managed-social-infrastructure.md §9). Generate with
    // `generateMasterKey()` from src/lib/msi/vault.ts. The vault fails CLOSED
    // (throws) when unset — no credential can be sealed or revealed.
    MSI_VAULT_MASTER_KEY: z.string().min(1).optional(),
    // Infrastructure Vault ciphertext storage (Supabase Storage private bucket).
    // The wrapped DEK stays in Postgres (msi_credential); the ciphertext blob
    // lives here — separate trust boundaries. All optional; the vault fails
    // closed when unset.
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
    MSI_VAULT_BUCKET: z.string().min(1).optional(), // defaults to 'vault'
    // Metered publish billing kill-switch. Off by default: billable events are
    // still RECORDED, but nothing is reported to the billing provider until
    // this is 'true'. Reporting goes to whichever BILLING_PROVIDER is active.
    MSI_METERED_BILLING_ENABLED: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().optional(),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().min(1),
    // Optional — a Polar-only deployment has no Stripe publishable key.
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optionalSecret,
    // Optional — only controls sidebar link visibility, not actual access.
    NEXT_PUBLIC_NATIVPOST_TEAM_ORG_ID: z.string().min(1).optional(),
  },
  shared: {
    NODE_ENV: z.enum(['test', 'development', 'production']).optional(),
  },
  runtimeEnv: {
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    LOGTAIL_SOURCE_TOKEN: process.env.LOGTAIL_SOURCE_TOKEN,
    BILLING_PROVIDER: process.env.BILLING_PROVIDER,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    POLAR_ACCESS_TOKEN: process.env.POLAR_ACCESS_TOKEN,
    POLAR_WEBHOOK_SECRET: process.env.POLAR_WEBHOOK_SECRET,
    POLAR_SERVER: process.env.POLAR_SERVER,
    BILLING_PLAN_ENV: process.env.BILLING_PLAN_ENV,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    NATIVPOST_TEAM_ORG_ID: process.env.NATIVPOST_TEAM_ORG_ID,
    CLOUDINARY_MODERATION_WEBHOOK: process.env.CLOUDINARY_MODERATION_WEBHOOK,
    FEEDBACK_DISCORD_WEBHOOK_URL: process.env.FEEDBACK_DISCORD_WEBHOOK_URL,
    MSI_VAULT_MASTER_KEY: process.env.MSI_VAULT_MASTER_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    MSI_VAULT_BUCKET: process.env.MSI_VAULT_BUCKET,
    MSI_METERED_BILLING_ENABLED: process.env.MSI_METERED_BILLING_ENABLED,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_NATIVPOST_TEAM_ORG_ID: process.env.NEXT_PUBLIC_NATIVPOST_TEAM_ORG_ID,
    NODE_ENV: process.env.NODE_ENV,
  },
});
