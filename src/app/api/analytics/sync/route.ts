import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';

// -----------------------------------------------------------
// POST /api/analytics/sync
//
// UI-facing endpoint for the "Sync now" button on the analytics page.
// Authenticated via Clerk — no CRON_SECRET needed on the client.
// Internally calls the cron route using the server-side secret.
//
// Only team members (admin/editor) should be able to trigger this —
// enforced at the UI level via role checks in the page component.
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const { error } = await getAuthContext();
  if (error) {
    return error;
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  try {
    // Call the cron route internally using the server-side secret
    const origin = new URL(request.url).origin;
    const res = await fetch(`${origin}/api/cron/sync-analytics`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[Analytics Sync Trigger] Cron call failed:', err);
      return NextResponse.json({ error: 'Sync failed' }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[Analytics Sync Trigger] Error:', err);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
