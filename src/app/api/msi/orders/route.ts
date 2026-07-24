import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { isSupportedCountry, isSupportedPlatform } from '@/lib/msi/catalog';
import { createAuthorizationGrant } from '@/lib/msi/grant-service';
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
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const {
    brandProfileId,
    country,
    platform,
    niche,
    handlePreferences,
    quantity,
    authorized,
  } = body;

  if (!authorized) {
    return NextResponse.json(
      { error: 'Authorization is required to configure managed accounts' },
      { status: 400 },
    );
  }
  if (!brandProfileId || !country || !platform) {
    return NextResponse.json(
      { error: 'brand, country, and platform are required' },
      { status: 400 },
    );
  }
  if (!isSupportedCountry(country) || !isSupportedPlatform(platform)) {
    return NextResponse.json(
      { error: 'Unsupported country or platform' },
      { status: 400 },
    );
  }
  const qty = Number(quantity ?? 1);
  if (!Number.isInteger(qty) || qty < 1) {
    return NextResponse.json(
      { error: 'quantity must be a positive integer' },
      { status: 400 },
    );
  }

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

    const handles = Array.isArray(handlePreferences)
      ? handlePreferences.filter((h: unknown) => typeof h === 'string')
      : [];

    const [order] = await db
      .insert(msiProvisioningOrderSchema)
      .values({
        orgId: orgId!,
        quantity: qty,
        status: 'pending', // no payment, no provisioning
        configSnapshot: {
          country,
          platform,
          niche: niche ?? null,
          handlePreferences: handles,
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
