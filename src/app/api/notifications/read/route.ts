/**
 * POST /api/notifications/read
 * Body: { id?: string } — omit id to mark ALL as read
 */

import { and, eq, isNull, or } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { notificationSchema } from '@/models/Schema';

export async function POST(request: NextRequest) {
  const { error, orgId, userId } = await getAuthContext();
  if (error) return error;

  try {
    const body = await request.json() as { id?: string };
    const db = await getDb();
    const now = new Date();

    if (body.id) {
      // Mark one notification as read
      await db
        .update(notificationSchema)
        .set({ isRead: true, readAt: now })
        .where(
          and(
            eq(notificationSchema.id, body.id),
            eq(notificationSchema.orgId, orgId!),
            or(
              isNull(notificationSchema.userId),
              eq(notificationSchema.userId, userId!),
            ),
          ),
        );
    } else {
      // Mark all as read for this org/user
      await db
        .update(notificationSchema)
        .set({ isRead: true, readAt: now })
        .where(
          and(
            eq(notificationSchema.orgId, orgId!),
            eq(notificationSchema.isRead, false),
            or(
              isNull(notificationSchema.userId),
              eq(notificationSchema.userId, userId!),
            ),
          ),
        );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[notifications/read] POST failed:', err);
    return NextResponse.json({ error: 'Failed to mark notifications read' }, { status: 500 });
  }
}
