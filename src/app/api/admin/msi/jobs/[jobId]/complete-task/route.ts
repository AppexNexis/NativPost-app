import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { completeTask } from '@/lib/msi/operations-service';

type RouteParams = { params: Promise<{ jobId: string }> };

// POST /api/admin/msi/jobs/[jobId]/complete-task  { taskId }
// An operator marks a task done; the last one submits the job for review.
// Staff-gated by middleware (/api/admin).
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { error, userId } = await getAuthContext();
  if (error) {
    return error;
  }
  const { jobId } = await params;

  const body = await request.json().catch(() => null);
  const taskId = body?.taskId;
  if (typeof taskId !== 'string' || !taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
  }

  try {
    const result = await completeTask(jobId, taskId, userId!);
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (err) {
    console.error('MSI complete-task failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to complete task' },
      { status: 400 },
    );
  }
}
