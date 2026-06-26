import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { addAiCredits, getAiCreditsWallet, type AiCreditWallet } from '@/lib/ai-studio/server';

export async function GET() {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  try {
    const wallet = await getAiCreditsWallet(orgId!);
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
