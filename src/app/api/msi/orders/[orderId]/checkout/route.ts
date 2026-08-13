import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { BillingConfigError, getBillingProvider } from '@/lib/billing/provider';
import { perAccountCents } from '@/lib/msi/pricing';
import { getDb } from '@/libs/DB';
import { msiProvisioningOrderSchema } from '@/models/Schema';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

type RouteParams = { params: Promise<{ orderId: string }> };

// POST /api/msi/orders/[orderId]/checkout
// Create a subscription checkout for a pending managed-account order
// (per-account/mo × quantity) on whichever rail BILLING_PROVIDER selects.
// That provider's webhook marks the order paid and fulfils it.
//
// On Stripe the metered per-post price (STRIPE_MSI_POST_PRICE_ID) is attached
// as a second subscription item, so managed-post usage bills on the SAME
// subscription. Polar has no multi-item subscriptions; there, per-post usage is
// billed by ingesting meter events against the account product's metered price
// (see src/lib/msi/billing.ts). Both paths are gated on
// MSI_METERED_BILLING_ENABLED and are safe to deploy before the meter exists.
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }
  const { orderId } = await params;
  const db = await getDb();

  const [order] = await db
    .select()
    .from(msiProvisioningOrderSchema)
    .where(
      and(
        eq(msiProvisioningOrderSchema.id, orderId),
        eq(msiProvisioningOrderSchema.orgId, orgId!),
        eq(msiProvisioningOrderSchema.status, 'pending'),
      ),
    )
    .limit(1);
  if (!order) {
    return NextResponse.json({ error: 'Order not found or not payable' }, { status: 404 });
  }

  const config = (order.configSnapshot ?? {}) as { platform?: string; country?: string };
  const descriptionParts = [config.platform, config.country].filter(Boolean);

  try {
    const provider = await getBillingProvider();
    const { url } = await provider.createManagedAccountCheckout({
      orgId: orgId!,
      orderId,
      quantity: order.quantity,
      unitAmountCents: perAccountCents(),
      description: descriptionParts.length ? descriptionParts.join(' · ') : null,
      successUrl: `${APP_URL}/dashboard/infrastructure?order=success`,
      cancelUrl: `${APP_URL}/dashboard/infrastructure/new?cancelled=true`,
    });

    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof BillingConfigError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error('MSI checkout failed:', err);
    return NextResponse.json({ error: 'Could not start checkout' }, { status: 500 });
  }
}
