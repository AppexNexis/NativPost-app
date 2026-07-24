import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { managedAccountSchema } from '@/models/Schema';

// -----------------------------------------------------------
// GET /api/msi/accounts
// List the org's managed accounts for the Infrastructure surface
// (docs §13). Read-only. No credentials live on this table.
// -----------------------------------------------------------
export async function GET() {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const db = await getDb();
  try {
    const accounts = await db
      .select({
        id: managedAccountSchema.id,
        platform: managedAccountSchema.platform,
        country: managedAccountSchema.country,
        niche: managedAccountSchema.niche,
        displayName: managedAccountSchema.displayName,
        handlePreferences: managedAccountSchema.handlePreferences,
        lifecycleState: managedAccountSchema.lifecycleState,
        healthScore: managedAccountSchema.healthScore,
        liveAt: managedAccountSchema.liveAt,
        createdAt: managedAccountSchema.createdAt,
        updatedAt: managedAccountSchema.updatedAt,
      })
      .from(managedAccountSchema)
      .where(eq(managedAccountSchema.orgId, orgId!))
      .orderBy(desc(managedAccountSchema.createdAt));

    return NextResponse.json({ accounts }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch managed accounts:', err);
    return NextResponse.json(
      { error: 'Failed to fetch managed accounts' },
      { status: 500 },
    );
  }
}
