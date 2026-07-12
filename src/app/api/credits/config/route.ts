import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import {
  type AutoTopUpConfig,
  getAiCreditsWallet,
  type LowBalanceAlertConfig,
  updateAutoTopUpConfig,
  updateLowBalanceAlertConfig,
} from '@/lib/ai-studio/server';

export const dynamic = 'force-dynamic';

interface ConfigBody {
  autoTopUp?: Partial<AutoTopUpConfig>;
  lowBalanceAlert?: Partial<LowBalanceAlertConfig>;
}

function isValidThreshold(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 10000;
}

function isValidAmount(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 10 && v <= 1000;
}

export async function PATCH(request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  let body: ConfigBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.autoTopUp) {
    const patch: Partial<AutoTopUpConfig> = {};
    if (typeof body.autoTopUp.enabled === 'boolean') patch.enabled = body.autoTopUp.enabled;
    if (body.autoTopUp.threshold !== undefined) {
      if (!isValidThreshold(body.autoTopUp.threshold)) {
        return NextResponse.json({ error: 'Invalid auto top-up threshold' }, { status: 400 });
      }
      patch.threshold = body.autoTopUp.threshold;
    }
    if (body.autoTopUp.amountUsd !== undefined) {
      if (!isValidAmount(body.autoTopUp.amountUsd)) {
        return NextResponse.json(
          { error: 'Auto top-up amount must be between $10 and $1000' },
          { status: 400 },
        );
      }
      patch.amountUsd = body.autoTopUp.amountUsd;
    }
    await updateAutoTopUpConfig(orgId!, patch);
  }

  if (body.lowBalanceAlert) {
    const patch: Partial<LowBalanceAlertConfig> = {};
    if (typeof body.lowBalanceAlert.enabled === 'boolean') patch.enabled = body.lowBalanceAlert.enabled;
    if (body.lowBalanceAlert.threshold !== undefined) {
      if (!isValidThreshold(body.lowBalanceAlert.threshold)) {
        return NextResponse.json({ error: 'Invalid alert threshold' }, { status: 400 });
      }
      patch.threshold = body.lowBalanceAlert.threshold;
    }
    await updateLowBalanceAlertConfig(orgId!, patch);
  }

  const wallet = await getAiCreditsWallet(orgId!);
  return NextResponse.json({ wallet });
}
