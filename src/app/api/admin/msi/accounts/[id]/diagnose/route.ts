import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { runAccountDiagnostics } from '@/lib/msi/diagnostics-service';

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/admin/msi/accounts/[id]/diagnose
// Run the account's diagnostics (DB/vault checks + a live platform probe).
// Staff-gated by middleware. Read-only.
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { error } = await getAuthContext();
  if (error) {
    return error;
  }
  const { id } = await params;

  try {
    const report = await runAccountDiagnostics(id);
    if (!report) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }
    return NextResponse.json(report, { status: 200 });
  } catch (err) {
    console.error('MSI diagnostics failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Diagnostics failed' },
      { status: 500 },
    );
  }
}
