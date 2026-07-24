import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { storeAccountCredentials } from '@/lib/msi/credentials-service';

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
