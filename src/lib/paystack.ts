/**
 * NativPost Paystack Integration
 *
 * For African markets — local cards, bank transfers, mobile money.
 * Runs alongside Stripe (users choose based on their region).
 */

import { eq } from 'drizzle-orm';

import { db } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';
import { getPaystackPlanCode, PLANS } from '@/lib/plans';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// -----------------------------------------------------------
// Initialize a Paystack transaction for subscription
// -----------------------------------------------------------
export async function createPaystackCheckout(
  orgId: string,
  planId: string,
  email: string,
): Promise<{ url: string } | { error: string }> {
  const plan = PLANS[planId];
  if (!plan) return { error: 'Invalid plan' };

  const planCode = getPaystackPlanCode(planId);
  if (!planCode || planCode.includes('REPLACE')) {
    return { error: 'Paystack plan not configured. Contact support.' };
  }

  try {
    // Check if org already has a Paystack customer
    const [org] = await db
      .select()
      .from(organizationSchema)
      .where(eq(organizationSchema.id, orgId))
      .limit(1);

    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        // Amount in kobo for setup fee (one-time)
        amount: !org?.setupFeePaid ? plan.setupFeeUsd * 100 * 1600 : undefined, // Approx NGN rate
        plan: planCode,
        callback_url: `${APP_URL}/dashboard/billing?paystack_success=true&plan=${planId}`,
        metadata: {
          orgId,
          planId,
          custom_fields: [
            { display_name: 'Organization', variable_name: 'org_id', value: orgId },
            { display_name: 'Plan', variable_name: 'plan_id', value: planId },
          ],
        },
      }),
    });

    const data = await res.json();

    if (data.status && data.data?.authorization_url) {
      // Save Paystack customer code if returned
      if (data.data.customer_code && org) {
        await db
          .update(organizationSchema)
          .set({ paystackCustomerCode: data.data.customer_code })
          .where(eq(organizationSchema.id, orgId));
      }

      return { url: data.data.authorization_url };
    }

    return { error: data.message || 'Paystack initialization failed' };
  } catch (err) {
    console.error('Paystack checkout error:', err);
    return { error: 'Failed to create Paystack checkout' };
  }
}

// -----------------------------------------------------------
// Verify a Paystack transaction (called from webhook or callback)
// -----------------------------------------------------------
export async function verifyPaystackTransaction(reference: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    });

    const data = await res.json();

    if (data.status && data.data?.status === 'success') {
      const metadata = data.data.metadata || {};
      const orgId = metadata.orgId;
      const planId = metadata.planId;

      if (orgId && planId) {
        const plan = PLANS[planId];
        if (plan) {
          await db
            .update(organizationSchema)
            .set({
              plan: planId,
              planStatus: 'active',
              postsPerMonth: plan.postsPerMonth,
              platformsLimit: plan.platformsLimit,
              setupFeePaid: true,
              paystackCustomerCode: data.data.customer?.customer_code || null,
              paystackSubscriptionCode: data.data.subscription_code || null,
              paystackPlanCode: data.data.plan?.plan_code || null,
              updatedAt: new Date(),
            })
            .where(eq(organizationSchema.id, orgId));
        }
      }

      return true;
    }

    return false;
  } catch (err) {
    console.error('Paystack verification error:', err);
    return false;
  }
}
