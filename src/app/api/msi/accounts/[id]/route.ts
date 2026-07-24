import { and, asc, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { managedAccountSchema, msiActivityLogSchema } from '@/models/Schema';

type RouteParams = {
  params: Promise<{ id: string }>;
};

// -----------------------------------------------------------
// GET /api/msi/accounts/[id]
// One managed account (org-scoped) + its append-only activity
// timeline (docs §13.2). Read-only. 404 if not owned by the org.
// -----------------------------------------------------------
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }
  const { id } = await params;

  const db = await getDb();
  try {
    const [account] = await db
      .select({
        id: managedAccountSchema.id,
        platform: managedAccountSchema.platform,
        country: managedAccountSchema.country,
        niche: managedAccountSchema.niche,
        displayName: managedAccountSchema.displayName,
        handlePreferences: managedAccountSchema.handlePreferences,
        lifecycleState: managedAccountSchema.lifecycleState,
        credentialCustody: managedAccountSchema.credentialCustody,
        healthScore: managedAccountSchema.healthScore,
        liveAt: managedAccountSchema.liveAt,
        createdAt: managedAccountSchema.createdAt,
        updatedAt: managedAccountSchema.updatedAt,
      })
      .from(managedAccountSchema)
      .where(
        and(
          eq(managedAccountSchema.id, id),
          eq(managedAccountSchema.orgId, orgId!),
        ),
      )
      .limit(1);

    if (!account) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const timeline = await db
      .select({
        id: msiActivityLogSchema.id,
        actorType: msiActivityLogSchema.actorType,
        action: msiActivityLogSchema.action,
        detail: msiActivityLogSchema.detail,
        occurredAt: msiActivityLogSchema.occurredAt,
      })
      .from(msiActivityLogSchema)
      .where(eq(msiActivityLogSchema.managedAccountId, id))
      .orderBy(asc(msiActivityLogSchema.occurredAt));

    return NextResponse.json({ account, timeline }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch managed account:', err);
    return NextResponse.json(
      { error: 'Failed to fetch managed account' },
      { status: 500 },
    );
  }
}
