import { and, eq, inArray } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { brandProfileSchema, contentItemSchema } from '@/models/Schema';

const ENGINE_URL = process.env.NATIVPOST_ENGINE_URL || 'http://localhost:8000';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

// Fire-and-forget engine feedback (mirrors src/app/api/content/[id]/route.ts).
async function sendFeedbackToEngine(payload: {
  brand_name: string;
  feedback_type: 'approved' | 'rejected' | 'edited';
  caption?: string;
  reason?: string;
}) {
  try {
    await fetch(`${ENGINE_URL}/api/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ENGINE_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[Feedback] Failed to send signal to engine:', err);
  }
}

type BulkAction =
  | 'approve'
  | 'reject'
  | 'delete'
  | 'archive'
  | 'schedule'
  | 'unschedule'
  | 'set_status';

const VALID_ACTIONS: BulkAction[] = [
  'approve',
  'reject',
  'delete',
  'archive',
  'schedule',
  'unschedule',
  'set_status',
];

const VALID_STATUSES = new Set([
  'draft',
  'pending_review',
  'approved',
  'skipped',
  'scheduled',
  'published',
  'rejected',
  'archived',
]);

// -----------------------------------------------------------
// POST /api/content/bulk
// Body: {
//   action: 'approve' | 'reject' | 'delete' | 'archive' | 'schedule'
//         | 'unschedule' | 'set_status',
//   ids: string[],
//   payload?: {
//     status?: string,           // required for set_status
//     scheduledFor?: string,     // ISO — required for schedule
//     rejectionFeedback?: string,
//   },
// }
// Returns { updated: N } or { deleted: N }.
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  let body: {
    action?: string;
    ids?: unknown;
    payload?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = body.action as BulkAction | undefined;
  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `action must be one of ${VALID_ACTIONS.join(', ')}` },
      { status: 400 },
    );
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((v): v is string => typeof v === 'string' && v.length > 0)
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids must be a non-empty array of strings' }, { status: 400 });
  }
  if (ids.length > 500) {
    return NextResponse.json({ error: 'Bulk operations capped at 500 items per call' }, { status: 400 });
  }

  const payload = (body.payload ?? {}) as Record<string, unknown>;

  try {
    // Confirm every id belongs to the caller's org — orgId scoping AND the
    // id list are both baked into the WHERE clause, so we never touch a
    // row outside the org even if a rogue client sends foreign ids.
    const orgFilter = and(
      eq(contentItemSchema.orgId, orgId!),
      inArray(contentItemSchema.id, ids),
    );

    if (action === 'delete') {
      const deleted = await db
        .delete(contentItemSchema)
        .where(orgFilter)
        .returning({ id: contentItemSchema.id });
      return NextResponse.json({ deleted: deleted.length }, { status: 200 });
    }

    // Compute update patch by action.
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    switch (action) {
      case 'approve':
        updates.status = 'approved';
        break;
      case 'reject':
        updates.status = 'rejected';
        if (typeof payload.rejectionFeedback === 'string') {
          updates.rejectionFeedback = payload.rejectionFeedback;
        }
        break;
      case 'archive':
        updates.status = 'archived';
        break;
      case 'unschedule':
        updates.scheduledFor = null;
        updates.status = 'approved';
        break;
      case 'schedule': {
        const raw = payload.scheduledFor;
        if (!raw || (typeof raw !== 'string' && !(raw instanceof Date))) {
          return NextResponse.json(
            { error: 'schedule action requires payload.scheduledFor (ISO string)' },
            { status: 400 },
          );
        }
        const when = new Date(raw as string);
        if (Number.isNaN(when.getTime())) {
          return NextResponse.json({ error: 'scheduledFor is not a valid date' }, { status: 400 });
        }
        updates.scheduledFor = when;
        updates.status = 'scheduled';
        break;
      }
      case 'set_status': {
        const s = payload.status;
        if (typeof s !== 'string' || !VALID_STATUSES.has(s)) {
          return NextResponse.json(
            { error: `set_status requires payload.status in ${[...VALID_STATUSES].join(', ')}` },
            { status: 400 },
          );
        }
        updates.status = s;
        break;
      }
    }

    const updated = await db
      .update(contentItemSchema)
      .set(updates)
      .where(orgFilter)
      .returning({ id: contentItemSchema.id, caption: contentItemSchema.caption });

    // Best-effort engine feedback — never blocks the response.
    if (action === 'approve' || action === 'reject') {
      (async () => {
        try {
          const [profile] = await db
            .select({ brandName: brandProfileSchema.brandName })
            .from(brandProfileSchema)
            .where(eq(brandProfileSchema.orgId, orgId!))
            .limit(1);
          const brandName = profile?.brandName || 'unknown';
          const reason = action === 'reject' && typeof payload.rejectionFeedback === 'string'
            ? payload.rejectionFeedback
            : undefined;
          for (const row of updated) {
            if (action === 'approve') {
              sendFeedbackToEngine({
                brand_name: brandName,
                feedback_type: 'approved',
                caption: row.caption ?? undefined,
              });
            } else {
              sendFeedbackToEngine({
                brand_name: brandName,
                feedback_type: 'rejected',
                reason,
              });
            }
          }
        } catch (feedbackErr) {
          console.error('[BulkContent] engine feedback fanout failed:', feedbackErr);
        }
      })();
    }

    return NextResponse.json({ updated: updated.length }, { status: 200 });
  } catch (err) {
    console.error('Bulk content operation failed:', err);
    return NextResponse.json({ error: 'Bulk operation failed' }, { status: 500 });
  }
}
