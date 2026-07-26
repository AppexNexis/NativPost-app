import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { recordSpend } from '@/lib/msi/managed-ads-service';

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/admin/msi/ad-campaigns/[id]/spend  { spendCents }
// An operator records ad spend for a campaign; bills the management fee.
// Staff-gated (/api/admin).
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { error } = await getAuthContext();
  if (error) {
    return error;
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const spendCents = Number(body.spendCents);
  if (!Number.isInteger(spendCents) || spendCents <= 0) {
    return NextResponse.json({ error: 'spendCents must be a positive integer' }, { status: 400 });
  }
  const result = await recordSpend(id, spendCents);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result, { status: 200 });
}
