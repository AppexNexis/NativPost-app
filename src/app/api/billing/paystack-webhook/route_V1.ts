import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

import { verifyPaystackTransaction } from '@/lib/paystack';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';

// -----------------------------------------------------------
// POST /api/billing/paystack-webhook
// Handles Paystack event notifications
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('x-paystack-signature');

  // Verify webhook signature
  const hash = crypto
    .createHmac('sha512', PAYSTACK_SECRET)
    .update(body)
    .digest('hex');

  if (hash !== signature) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    const event = JSON.parse(body);

    switch (event.event) {
      case 'charge.success': {
        const reference = event.data?.reference;
        if (reference) {
          await verifyPaystackTransaction(reference);
        }
        break;
      }

      case 'subscription.create':
      case 'subscription.enable': {
        // Subscription activated — already handled in verify
        break;
      }

      case 'subscription.disable':
      case 'subscription.expiring_cards': {
        // TODO: Update org status, send notification email
        console.log('Paystack subscription event:', event.event);
        break;
      }

      case 'invoice.payment_failed': {
        // TODO: Update org to past_due, send email
        console.log('Paystack payment failed:', event.data?.reference);
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Paystack webhook error:', err);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
