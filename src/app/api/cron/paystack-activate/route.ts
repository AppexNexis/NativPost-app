import { and, eq, isNotNull, lt } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getPaystackPlanCode } from '@/lib/plans';
import { getDb } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;

// -----------------------------------------------------------
// GET /api/billing/paystack-activate
//
// Finds orgs whose Paystack trial has ended and creates their
// subscription using the stored authorization code.
// Called by GitHub Actions daily.
// Protected by Authorization: Bearer <CRON_SECRET> header.
// -----------------------------------------------------------
export async function GET(request: NextRequest) {
  const db = await getDb();
  const authHeader = request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[Paystack Activate] CRON_SECRET env var not set');
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error('[Paystack Activate] Unauthorized attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  console.log(`[Paystack Activate] Running at ${now.toISOString()}`);

  try {
    const orgsToActivate = await db
      .select()
      .from(organizationSchema)
      .where(
        and(
          eq(organizationSchema.planStatus, 'trialing'),
          lt(organizationSchema.trialEndsAt, now),
          isNotNull(organizationSchema.paystackAuthorizationCode),
          isNotNull(organizationSchema.paystackCustomerCode),
        ),
      );

    if (orgsToActivate.length === 0) {
      console.log('[Paystack Activate] No orgs to activate');
      return NextResponse.json({ activated: 0, message: 'No orgs due for activation' });
    }

    console.log(`[Paystack Activate] Found ${orgsToActivate.length} org(s) to activate`);

    const results = [];

    for (const org of orgsToActivate) {
      console.log(`[Paystack Activate] Activating org ${org.id} on plan ${org.plan}`);

      try {
        const planCode = getPaystackPlanCode(org.plan);

        if (!planCode || planCode.includes('REPLACE')) {
          console.error(`[Paystack Activate] No plan code for plan ${org.plan}`);
          results.push({ orgId: org.id, success: false, error: `No plan code for ${org.plan}` });
          continue;
        }

        const res = await fetch('https://api.paystack.co/subscription', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${PAYSTACK_SECRET}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            customer: org.paystackCustomerCode,
            plan: planCode,
            authorization: org.paystackAuthorizationCode,
          }),
        });

        const json = await res.json();

        if (!json.status) {
          console.error(`[Paystack Activate] Failed for org ${org.id}:`, json.message);
          results.push({ orgId: org.id, success: false, error: json.message });
          continue;
        }

        console.log(`[Paystack Activate] Subscription created for org ${org.id}`);
        results.push({ orgId: org.id, success: true });

        // Paystack will fire a subscription.create webhook which will
        // call handlePaystackSuccess and fully activate the org record.
        // No DB update needed here.
      } catch (err) {
        console.error(`[Paystack Activate] Error for org ${org.id}:`, err);
        results.push({ orgId: org.id, success: false, error: String(err) });
      }
    }

    const succeeded = results.filter(r => r.success).length;

    return NextResponse.json({
      activated: succeeded,
      failed: results.length - succeeded,
      results,
    });
  } catch (err) {
    console.error('[Paystack Activate] Scheduler error:', err);
    return NextResponse.json({ error: 'Activation failed' }, { status: 500 });
  }
}
