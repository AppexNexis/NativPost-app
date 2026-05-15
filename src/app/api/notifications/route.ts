/**
 * GET  /api/notifications          — fetch latest 50 notifications for current org/user
 * GET  /api/notifications?countOnly=true — returns { unread: number } only
 * POST /api/notifications/read     — mark one or all notifications as read
 */

import { and, desc, eq, isNull, or } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { notificationSchema } from '@/models/Schema';

// GET /api/notifications
export async function GET(request: NextRequest) {
  const { error, orgId, userId } = await getAuthContext();
  if (error) return error;

  const countOnly = request.nextUrl.searchParams.get('countOnly') === 'true';

  try {
    const db = await getDb();

    if (countOnly) {
      const rows = await db
        .select({ id: notificationSchema.id })
        .from(notificationSchema)
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
      return NextResponse.json({ unread: rows.length });
    }

    // Full list — latest 50, user-specific or org-wide
    const notifications = await db
      .select()
      .from(notificationSchema)
      .where(
        and(
          eq(notificationSchema.orgId, orgId!),
          or(
            isNull(notificationSchema.userId),
            eq(notificationSchema.userId, userId!),
          ),
        ),
      )
      .orderBy(desc(notificationSchema.createdAt))
      .limit(50);

    const unread = notifications.filter(n => !n.isRead).length;

    return NextResponse.json({ notifications, unread });
  } catch (err) {
    console.error('[notifications] GET failed:', err);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}
