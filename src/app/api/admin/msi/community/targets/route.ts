import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { listCommunityTargets } from '@/lib/msi/addon-ops-service';

// GET /api/admin/msi/community/targets — accounts with Managed Community active,
// where operators log handled replies. Staff-gated (/api/admin).
export async function GET() {
  const { error } = await getAuthContext();
  if (error) {
    return error;
  }
  try {
    const targets = await listCommunityTargets();
    return NextResponse.json({ targets }, { status: 200 });
  } catch (err) {
    console.error('Failed to list community targets:', err);
    return NextResponse.json({ error: 'Failed to list targets' }, { status: 500 });
  }
}
