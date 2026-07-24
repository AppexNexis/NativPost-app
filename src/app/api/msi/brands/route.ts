import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { brandProfileSchema } from '@/models/Schema';

// -----------------------------------------------------------
// GET /api/msi/brands
// Minimal brand list for the order/configure flow's brand picker.
// Read-only, org-scoped.
// -----------------------------------------------------------
export async function GET() {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const db = await getDb();
  try {
    const brands = await db
      .select({
        id: brandProfileSchema.id,
        brandName: brandProfileSchema.brandName,
      })
      .from(brandProfileSchema)
      .where(eq(brandProfileSchema.orgId, orgId!));

    return NextResponse.json({ brands }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch brands:', err);
    return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
  }
}
