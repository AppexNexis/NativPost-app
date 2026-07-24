import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { createAuthorizationGrant } from '@/lib/msi/grant-service';
import { parseOrderRequest } from '@/lib/msi/order-request';
import { brandProfileSchema, msiProvisioningOrderSchema } from '@/models/Schema';

// -----------------------------------------------------------
// POST /api/msi/orders
// Save a DRAFT managed-account order + record the customer's
// Authorization Grant (docs §4.1). Deliberately does NOT charge or
// provision — the order is created 'pending'. Fulfilment waits for
// Phase 0 (platform review) + Phase 6 (billing).
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const { error, orgId, userId } = await getAuthContext();
  if (error) {
    return error;
  }

  const body = await request.json().catch(() => null);
  const parsed = parseOrderRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { brandProfileId, country, platform, niche, handlePreferences, quantity }
    = parsed.value;

  const db = await getDb();

  // The brand must belong to the caller's org.
  const [brand] = await db
    .select({ id: brandProfileSchema.id })
    .from(brandProfileSchema)
    .where(
      and(
        eq(brandProfileSchema.id, brandProfileId),
        eq(brandProfileSchema.orgId, orgId!),
      ),
    )
    .limit(1);
  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  }

  try {
    // Record the signed authorization (the compliance prerequisite).
    const grant = await createAuthorizationGrant({
      orgId: orgId!,
      brandProfileId,
      grantVersion: 'msi-grant-v1',
      signedByUserId: userId!,
      scope: { platforms: [platform], countries: [country] },
    });

    const [order] = await db
      .insert(msiProvisioningOrderSchema)
      .values({
        orgId: orgId!,
        quantity,
        status: 'pending', // no payment, no provisioning
        configSnapshot: {
          country,
          platform,
          niche,
          handlePreferences,
          grantId: grant.id,
        },
      })
      .returning({
        id: msiProvisioningOrderSchema.id,
        status: msiProvisioningOrderSchema.status,
      });

    return NextResponse.json({ order, grantId: grant.id }, { status: 201 });
  } catch (err) {
    console.error('Failed to save draft order:', err);
    return NextResponse.json(
      { error: 'Failed to save configuration' },
      { status: 500 },
    );
  }
}
