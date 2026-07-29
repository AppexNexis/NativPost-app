import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { listReportsForReview } from '@/lib/msi/addon-ops-service';

// GET /api/admin/msi/analytics-reports — reports awaiting delivery (in_review).
// Staff-gated (/api/admin).
export async function GET() {
  const { error } = await getAuthContext();
  if (error) {
    return error;
  }
  try {
    const reports = await listReportsForReview();
    return NextResponse.json({ reports }, { status: 200 });
  } catch (err) {
    console.error('Failed to list analytics reports:', err);
    return NextResponse.json({ error: 'Failed to list reports' }, { status: 500 });
  }
}
