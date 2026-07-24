import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { requestOffboard } from '@/lib/msi/offboarding-service';

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/msi/accounts/[id]/offboard
// Customer requests their managed account's credentials back / to stop the
// service. Org-scoped. Staff completes it via .../release.
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { error, orgId, userId } = await getAuthContext();
  if (error) {
    return error;
  }
  const { id } = await params;

  try {
    const result = await requestOffboard(id, orgId!, userId!);
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Off-board request failed' },
      { status: 400 },
    );
  }
}
