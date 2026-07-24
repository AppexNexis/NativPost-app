import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { fulfillOrder } from '@/lib/msi/provisioning';

type RouteParams = { params: Promise<{ orderId: string }> };

// POST /api/admin/msi/orders/[orderId]/fulfill
// Staff/webhook-triggered fulfilment: order → managed account(s) + provisioning
// jobs. Staff-gated by middleware (/api/admin). Cross-org.
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { error } = await getAuthContext();
  if (error) {
    return error;
  }
  const { orderId } = await params;

  try {
    const created = await fulfillOrder(orderId);
    return NextResponse.json({ ok: true, created }, { status: 200 });
  } catch (err) {
    console.error('MSI order fulfilment failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Fulfilment failed' },
      { status: 400 },
    );
  }
}
