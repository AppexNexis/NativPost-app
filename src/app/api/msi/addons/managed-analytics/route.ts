import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getReports, requestReport } from '@/lib/msi/managed-analytics-service';

// -----------------------------------------------------------
// GET /api/msi/addons/managed-analytics
// The org's analytics reports (delivered + in progress), newest first.
// -----------------------------------------------------------
export async function GET() {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }
  try {
    const reports = await getReports(orgId!);
    return NextResponse.json({ reports }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch analytics reports:', err);
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// POST /api/msi/addons/managed-analytics  { managedAccountId }
// Generate this month's report for an account (idempotent per account/month).
// -----------------------------------------------------------
export async function POST(request: Request) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }
  try {
    const body = await request.json().catch(() => ({}));
    const managedAccountId = typeof body.managedAccountId === 'string' ? body.managedAccountId : '';
    if (!managedAccountId) {
      return NextResponse.json({ error: 'managedAccountId is required' }, { status: 400 });
    }
    const result = await requestReport({ orgId: orgId!, managedAccountId });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result, { status: result.existed ? 200 : 201 });
  } catch (err) {
    console.error('Failed to generate analytics report:', err);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
