/**
 * GET  /api/settings/user   — return user settings
 * PATCH /api/settings/user  — upsert user settings
 */

import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { userSettingsSchema } from '@/models/Schema';

export async function GET(_request: NextRequest) {
  const { error, orgId, userId } = await getAuthContext();
  if (error) return error;

  try {
    const db = await getDb();
    const [prefs] = await db
      .select()
      .from(userSettingsSchema)
      .where(
        and(
          eq(userSettingsSchema.userId, userId!),
          eq(userSettingsSchema.orgId, orgId!),
        ),
      )
      .limit(1);

    return NextResponse.json({
      theme: prefs?.theme ?? 'system',
      notifyPublish: prefs?.notifyPublish ?? true,
      notifyFailure: prefs?.notifyFailure ?? true,
      notifyApproval: prefs?.notifyApproval ?? true,
      notifyBilling: prefs?.notifyBilling ?? true,
      sidebarDensity: prefs?.sidebarDensity ?? 'comfortable',
    });
  } catch (err) {
    console.error('[settings/user] GET failed:', err);
    return NextResponse.json({ error: 'Failed to load user settings' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const { error, orgId, userId } = await getAuthContext();
  if (error) return error;

  try {
    const body = await request.json() as Record<string, unknown>;

    const db = await getDb();

    // Upsert — create if not exists, update if exists
    await db
      .insert(userSettingsSchema)
      .values({
        userId: userId!,
        orgId: orgId!,
        theme: (body.theme as string) ?? 'system',
        notifyPublish: (body.notifyPublish as boolean) ?? true,
        notifyFailure: (body.notifyFailure as boolean) ?? true,
        notifyApproval: (body.notifyApproval as boolean) ?? true,
        notifyBilling: (body.notifyBilling as boolean) ?? true,
        sidebarDensity: (body.sidebarDensity as string) ?? 'comfortable',
      })
      .onConflictDoUpdate({
        target: [userSettingsSchema.userId, userSettingsSchema.orgId],
        set: {
          ...(body.theme !== undefined && { theme: body.theme as string }),
          ...(body.notifyPublish !== undefined && { notifyPublish: body.notifyPublish as boolean }),
          ...(body.notifyFailure !== undefined && { notifyFailure: body.notifyFailure as boolean }),
          ...(body.notifyApproval !== undefined && { notifyApproval: body.notifyApproval as boolean }),
          ...(body.notifyBilling !== undefined && { notifyBilling: body.notifyBilling as boolean }),
          ...(body.sidebarDensity !== undefined && { sidebarDensity: body.sidebarDensity as string }),
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[settings/user] PATCH failed:', err);
    return NextResponse.json({ error: 'Failed to save user settings' }, { status: 500 });
  }
}
