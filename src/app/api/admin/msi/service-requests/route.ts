import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { listServiceRequests } from '@/lib/msi/addon-ops-service';

// GET /api/admin/msi/service-requests — orgs that requested a quote-priced
// add-on (Influencer / Localization / Recovery). Staff-gated (/api/admin).
export async function GET() {
  const { error } = await getAuthContext();
  if (error) {
    return error;
  }
  try {
    const requests = await listServiceRequests();
    return NextResponse.json({ requests }, { status: 200 });
  } catch (err) {
    console.error('Failed to list service requests:', err);
    return NextResponse.json({ error: 'Failed to list requests' }, { status: 500 });
  }
}
