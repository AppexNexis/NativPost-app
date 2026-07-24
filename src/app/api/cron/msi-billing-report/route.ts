import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { runBillingReportTick } from '@/lib/msi/billing-reporter-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * MSI metered-billing reporter (docs §6): ships un-reported billable publish
 * events to the billing provider and stamps them. A deliberate no-op while
 * MSI_METERED_BILLING_ENABLED is off (returns skipped=true). Wire to a schedule
 * via GitHub Actions; trigger with `Authorization: Bearer $CRON_SECRET`.
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
    const result = await runBillingReportTick();
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (err) {
    console.error('MSI billing report tick failed:', err);
    return NextResponse.json({ error: 'Billing report failed' }, { status: 500 });
  }
}
