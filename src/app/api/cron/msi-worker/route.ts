import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { runWorkerTick } from '@/lib/msi/worker-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * MSI provisioning worker tick (docs §14, §3.3): time-based bookkeeping +
 * execution orchestration (start assigned jobs through the Execution Layer
 * adapter). Wire to a schedule in vercel.json; trigger with
 * `Authorization: Bearer $CRON_SECRET`.
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const plan = await runWorkerTick();
    return NextResponse.json({ ok: true, plan }, { status: 200 });
  } catch (err) {
    console.error('MSI worker tick failed:', err);
    return NextResponse.json({ error: 'Worker tick failed' }, { status: 500 });
  }
}
