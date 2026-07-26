import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { deliverReport } from '@/lib/msi/managed-analytics-service';

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/admin/msi/analytics-reports/[id]/deliver
// An operator delivers an in-review report to the customer. Staff-gated (/api/admin).
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { error } = await getAuthContext();
  if (error) {
    return error;
  }
  const { id } = await params;
  const result = await deliverReport(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
