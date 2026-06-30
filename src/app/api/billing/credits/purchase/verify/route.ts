import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { addAiCredits } from '@/lib/ai-studio/server';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;

// -----------------------------------------------------------
// GET /api/billing/credits/purchase/verify
// Paystack callback — verifies transaction and adds credits.
// -----------------------------------------------------------
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get('reference');
  const creditsParam = searchParams.get('credits');
  const orgId = searchParams.get('orgId');

  if (!reference || !creditsParam || !orgId) {
    return NextResponse.redirect(new URL('/ai-studio?credits=failed', request.url));
  }

  try {
    // Verify transaction with Paystack
    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
      },
    );

    const verifyData = await verifyRes.json();

    if (!verifyData.status || verifyData.data?.status !== 'success') {
      console.error('[Paystack] Verify failed:', verifyData);
      return NextResponse.redirect(new URL('/ai-studio?credits=failed', request.url));
    }

    // Add credits to org wallet
    const credits = parseInt(creditsParam, 10);
    await addAiCredits(orgId, credits, { type: 'purchase', description: `Purchased ${credits} AI credits` });

    return NextResponse.redirect(new URL('/ai-studio?credits=purchased', request.url));
  } catch (err) {
    console.error('[Paystack] Verify error:', err);
    return NextResponse.redirect(new URL('/ai-studio?credits=failed', request.url));
  }
}
