import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { logReplies } from '@/lib/msi/managed-community-service';

// POST /api/admin/msi/community/log  { orgId, managedAccountId, count, note? }
// An operator logs handled replies against an org's Managed Community quota.
// Staff-gated (/api/admin).
export async function POST(request: NextRequest) {
  const { error } = await getAuthContext();
  if (error) {
    return error;
  }
  const body = await request.json().catch(() => ({}));
  const orgId = typeof body.orgId === 'string' ? body.orgId : '';
  const managedAccountId = typeof body.managedAccountId === 'string' ? body.managedAccountId : '';
  const count = Number(body.count);
  const note = typeof body.note === 'string' ? body.note : undefined;

  if (!orgId || !managedAccountId) {
    return NextResponse.json({ error: 'orgId and managedAccountId are required' }, { status: 400 });
  }

  const result = await logReplies({ orgId, managedAccountId, count, note });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, logged: result.logged }, { status: 200 });
}
