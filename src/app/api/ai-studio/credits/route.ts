import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { addAiCredits, getAiCreditsWallet, type AiCreditWallet } from '@/lib/ai-studio/server';
import { getOrgBillingState } from '@/lib/billing';

export async function GET() {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  try {
    // Fetch the org's plan to get the correct monthly AI credit limit
    let planMonthlyLimit: number | undefined;
    try {
      const billing = await getOrgBillingState(orgId!);
      if (billing?.features?.monthlyAiCredits !== undefined) {
        planMonthlyLimit = billing.features.monthlyAiCredits;
      }
    } catch {
      // Fallback to default if billing lookup fails
    }

    const wallet = await getAiCreditsWallet(orgId!, planMonthlyLimit);
    return NextResponse.json({ wallet });
  } catch (err) {
    console.error('[AI Studio Credits] failed:', err);
    return NextResponse.json({ error: 'Failed to fetch credits' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  try {
    const body = (await request.json()) as { amount?: number };
    const amount = Math.max(0, Math.floor(Number(body.amount) || 0));

    if (amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    // This is a placeholder purchase endpoint. In production this should create
    // a payment intent, verify it, then credit the wallet.
    const wallet = await addAiCredits(orgId!, amount, {
      type: 'purchase',
      description: `Purchased ${amount} add-on credits`,
    });

    return NextResponse.json<AiCreditWallet>(wallet);
  } catch (err) {
    console.error('[AI Studio Credits Purchase] failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
