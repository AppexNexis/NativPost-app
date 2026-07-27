import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { listAllAdCampaigns } from '@/lib/msi/addon-ops-service';

// GET /api/admin/msi/ad-campaigns — all ad campaigns across orgs (operator view).
// Staff-gated (/api/admin).
export async function GET() {
  const { error } = await getAuthContext();
  if (error) {
    return error;
  }
  try {
    const campaigns = await listAllAdCampaigns();
    return NextResponse.json({ campaigns }, { status: 200 });
  } catch (err) {
    console.error('Failed to list ad campaigns:', err);
    return NextResponse.json({ error: 'Failed to list campaigns' }, { status: 500 });
  }
}
