/**
 * GET /api/v1/me
 *   Returns metadata about the caller: org, plan, usage snapshot.
 *   Doubles as an authentication smoke test — useful for onboarding docs.
 */

import type { NextRequest } from 'next/server';

import { apiError, apiOk } from '@/lib/api-v1';
import { getOrgBillingState } from '@/lib/billing';
import { requireApiKey } from '@/lib/require-api-key';

export async function GET(request: NextRequest) {
  const { error, ctx } = await requireApiKey(request);
  if (error) return error;

  const billing = await getOrgBillingState(ctx.orgId);
  if (!billing) return apiError(500, 'internal', 'Failed to load billing state.');

  return apiOk({
    org_id: ctx.orgId,
    plan: billing.plan,
    plan_status: billing.planStatus,
    is_active: billing.isActive,
    is_trialing: billing.isTrialing,
    features: {
      posts_per_month: billing.features.postsPerMonth,
      platforms_limit: billing.features.platformsLimit,
      api_access: billing.features.apiAccess,
      monthly_ai_credits: billing.features.monthlyAiCredits,
      analytics_history_days: billing.features.analyticsHistory,
    },
  });
}
