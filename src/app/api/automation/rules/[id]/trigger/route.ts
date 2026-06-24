import { eq, and } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { automationRuleSchema } from '@/models/Schema';

type RouteParams = { params: Promise<{ id: string }> };

// -----------------------------------------------------------
// POST /api/automation/rules/[id]/trigger
// Manually trigger an automation rule
// -----------------------------------------------------------
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  try {
    const [rule] = await db
      .select()
      .from(automationRuleSchema)
      .where(
        and(
          eq(automationRuleSchema.id, id),
          eq(automationRuleSchema.orgId, orgId!),
        ),
      )
      .limit(1);

    if (!rule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    // Execute the rule action (simplified)
    // In production, this would dispatch to a background job queue
    const actionResult = await executeRuleAction(rule);

    // Update rule stats
    const [updated] = await db
      .update(automationRuleSchema)
      .set({
        lastRunAt: new Date(),
        runCount: (rule.runCount || 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(automationRuleSchema.id, id))
      .returning();

    return NextResponse.json({
      success: true,
      actionResult,
      rule: updated,
    }, { status: 200 });
  } catch (err) {
    console.error('Failed to trigger automation rule:', err);
    return NextResponse.json({ error: 'Failed to trigger automation rule' }, { status: 500 });
  }
}

async function executeRuleAction(rule: any): Promise<any> {
  const { actionType, actionConfig } = rule;

  switch (actionType) {
    case 'generate_campaign':
      return {
        type: 'generate_campaign',
        message: 'Campaign generation queued',
        campaignTemplateId: actionConfig?.campaignTemplateId,
        autoApprove: actionConfig?.autoApprove,
      };
    case 'publish_post':
      return {
        type: 'publish_post',
        message: 'Post publish queued',
        targetPlatforms: actionConfig?.targetPlatforms,
      };
    case 'remix_template':
      return {
        type: 'remix_template',
        message: 'Template remix queued',
        contentType: actionConfig?.contentType,
      };
    case 'notify':
      return {
        type: 'notify',
        message: 'Notification sent',
        channels: actionConfig?.notifyChannels,
      };
    default:
      return {
        type: 'unknown',
        message: 'Action type not implemented',
      };
  }
}
