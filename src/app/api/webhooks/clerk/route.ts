import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

import { getDb } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';
import { ensureNativPostAdminInOrg, fireWelcomeEmailForOrg } from '@/lib/clerk-org-helpers';

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

// -----------------------------------------------------------
// WEBHOOK HANDLER
// Only POST is exported — Next.js App Router requirement.
// Shared helpers live in @/lib/clerk-org-helpers to avoid
// "not a valid Route export field" build errors.
// -----------------------------------------------------------
export async function POST(request: Request) {
  const db = await getDb();

  if (!WEBHOOK_SECRET) {
    console.error('[Clerk Webhook] Missing CLERK_WEBHOOK_SECRET');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    console.error('[Clerk Webhook] Missing svix headers');
    return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 });
  }

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
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      // -----------------------------------------------------------
      // ORGANIZATION CREATED
      // 1. Insert org row into DB
      // 2. Auto-add NativPost admin as org admin
      // 3. Queue welcome email sequence for the creator
      // -----------------------------------------------------------
      case 'organization.created': {
        const orgId = event.data.id;
        console.log(`[Clerk Webhook] org.created → ${orgId} ("${event.data.name ?? 'unnamed'}")`);

        // 1. Create org row in DB
        await db
          .insert(organizationSchema)
          .values({
            id: orgId,
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

        // 2. Add NativPost admin — non-fatal if it fails,
        //    billing.ts fallback will retry on next request
        await ensureNativPostAdminInOrg(orgId);

        // 3. Fire welcome email — non-fatal, email tool deduplicates
        await fireWelcomeEmailForOrg(orgId);

        break;
      }

      // -----------------------------------------------------------
      // ORGANIZATION DELETED
      // -----------------------------------------------------------
      case 'organization.deleted': {
        const orgId = event.data.id;
        console.log(`[Clerk Webhook] org.deleted → ${orgId}`);

        await db
          .delete(organizationSchema)
          .where(eq(organizationSchema.id, orgId));

        break;
      }

      default: {
        console.log(`[Clerk Webhook] Ignored event: ${event.type}`);
        break;
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error('[Clerk Webhook] Handler failed:', err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}