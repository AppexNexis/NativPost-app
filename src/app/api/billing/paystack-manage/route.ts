import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;

// -----------------------------------------------------------
// GET /api/billing/paystack-manage
// Returns the org's Paystack subscription details + invoices
// for the custom management portal UI.
// -----------------------------------------------------------
export async function GET() {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const [org] = await db
    .select({
      paystackSubscriptionCode: organizationSchema.paystackSubscriptionCode,
      paystackCustomerCode: organizationSchema.paystackCustomerCode,
      paystackAuthorizationCode: organizationSchema.paystackAuthorizationCode,
    })
    .from(organizationSchema)
    .where(eq(organizationSchema.id, orgId!))
    .limit(1);

  if (!org?.paystackSubscriptionCode) {
    return NextResponse.json({ subscription: null, invoices: [] });
  }

  try {
    // Fetch subscription details
    const [subRes, invoiceRes] = await Promise.all([
      fetch(`https://api.paystack.co/subscription/${org.paystackSubscriptionCode}`, {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
      }),
      fetch(`https://api.paystack.co/transaction?customer=${org.paystackCustomerCode}&perPage=10`, {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
      }),
    ]);

    const subData = await subRes.json();
    const invoiceData = await invoiceRes.json();

    return NextResponse.json({
      subscription: subData.status ? subData.data : null,
      invoices: invoiceData.status ? (invoiceData.data ?? []) : [],
    });
  } catch (err) {
    console.error('[Paystack Manage] Error:', err);
    return NextResponse.json({ subscription: null, invoices: [] });
  }
}

// -----------------------------------------------------------
// POST /api/billing/paystack-manage
// Actions: cancel
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { action } = await request.json();

  const [org] = await db
    .select({
      paystackSubscriptionCode: organizationSchema.paystackSubscriptionCode,
      paystackAuthorizationCode: organizationSchema.paystackAuthorizationCode,
    })
    .from(organizationSchema)
    .where(eq(organizationSchema.id, orgId!))
    .limit(1);

  if (!org?.paystackSubscriptionCode) {
    return NextResponse.json({ error: 'No active subscription found.' }, { status: 400 });
  }

  if (action === 'cancel') {
    const res = await fetch('https://api.paystack.co/subscription/disable', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: org.paystackSubscriptionCode,
        token: org.paystackAuthorizationCode,
      }),
    });

    const data = await res.json();

    if (data.status) {
      // Update DB status — subscription still active until end of period
      // Full deactivation handled by subscription.not_renew webhook
      await db
        .update(organizationSchema)
        .set({ planStatus: 'cancelled', updatedAt: new Date() })
        .where(eq(organizationSchema.id, orgId!));

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: data.message || 'Failed to cancel subscription.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
