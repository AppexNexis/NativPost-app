import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getUserWorkspaceUsage } from '@/lib/clerk-org-helpers';

export const dynamic = 'force-dynamic';

// -----------------------------------------------------------
// GET /api/workspaces/usage
// How many workspaces (Clerk orgs) the current user owns vs. the
// limit granted by their governing plan.
// -----------------------------------------------------------
export async function GET() {
  const { error, userId } = await getAuthContext();
  if (error) return error;

  try {
    const { count, limit } = await getUserWorkspaceUsage(userId!);
    return NextResponse.json({ count, limit }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch workspace usage:', err);
    return NextResponse.json({ error: 'Failed to fetch workspace usage' }, { status: 500 });
  }
}
