import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const Env = createEnv({
  server: {
    CLERK_SECRET_KEY: z.string().min(1),
    DATABASE_URL: z.string().optional(),
    LOGTAIL_SOURCE_TOKEN: z.string().optional(),
    STRIPE_SECRET_KEY: z.string().min(1),
    STRIPE_WEBHOOK_SECRET: z.string().min(1),
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
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().optional(),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().min(1),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
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
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
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
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_NATIVPOST_TEAM_ORG_ID: process.env.NEXT_PUBLIC_NATIVPOST_TEAM_ORG_ID,
    NODE_ENV: process.env.NODE_ENV,
  },
});