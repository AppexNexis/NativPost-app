/**
 * Server-side plan gate for INTERNAL settings routes.
 *
 * Public /api/v1 routes use `requireApiKey` which already enforces
 * plan.features.apiAccess. This helper is for /api/settings/api-keys and
 * /api/settings/webhooks — the internal Clerk-authed routes that power the
 * settings UI.
 *
 * Usage:
 *   const { error, orgId } = await getAuthContext();
 *   if (error) return error;
 *   const gate = await requirePlanFeature(orgId, 'apiAccess');
 *   if (gate.error) return gate.error;
 */

import { NextResponse } from 'next/server';

import { getOrgBillingState } from '@/lib/billing';
import type { PlanFeatures } from '@/lib/plans';

export type PlanGateResult =
  | { error: null; plan: string; features: PlanFeatures }
  | { error: NextResponse; plan: null; features: null };

export async function requirePlanFeature(
  orgId: string,
  feature: keyof PlanFeatures,
): Promise<PlanGateResult> {
  const billing = await getOrgBillingState(orgId);

  if (!billing) {
    return {
      error: NextResponse.json({ error: 'Organization not found' }, { status: 404 }),
      plan: null,
      features: null,
    };
  }

  if (!billing.isActive) {
    return {
      error: NextResponse.json(
        { error: 'Subscription inactive', upgradeRequired: true },
        { status: 402 },
      ),
      plan: null,
      features: null,
    };
  }

  const value = billing.features[feature];
  if (value === false || value === 0) {
    return {
      error: NextResponse.json(
        {
          error: `This feature is not included in your current plan (${billing.plan}). Upgrade to unlock.`,
          upgradeRequired: true,
          currentPlan: billing.plan,
        },
        { status: 403 },
      ),
      plan: null,
      features: null,
    };
  }

  return { error: null, plan: billing.plan, features: billing.features };
}
