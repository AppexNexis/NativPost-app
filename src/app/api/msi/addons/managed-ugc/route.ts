import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getUgcStatus, requestUgcVideo } from '@/lib/msi/managed-ugc-service';

// GET /api/msi/addons/managed-ugc — { active }.
export async function GET() {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }
  try {
    return NextResponse.json(await getUgcStatus(orgId!), { status: 200 });
  } catch (err) {
    console.error('Failed to fetch Managed UGC status:', err);
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
  }
}

// POST /api/msi/addons/managed-ugc { managedAccountId, topic, notes? }
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
    const result = await requestUgcVideo({ orgId: orgId!, managedAccountId, topic, notes });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error('Failed to create Managed UGC request:', err);
    return NextResponse.json({ error: 'Failed to create request' }, { status: 500 });
  }
}
