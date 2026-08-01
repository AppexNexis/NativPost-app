/**
 * GET/PUT /api/social-accounts/tiktok/defaults?accountId=...
 *
 * Per-account TikTok publishing defaults — the middle tier of the settings
 * hierarchy (campaign override → ACCOUNT DEFAULT → live creator_info). Stored
 * on `social_account.metadata.tiktokDefaults` and read by the publish cron,
 * which passes them to `resolveTikTokSettings`.
 *
 * Setting these once means a campaign that doesn't override anything still
 * publishes with the user's intent rather than a hardcoded fallback.
 */

import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import type { TikTokPublishConfig } from '@/lib/tiktok/resolve-settings';
import { TIKTOK_PRIVACY_LEVELS, USE_ACCOUNT_DEFAULT } from '@/lib/tiktok/resolve-settings';
import { getDb } from '@/libs/DB';
import { socialAccountSchema } from '@/models/Schema';

export const dynamic = 'force-dynamic';

/**
 * Accept only known keys with known shapes. This lands in a jsonb column that
 * the publisher trusts, so anything unrecognised is dropped rather than stored
 * and later fed to TikTok.
 */
function sanitize(input: unknown): TikTokPublishConfig {
  const raw = (input ?? {}) as Record<string, unknown>;
  const out: TikTokPublishConfig = {};

  if (raw.publishMethod === 'DIRECT' || raw.publishMethod === 'INBOX') {
    out.publishMethod = raw.publishMethod;
  }
  if (
    typeof raw.privacyLevel === 'string'
    && ((TIKTOK_PRIVACY_LEVELS as readonly string[]).includes(raw.privacyLevel)
      || raw.privacyLevel === USE_ACCOUNT_DEFAULT)
  ) {
    out.privacyLevel = raw.privacyLevel as TikTokPublishConfig['privacyLevel'];
  }
  for (const key of ['allowComment', 'allowDuet', 'allowStitch', 'isAIGC', 'brandOrganicToggle', 'brandContentToggle'] as const) {
    if (typeof raw[key] === 'boolean') {
      out[key] = raw[key] as boolean;
    }
  }
  return out;
}

async function loadAccount(db: any, orgId: string, accountId: string) {
  const [account] = await db
    .select()
    .from(socialAccountSchema)
    .where(and(eq(socialAccountSchema.id, accountId), eq(socialAccountSchema.orgId, orgId)))
    .limit(1);
  return account;
}

export async function GET(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const accountId = request.nextUrl.searchParams.get('accountId');
  if (!accountId) {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
  }

  const account = await loadAccount(db, orgId!, accountId);
  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const metadata = (account.metadata ?? {}) as { tiktokDefaults?: TikTokPublishConfig };
  return NextResponse.json({ defaults: metadata.tiktokDefaults ?? {} }, { status: 200 });
}

export async function PUT(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch { /* empty body → clears the defaults */ }

  const accountId = typeof body.accountId === 'string'
    ? body.accountId
    : request.nextUrl.searchParams.get('accountId');
  if (!accountId) {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
  }

  const account = await loadAccount(db, orgId!, accountId);
  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }
  if (account.platform !== 'tiktok') {
    return NextResponse.json({ error: 'Not a TikTok account' }, { status: 400 });
  }

  const defaults = sanitize(body.defaults);

  // Merge, never replace: `metadata` also carries platform fields written
  // elsewhere (WhatsApp's phoneNumberId, for one).
  const metadata = (account.metadata ?? {}) as Record<string, unknown>;
  await db
    .update(socialAccountSchema)
    .set({ metadata: { ...metadata, tiktokDefaults: defaults } })
    .where(eq(socialAccountSchema.id, accountId));

  return NextResponse.json({ defaults }, { status: 200 });
}
