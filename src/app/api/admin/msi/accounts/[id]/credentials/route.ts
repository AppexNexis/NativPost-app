import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { db } from '@/lib/db';
import { validateCredentialBlob } from '@/lib/msi/credential-format';
import { storeAccountCredentials } from '@/lib/msi/credentials-service';
import { resolveStrategy } from '@/lib/msi/execution';
import { managedAccountSchema } from '@/models/Schema';

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/admin/msi/accounts/[id]/credentials  { credentials: string }
// An operator seals an account's login into the vault. Staff-gated by
// middleware. The plaintext is encrypted and never stored in Postgres.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { error, userId } = await getAuthContext();
  if (error) {
    return error;
  }
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const credentials = body?.credentials;
  if (typeof credentials !== 'string' || !credentials.trim()) {
    return NextResponse.json({ error: 'credentials are required' }, { status: 400 });
  }

  // For API-operated accounts the blob must be JSON with the platform's fields
  // — validate now so a bad paste fails here, not later at publish time.
  const [account] = await db
    .select({
      platform: managedAccountSchema.platform,
      executionStrategy: managedAccountSchema.executionStrategy,
    })
    .from(managedAccountSchema)
    .where(eq(managedAccountSchema.id, id))
    .limit(1);
  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }
  const strategy = resolveStrategy({
    executionStrategy: account.executionStrategy,
    platform: account.platform,
  });
  if (strategy === 'official_api') {
    const check = validateCredentialBlob(account.platform, credentials);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }
  }

  try {
    await storeAccountCredentials(id, credentials, userId!);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('MSI store-credentials failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to store credentials' },
      { status: 400 },
    );
  }
}
