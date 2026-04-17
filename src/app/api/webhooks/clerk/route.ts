import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

import { getDb } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';

const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

type ClerkOrganizationEvent = {
  type: 'organization.created' | 'organization.deleted' | string;
  data: {
    id: string;
    name?: string;
    slug?: string;
    created_at?: number;
  };
};

export async function POST(request: Request) {
  const db = await getDb();

  // -----------------------------------------------------------
  // ENV CHECK
  // -----------------------------------------------------------
  if (!WEBHOOK_SECRET) {
    console.error('[Clerk Webhook] Missing CLERK_WEBHOOK_SECRET');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 },
    );
  }

  // -----------------------------------------------------------
  // GET HEADERS (IMPORTANT: use request.headers)
  // -----------------------------------------------------------
  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    console.error('[Clerk Webhook] Missing svix headers');
    return NextResponse.json(
      { error: 'Missing svix headers' },
      { status: 400 },
    );
  }

  // -----------------------------------------------------------
  // VERIFY SIGNATURE
  // -----------------------------------------------------------
  const payload = await request.text();
  const wh = new Webhook(WEBHOOK_SECRET);

  let event: ClerkOrganizationEvent;

  try {
    event = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkOrganizationEvent;
  } catch (err) {
    console.error('[Clerk Webhook] Signature verification failed:', err);
    return NextResponse.json(
      { error: 'Invalid webhook signature' },
      { status: 400 },
    );
  }

  // -----------------------------------------------------------
  // HANDLE EVENTS
  // -----------------------------------------------------------
  try {
    switch (event.type) {
      case 'organization.created': {
        console.log(`[Clerk Webhook] Creating org: ${event.data.id}`);

        await db
          .insert(organizationSchema)
          .values({
            id: event.data.id,

            // IMPORTANT: start as inactive
            plan: 'starter',
            planStatus: 'inactive',

            postsPerMonth: 0,
            platformsLimit: 0,
            setupFeePaid: false,

            trialEndsAt: null,
            stripeCustomerId: null,
            stripeSubscriptionId: null,
            paystackCustomerCode: null,
            paystackSubscriptionCode: null,
          })
          .onConflictDoNothing();

        break;
      }

      case 'organization.deleted': {
        console.log(`[Clerk Webhook] Deleting org: ${event.data.id}`);

        await db
          .delete(organizationSchema)
          .where(eq(organizationSchema.id, event.data.id));

        break;
      }

      default: {
        console.log(`[Clerk Webhook] Ignored event: ${event.type}`);
        break;
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error('[Clerk Webhook] DB operation failed:', err);

    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 },
    );
  }
}
