import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getCommunityStatus } from '@/lib/msi/managed-community-service';

// GET /api/msi/addons/managed-community — status: active?, tier, quota, used, remaining.
export async function GET() {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }
  try {
    const status = await getCommunityStatus(orgId!);
    return NextResponse.json(status, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch Managed Community status:', err);
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
  }
}
