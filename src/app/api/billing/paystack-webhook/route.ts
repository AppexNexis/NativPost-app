import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

import { getAuthContext } from '@/lib/auth';
import { db } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// -----------------------------------------------------------
// POST /api/billing/manage
// Creates a Stripe Customer Portal session
//
// The portal handles ALL subscription management:
// - View/change plan
// - Update payment method
// - View billing info
// - View invoice history
// - Cancel subscription
//
// Configure the portal in Stripe Dashboard → Settings → Customer Portal
// Enable: Plan changes, payment method updates, invoice history, cancellation
// -----------------------------------------------------------
export async function POST() {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  try {
    const [org] = await db
      .select()
      .from(organizationSchema)
      .where(eq(organizationSchema.id, orgId!))
      .limit(1);

    if (!org?.stripeCustomerId) {
      return NextResponse.json(
        { error: 'No billing account found. Subscribe to a plan first.' },
        { status: 400 },
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: `${APP_URL}/dashboard/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('Portal session error:', err);
    return NextResponse.json({ error: 'Failed to create portal session' }, { status: 500 });
  }
}