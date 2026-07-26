import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getContentStatus, requestContentPiece } from '@/lib/msi/managed-content-service';

// GET /api/msi/addons/managed-content — status: active?, tier, quota, used, remaining.
export async function GET() {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }
  try {
    const status = await getContentStatus(orgId!);
    return NextResponse.json(status, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch Managed Content status:', err);
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
  }
}

// POST /api/msi/addons/managed-content { managedAccountId, topic, notes? }
export async function POST(request: Request) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }
  try {
    const body = await request.json().catch(() => ({}));
    const managedAccountId = typeof body.managedAccountId === 'string' ? body.managedAccountId : '';
    const topic = typeof body.topic === 'string' ? body.topic : '';
    const notes = typeof body.notes === 'string' ? body.notes : undefined;
    if (!managedAccountId || !topic.trim()) {
      return NextResponse.json({ error: 'managedAccountId and topic are required' }, { status: 400 });
    }
    const result = await requestContentPiece({ orgId: orgId!, managedAccountId, topic, notes });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error('Failed to create Managed Content request:', err);
    return NextResponse.json({ error: 'Failed to create request' }, { status: 500 });
  }
}
