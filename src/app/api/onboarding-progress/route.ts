import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { onboardingProgressSchema } from '@/models/Schema';

// -----------------------------------------------------------
// GET /api/onboarding-progress?step=post_signup
//
// Used as a re-entry guard: if the named step is already marked
// completed for this org, the onboarding wizard should not run again.
// Without a step query param, returns every recorded step for the org.
// -----------------------------------------------------------
export async function GET(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const step = request.nextUrl.searchParams.get('step');

  try {
    const conditions = [eq(onboardingProgressSchema.orgId, orgId!)];
    if (step) {
      conditions.push(eq(onboardingProgressSchema.step, step));
    }

    const rows = await db
      .select()
      .from(onboardingProgressSchema)
      .where(and(...conditions));

    return NextResponse.json({ steps: rows }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch onboarding progress:', err);
    return NextResponse.json({ error: 'Failed to fetch onboarding progress' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// POST /api/onboarding-progress
// Body: { step: string, data?: object, completed?: boolean }
//
// One row per (org, step). Each call replaces the existing row for that
// step rather than appending — this tracks current state, not a log.
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  try {
    const body = await request.json();
    const step = typeof body.step === 'string' ? body.step.trim() : '';

    if (!step) {
      return NextResponse.json({ error: 'A step name is required' }, { status: 400 });
    }

    const completed = !!body.completed;
    const data = typeof body.data === 'object' && body.data !== null ? body.data : {};

    const [existing] = await db
      .select({ id: onboardingProgressSchema.id })
      .from(onboardingProgressSchema)
      .where(
        and(
          eq(onboardingProgressSchema.orgId, orgId!),
          eq(onboardingProgressSchema.step, step),
        ),
      )
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(onboardingProgressSchema)
        .set({
          completed,
          data,
          completedAt: completed ? new Date() : null,
        })
        .where(eq(onboardingProgressSchema.id, existing.id))
        .returning();

      return NextResponse.json({ step: updated }, { status: 200 });
    }

    const [created] = await db
      .insert(onboardingProgressSchema)
      .values({
        orgId: orgId!,
        step,
        completed,
        data,
        completedAt: completed ? new Date() : null,
      })
      .returning();

    return NextResponse.json({ step: created }, { status: 201 });
  } catch (err) {
    console.error('Failed to save onboarding progress:', err);
    return NextResponse.json({ error: 'Failed to save onboarding progress' }, { status: 500 });
  }
}
