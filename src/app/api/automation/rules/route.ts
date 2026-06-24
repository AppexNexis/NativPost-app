import { eq, and, desc } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { automationRuleSchema } from '@/models/Schema';

// -----------------------------------------------------------
// GET /api/automation/rules
// List automation rules for the org
// -----------------------------------------------------------
export async function GET(_request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  try {
    const items = await db
      .select()
      .from(automationRuleSchema)
      .where(eq(automationRuleSchema.orgId, orgId!))
      .orderBy(desc(automationRuleSchema.createdAt));

    return NextResponse.json({ items }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch automation rules:', err);
    return NextResponse.json({ error: 'Failed to fetch automation rules' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// POST /api/automation/rules
// Create a new automation rule
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  try {
    const body = await request.json();

    const [created] = await db
      .insert(automationRuleSchema)
      .values({
        orgId: orgId!,
        name: body.name,
        triggerType: body.triggerType,
        triggerConfig: body.triggerConfig || {},
        actionType: body.actionType,
        actionConfig: body.actionConfig || {},
        isActive: body.isActive ?? true,
        nextRunAt: body.triggerType === 'time_based' && body.triggerConfig?.cron
          ? computeNextRun(body.triggerConfig.cron, body.triggerConfig.timezone || 'UTC')
          : null,
      })
      .returning();

    return NextResponse.json({ item: created }, { status: 201 });
  } catch (err) {
    console.error('Failed to create automation rule:', err);
    return NextResponse.json({ error: 'Failed to create automation rule' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// PUT /api/automation/rules
// Update an automation rule (requires id in body)
// -----------------------------------------------------------
export async function PUT(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Rule id is required' }, { status: 400 });
    }

    const setData: Record<string, any> = {
      updatedAt: new Date(),
    };
    if (updates.name !== undefined) setData.name = updates.name;
    if (updates.triggerType !== undefined) setData.triggerType = updates.triggerType;
    if (updates.triggerConfig !== undefined) setData.triggerConfig = updates.triggerConfig;
    if (updates.actionType !== undefined) setData.actionType = updates.actionType;
    if (updates.actionConfig !== undefined) setData.actionConfig = updates.actionConfig;
    if (updates.isActive !== undefined) setData.isActive = updates.isActive;
    if (updates.nextRunAt !== undefined) setData.nextRunAt = updates.nextRunAt ? new Date(updates.nextRunAt) : null;
    if (updates.lastRunAt !== undefined) setData.lastRunAt = updates.lastRunAt ? new Date(updates.lastRunAt) : null;
    if (updates.runCount !== undefined) setData.runCount = updates.runCount;

    const [updated] = await db
      .update(automationRuleSchema)
      .set(setData)
      .where(
        and(
          eq(automationRuleSchema.id, id),
          eq(automationRuleSchema.orgId, orgId!),
        ),
      )
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    return NextResponse.json({ item: updated }, { status: 200 });
  } catch (err) {
    console.error('Failed to update automation rule:', err);
    return NextResponse.json({ error: 'Failed to update automation rule' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// DELETE /api/automation/rules
// Delete an automation rule (requires id in body or query)
// -----------------------------------------------------------
export async function DELETE(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Rule id is required' }, { status: 400 });
    }

    const [deleted] = await db
      .delete(automationRuleSchema)
      .where(
        and(
          eq(automationRuleSchema.id, id),
          eq(automationRuleSchema.orgId, orgId!),
        ),
      )
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('Failed to delete automation rule:', err);
    return NextResponse.json({ error: 'Failed to delete automation rule' }, { status: 500 });
  }
}

// Helper to compute next run from cron (simplified)
function computeNextRun(cron: string, _timezone: string): Date | null {
  try {
    // Simplified: for basic cron like "0 9 * * 1", add days until next Monday
    // In production, use a proper cron parser like node-cron or cron-parser
    const now = new Date();
    const parts = cron.split(' ');
    if (parts.length === 5) {
      const [minute, hour, , , dayOfWeek] = parts;
      if (dayOfWeek !== '*') {
        const targetDay = Number(dayOfWeek);
        const currentDay = now.getDay();
        const daysUntil = (targetDay - currentDay + 7) % 7 || 7;
        const next = new Date(now);
        next.setDate(now.getDate() + daysUntil);
        next.setHours(Number(hour), Number(minute), 0, 0);
        return next;
      }
    }
    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  } catch {
    return null;
  }
}
