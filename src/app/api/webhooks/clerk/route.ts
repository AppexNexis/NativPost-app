import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

import { db } from '@/lib/db';
import { organizationSchema } from '@/models/Schema';

// -----------------------------------------------------------
// POST /api/webhooks/clerk
// Handles Clerk webhook events
//
// Events handled:
//   - organization.created  → creates org row in DB
//   - organization.deleted  → deletes org row from DB (cascades)
//
// Setup:
//   1. Go to Clerk Dashboard → Configure → Webhooks → Add Endpoint
//   2. URL: https://app.nativpost.com/api/webhooks/clerk
//   3. Subscribe to: organization.created, organization.deleted
//   4. Copy the Signing Secret → add to .env.local as CLERK_WEBHOOK_SECRET
// -----------------------------------------------------------

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
  if (!WEBHOOK_SECRET) {
    console.error('CLERK_WEBHOOK_SECRET is not set');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 },
    );
  }

  // Get Svix headers for verification
  const headerPayload = headers();
  const svixId = headerPayload.get('svix-id');
  const svixTimestamp = headerPayload.get('svix-timestamp');
  const svixSignature = headerPayload.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: 'Missing svix headers' },
      { status: 400 },
    );
  }

  // Verify the webhook signature
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
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json(
      { error: 'Invalid webhook signature' },
      { status: 400 },
    );
  }

  // Handle events
  switch (event.type) {
    case 'organization.created': {
      try {
        await db
          .insert(organizationSchema)
          .values({
            id: event.data.id,
            plan: 'starter',
            planStatus: 'trialing',
            postsPerMonth: 20,
            platformsLimit: 3,
            setupFeePaid: false,
          })
          .onConflictDoNothing();

        // console.log(`Organization created in DB: ${event.data.id}`);
      } catch (err) {
        console.error('Failed to create organization in DB:', err);
        return NextResponse.json(
          { error: 'Failed to create organization' },
          { status: 500 },
        );
      }
      break;
    }

    case 'organization.deleted': {
      try {
        await db
          .delete(organizationSchema)
          .where(
            (await import('drizzle-orm')).eq(organizationSchema.id, event.data.id),
          );

        // console.log(`Organization deleted from DB: ${event.data.id}`);
      } catch (err) {
        console.error('Failed to delete organization from DB:', err);
        return NextResponse.json(
          { error: 'Failed to delete organization' },
          { status: 500 },
        );
      }
      break;
    }

    default:
      // Ignore unhandled events
      // console.log(`Unhandled Clerk webhook event: ${event.type}`);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
