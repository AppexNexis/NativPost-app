import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { reviewJob } from '@/lib/msi/operations-service';

type RouteParams = { params: Promise<{ jobId: string }> };

// POST /api/admin/msi/jobs/[jobId]/review  { action: 'approve' | 'reject' }
// Reviewer/QA advances a job through the internal review gates. A completed
// provisioning job opens the customer review. Staff-gated by middleware.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { error, userId } = await getAuthContext();
  if (error) {
    return error;
  }
  const { jobId } = await params;

  const body = await request.json().catch(() => null);
  const action = body?.action;
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json(
      { error: 'action must be "approve" or "reject"' },
      { status: 400 },
    );
  }

  try {
    const result = await reviewJob(jobId, action, userId!);
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (err) {
    console.error('MSI job review failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Review failed' },
      { status: 400 },
    );
  }
}
