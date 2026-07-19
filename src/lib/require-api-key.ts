/**
 * Bearer-token authentication for the public /api/v1 surface.
 *
 * Every /api/v1/* route calls `requireApiKey(request)` as its first line.
 * On success returns { orgId, keyId, plan } and updates lastUsedAt async.
 * On failure returns a NextResponse the route should return immediately.
 *
 * The middleware is configured to skip Clerk on /api/v1/* so this is the
 * SOLE gate for those routes.
 */

import { and, eq, isNull } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { hashApiKey, parseAuthorizationHeader } from '@/lib/api-key';
import { getOrgBillingState } from '@/lib/billing';
import { getDb } from '@/libs/DB';
import { apiKeySchema } from '@/models/Schema';

export type ApiKeyContext = {
  orgId: string;
  keyId: string;
  plan: string;
  planStatus: string;
};

export type RequireApiKeyResult =
  | { error: null; ctx: ApiKeyContext }
  | { error: NextResponse; ctx: null };

function fail(status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        docs_url: 'https://docs.nativpost.com/errors',
      },
    },
    { status },
  );
}

/**
 * Extracts client IP from proxied request headers (Vercel + IONOS friendly).
 */
function extractIp(request: NextRequest): string | null {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() ?? null;
  }
  return request.headers.get('x-real-ip') ?? null;
}

/**
 * Authenticate an /api/v1 request via bearer token.
 *
 * Failure modes:
 *   - 401 missing_key      : no Authorization header or malformed prefix
 *   - 401 invalid_key      : key not found or hash mismatch
 *   - 401 revoked_key      : key was revoked
 *   - 401 expired_key      : key past its expires_at
 *   - 402 payment_required : org subscription lapsed
 *   - 403 plan_forbidden   : org plan does not include API access
 */
export async function requireApiKey(request: NextRequest): Promise<RequireApiKeyResult> {
  const plaintext = parseAuthorizationHeader(request.headers.get('authorization'));
  if (!plaintext) {
    return {
      error: fail(401, 'missing_key', 'Missing Authorization header. Send "Authorization: Bearer np_live_..."'),
      ctx: null,
    };
  }

  const hashedKey = hashApiKey(plaintext);
  const db = await getDb();
  const [row] = await db
    .select()
    .from(apiKeySchema)
    .where(and(eq(apiKeySchema.hashedKey, hashedKey), isNull(apiKeySchema.revokedAt)))
    .limit(1);

  if (!row) {
    return { error: fail(401, 'invalid_key', 'Invalid API key.'), ctx: null };
  }

  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    return { error: fail(401, 'expired_key', 'This API key has expired.'), ctx: null };
  }

  // Check the org's plan still includes API access. This handles downgrades:
  // a Pro→Starter downgrade should immediately deactivate the key at the edge
  // without needing a background sweeper.
  const billing = await getOrgBillingState(row.orgId);
  if (!billing) {
    return { error: fail(401, 'invalid_key', 'Organization not found.'), ctx: null };
  }
  if (!billing.isActive) {
    return {
      error: fail(402, 'payment_required', 'Organization subscription is inactive.'),
      ctx: null,
    };
  }
  if (!billing.features.apiAccess) {
    return {
      error: fail(403, 'plan_forbidden', 'Your current plan does not include API access. Upgrade to Pro or higher.'),
      ctx: null,
    };
  }

  // Fire-and-forget lastUsed update — never blocks the request.
  const ip = extractIp(request);
  db.update(apiKeySchema)
    .set({ lastUsedAt: new Date(), lastUsedIp: ip })
    .where(eq(apiKeySchema.id, row.id))
    .catch((err: unknown) => {
      console.error('[requireApiKey] lastUsedAt update failed', err);
    });

  return {
    error: null,
    ctx: {
      orgId: row.orgId,
      keyId: row.id,
      plan: billing.plan,
      planStatus: billing.planStatus,
    },
  };
}
