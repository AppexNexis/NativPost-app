import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { releaseAccount } from '@/lib/msi/offboarding-service';

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/admin/msi/accounts/[id]/release
// Staff completes a requested off-board: archive the account, deactivate its
// publish connection, and hand the credentials back (vault). Staff-gated by
// middleware; requires a prior customer request (dual authorization).
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { error, userId } = await getAuthContext();
  if (error) {
    return error;
  }
  const { id } = await params;

  try {
    const result = await releaseAccount(id, userId!);
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Release failed' },
      { status: 400 },
    );
  }
}
