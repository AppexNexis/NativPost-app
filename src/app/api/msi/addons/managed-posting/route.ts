import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getPostingStatus, requestManagedPost } from '@/lib/msi/managed-posting-service';

// -----------------------------------------------------------
// GET /api/msi/addons/managed-posting
// This org's Managed Posting status: active?, tier, quota, used, remaining.
// -----------------------------------------------------------
export async function GET() {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }
  try {
    const status = await getPostingStatus(orgId!);
    return NextResponse.json(status, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch Managed Posting status:', err);
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// POST /api/msi/addons/managed-posting
// Create a Managed Posting request (quota-gated).
// body: { managedAccountId: string, topic: string, notes?: string }
// -----------------------------------------------------------
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
      return NextResponse.json(
        { error: 'managedAccountId and topic are required' },
        { status: 400 },
      );
    }

    const result = await requestManagedPost({ orgId: orgId!, managedAccountId, topic, notes });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error('Failed to create Managed Posting request:', err);
    return NextResponse.json({ error: 'Failed to create request' }, { status: 500 });
  }
}
