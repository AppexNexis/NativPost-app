import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getOrgBillingState, getOrgStorageBytes } from '@/lib/billing';

export const dynamic = 'force-dynamic';

// -----------------------------------------------------------
// GET /api/media-assets/usage
// Media storage used vs. plan limit for the current org.
// -----------------------------------------------------------
export async function GET() {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  try {
    const [usedBytes, billing] = await Promise.all([
      getOrgStorageBytes(orgId!),
      getOrgBillingState(orgId!),
    ]);

    return NextResponse.json(
      {
        usedBytes,
        limitBytes: billing?.features.mediaStorageBytes ?? 0,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('Failed to fetch storage usage:', err);
    return NextResponse.json({ error: 'Failed to fetch storage usage' }, { status: 500 });
  }
}
