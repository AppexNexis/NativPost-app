import { and, count, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getOrgBillingState } from '@/lib/billing';
// import { db } from '@/libs/DB';
import { getDb } from '@/libs/DB';
import { publishingQueueSchema, socialAccountSchema } from '@/models/Schema';

// -----------------------------------------------------------
// GET /api/social-accounts
// List connected social accounts for the current org
// -----------------------------------------------------------
export async function GET() {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  try {
    // In GET /api/social-accounts
    const accounts = await db
      .select({
        id: socialAccountSchema.id,
        platform: socialAccountSchema.platform,
        platformUsername: socialAccountSchema.platformUsername,
        accountType: socialAccountSchema.accountType,
        profileImageUrl: socialAccountSchema.profileImageUrl,
        isActive: socialAccountSchema.isActive,
        connectedAt: socialAccountSchema.connectedAt,
        oauthToken: socialAccountSchema.oauthToken,  // ← add this
      })
      .from(socialAccountSchema)
      .where(eq(socialAccountSchema.orgId, orgId!));

    return NextResponse.json({ accounts }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch social accounts:', err);
    return NextResponse.json(
      { error: 'Failed to fetch social accounts' },
      { status: 500 },
    );
  }
}

// -----------------------------------------------------------
// POST /api/social-accounts
// Register a new social account after OAuth callback
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  try {
    const body = await request.json();

    // --- Platform limit enforcement ---
    const billing = await getOrgBillingState(orgId!);
    if (!billing || !billing.isActive) {
      return NextResponse.json(
        { error: 'Your subscription has expired. Please subscribe to connect social accounts.' },
        { status: 403 },
      );
    }

    const { platformsLimit } = billing.features;
    if (platformsLimit !== -1) {
      const [currentCount] = await db
        .select({ count: count() })
        .from(socialAccountSchema)
        .where(and(eq(socialAccountSchema.orgId, orgId!), eq(socialAccountSchema.isActive, true)));

      const connectedCount = currentCount?.count ?? 0;
      if (connectedCount >= platformsLimit) {
        return NextResponse.json(
          {
            error: `Your plan supports up to ${platformsLimit} connected platform${platformsLimit === 1 ? '' : 's'}. Disconnect an existing account or upgrade to connect more.`,
          },
          { status: 403 },
        );
      }
    }

    const [created] = await db
      .insert(socialAccountSchema)
      .values({
        orgId: orgId!,
        platform: String(body.platform),
        platformUserId: body.platformUserId || null,
        platformUsername: body.platformUsername || null,
        accessToken: body.accessToken || null,
        refreshToken: body.refreshToken || null,
        tokenExpiresAt: body.tokenExpiresAt ? new Date(body.tokenExpiresAt) : null,
        accountType: body.accountType || 'page',
        profileImageUrl: body.profileImageUrl || null,
        isActive: true,
      })
      .returning({
        id: socialAccountSchema.id,
        platform: socialAccountSchema.platform,
        platformUsername: socialAccountSchema.platformUsername,
        isActive: socialAccountSchema.isActive,
        connectedAt: socialAccountSchema.connectedAt,
      });

    return NextResponse.json({ account: created }, { status: 201 });
  } catch (err) {
    console.error('Failed to create social account:', err);
    return NextResponse.json(
      { error: 'Failed to create social account' },
      { status: 500 },
    );
  }
}

// -----------------------------------------------------------
// DELETE /api/social-accounts?id=xxx
// Disconnect a social account
// -----------------------------------------------------------
export async function DELETE(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing account id' }, { status: 400 });
  }

  try {
    // Verify the account belongs to this org before deleting
    const [account] = await db
      .select({ id: socialAccountSchema.id })
      .from(socialAccountSchema)
      .where(
        and(
          eq(socialAccountSchema.id, id),
          eq(socialAccountSchema.orgId, orgId!),
        ),
      )
      .limit(1);

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Delete publishing queue rows referencing this account first (FK constraint)
    await db
      .delete(publishingQueueSchema)
      .where(eq(publishingQueueSchema.socialAccountId, id));

    // Now safe to delete the social account
    await db
      .delete(socialAccountSchema)
      .where(eq(socialAccountSchema.id, id));

    return NextResponse.json({ deleted: true }, { status: 200 });
  } catch (err) {
    console.error('Failed to delete social account:', err);
    return NextResponse.json(
      { error: 'Failed to delete social account' },
      { status: 500 },
    );
  }
}
