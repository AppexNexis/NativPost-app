import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { buildActivityEvent } from '@/lib/msi/audit';
import { transitionAccount } from '@/lib/msi/lifecycle';
import { parseReviewRequest } from '@/lib/msi/review-request';
import {
  GuardFailedError,
  InvalidTransitionError,
} from '@/lib/msi/state-machine';
import {
  managedAccountSchema,
  msiAccountReviewSchema,
  msiActivityLogSchema,
} from '@/models/Schema';

type RouteParams = { params: Promise<{ id: string }> };

const REVIEW_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

// -----------------------------------------------------------
// POST /api/msi/accounts/[id]/review
// The customer's review response (docs §5, §13). Bookkeeping only:
// it flips lifecycle_state via the (validated) state machine and
// records a review + audit row. It calls NO platform, charges
// nothing, and provisions nothing — go-live EXECUTION is unbuilt
// and Phase-0-gated.
// -----------------------------------------------------------
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { error, orgId, userId } = await getAuthContext();
  if (error) {
    return error;
  }
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = parseReviewRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const db = await getDb();
  const [account] = await db
    .select({
      id: managedAccountSchema.id,
      lifecycleState: managedAccountSchema.lifecycleState,
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
  if (account.lifecycleState !== 'customer_review') {
    return NextResponse.json(
      { error: 'This account is not awaiting your review.' },
      { status: 409 },
    );
  }

  const now = new Date();
  try {
    if (parsed.value.action === 'approve') {
      const next = transitionAccount('customer_review', 'live', {
        customerApproved: true,
      });
      await db
        .update(managedAccountSchema)
        .set({ lifecycleState: next, liveAt: now })
        .where(eq(managedAccountSchema.id, id));
      await db.insert(msiAccountReviewSchema).values({
        managedAccountId: id,
        windowOpensAt: now,
        windowClosesAt: now,
        status: 'approved',
        respondedAt: now,
        respondedByUserId: userId!,
      });
      await db.insert(msiActivityLogSchema).values(
        buildActivityEvent({
          managedAccountId: id,
          actorType: 'customer',
          actorId: userId,
          action: 'customer_approved',
        }),
      );
      return NextResponse.json({ state: next }, { status: 200 });
    }

    // request_changes — changes already normalized by parseReviewRequest.
    const changes = parsed.value.changes;
    const next = transitionAccount('customer_review', 'revisions');
    await db
      .update(managedAccountSchema)
      .set({ lifecycleState: next })
      .where(eq(managedAccountSchema.id, id));
    await db.insert(msiAccountReviewSchema).values({
      managedAccountId: id,
      windowOpensAt: now,
      windowClosesAt: new Date(now.getTime() + REVIEW_WINDOW_MS),
      status: 'changes_requested',
      requestedChanges: changes,
      respondedAt: now,
      respondedByUserId: userId!,
    });
    await db.insert(msiActivityLogSchema).values(
      buildActivityEvent({
        managedAccountId: id,
        actorType: 'customer',
        actorId: userId,
        action: 'changes_requested',
        detail: { count: changes.length },
      }),
    );
    return NextResponse.json({ state: next }, { status: 200 });
  } catch (err) {
    if (
      err instanceof GuardFailedError
      || err instanceof InvalidTransitionError
    ) {
      return NextResponse.json(
        { error: 'That action is not allowed right now.' },
        { status: 409 },
      );
    }
    console.error('Review action failed:', err);
    return NextResponse.json(
      { error: 'Failed to record your response' },
      { status: 500 },
    );
  }
}
