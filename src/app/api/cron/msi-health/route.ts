import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { runHealthTick } from '@/lib/msi/health-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * MSI health-score refresh (docs §11.3): pull latest per-account metrics from
 * each platform's registered stats provider and persist the composite score.
 * Accounts on platforms without a registered provider are skipped. Wire to a
 * schedule in vercel.json; trigger with `Authorization: Bearer $CRON_SECRET`.
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
    const result = await runHealthTick();
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (err) {
    console.error('MSI health tick failed:', err);
    return NextResponse.json({ error: 'Health tick failed' }, { status: 500 });
  }
}
