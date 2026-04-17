import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { PLAN_CONFIGS } from '@/lib/plans';
import { getDb } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;

// -----------------------------------------------------------
// POST /api/billing/paystack-verify
// Called by the subscribe page after Paystack redirects back.
// Verifies the transaction directly with Paystack API and
// updates the DB — does not wait for webhook.
// Body: { reference: string, planId: string }
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  try {
    const { reference, planId } = await request.json();

    if (!reference) {
      return NextResponse.json({ error: 'Missing reference' }, { status: 400 });
    }

    // Verify transaction with Paystack
    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
        },
      },
    );

    const verifyData = await verifyRes.json();

    if (!verifyData.status || verifyData.data?.status !== 'success') {
      console.error('[Paystack Verify] Transaction not successful:', verifyData);
      return NextResponse.json({ success: false, error: 'Transaction not successful' });
    }

    const txData = verifyData.data;
    const customerCode = txData.customer?.customer_code as string | undefined;
    const authorizationCode = txData.authorization?.authorization_code as string | undefined;
    const metadata = txData.metadata as Record<string, unknown> | undefined;
    const resolvedPlanId = (metadata?.planId as string) || planId || 'growth';

    const plan = PLAN_CONFIGS[resolvedPlanId];
    if (!plan) {
      return NextResponse.json({ success: false, error: 'Invalid plan' });
    }

    const db = await getDb();

    // Update org: store auth code, set trialing
    await db
      .update(organizationSchema)
      .set({
        paystackCustomerCode: customerCode ?? null,
        paystackAuthorizationCode: authorizationCode ?? null,
        plan: resolvedPlanId,
        planStatus: 'trialing',
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      })
      .where(eq(organizationSchema.id, orgId!));

    console.log(`[Paystack Verify] Trial started for org ${orgId} on plan ${resolvedPlanId}`);

    // Refund the ₦50 tokenization charge
    try {
      const refundRes = await fetch('https://api.paystack.co/refund', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PAYSTACK_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transaction: reference,
          amount: 5000,
        }),
      });
      const refundData = await refundRes.json();
      if (refundData.status) {
        console.log(`[Paystack Verify] Refund successful for org ${orgId}`);
      } else {
        console.warn(`[Paystack Verify] Refund failed (non-fatal):`, refundData.message);
      }
    } catch (refundErr) {
      console.error(`[Paystack Verify] Refund error (non-fatal):`, refundErr);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Paystack Verify] Error:', err);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
