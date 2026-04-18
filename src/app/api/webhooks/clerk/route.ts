import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

import { getDb } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';

const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

// The NativPost company admin email — auto-added to every new org
const NATIVPOST_ADMIN_EMAIL = 'admin@nativpost.com';

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
// CLERK BACKEND API HELPERS
// Uses the Clerk Backend API directly (no SDK needed)
// Docs: https://clerk.com/docs/reference/backend-api
// -----------------------------------------------------------

/**
 * Look up a Clerk user by email address.
 * Returns the user object or null if not found.
 */
async function getClerkUserByEmail(email: string): Promise<{ id: string } | null> {
  if (!CLERK_SECRET_KEY) {
    console.error('[Clerk Webhook] Missing CLERK_SECRET_KEY');
    return null;
  }

  const res = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}&limit=1`,
    {
      headers: {
        'Authorization': `Bearer ${CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    },
  );

  if (!res.ok) {
    const body = await res.text();
    console.error(`[Clerk Webhook] Failed to look up user by email: ${res.status}`, body);
    return null;
  }

  const users = await res.json();
  const user = Array.isArray(users) ? users[0] : users?.data?.[0];

  if (!user) {
    console.warn(`[Clerk Webhook] No Clerk user found for email: ${email}`);
    return null;
  }

  return { id: user.id };
}

/**
 * Add a user as an admin member of a Clerk organization.
 * Uses the Clerk Backend API POST /v1/organizations/{org_id}/memberships
 */
async function addOrgMember(orgId: string, userId: string, role: 'admin' | 'basic_member' = 'admin'): Promise<boolean> {
  if (!CLERK_SECRET_KEY) {
    console.error('[Clerk Webhook] Missing CLERK_SECRET_KEY — cannot add org member');
    return false;
  }

  const res = await fetch(
    `https://api.clerk.com/v1/organizations/${orgId}/memberships`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_id: userId, role }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    // 422 typically means the user is already a member — not a true error
    if (res.status === 422) {
      console.log(`[Clerk Webhook] User ${userId} is already a member of org ${orgId} — skipping`);
      return true;
    }
    console.error(`[Clerk Webhook] Failed to add member to org ${orgId}: ${res.status}`, body);
    return false;
  }

  console.log(`[Clerk Webhook] Successfully added ${userId} as ${role} to org ${orgId}`);
  return true;
}

// -----------------------------------------------------------
// WEBHOOK HANDLER
// -----------------------------------------------------------
export async function POST(request: Request) {
  const db = await getDb();

  // ── ENV check ──
  if (!WEBHOOK_SECRET) {
    console.error('[Clerk Webhook] Missing CLERK_WEBHOOK_SECRET');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // ── Svix header validation ──
  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    console.error('[Clerk Webhook] Missing svix headers');
    return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 });
  }

  // ── Signature verification ──
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

  // ── Event handling ──
  try {
    switch (event.type) {
      // -----------------------------------------------------------
      // ORGANIZATION CREATED
      // 1. Insert org row into DB (inactive — trial is started separately)
      // 2. Auto-add NativPost admin as an org admin via Clerk Backend API
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

        // 2. Look up the NativPost admin user and add them to the org.
        //    We do this async-safely: a failure here should not break the webhook response.
        const adminUser = await getClerkUserByEmail(NATIVPOST_ADMIN_EMAIL);

        if (adminUser) {
          const added = await addOrgMember(orgId, adminUser.id, 'admin');
          if (!added) {
            // Log the failure but do not return an error — the org was created successfully.
            // The admin can be added manually from the Clerk dashboard if needed.
            console.warn(
              `[Clerk Webhook] Could not auto-add ${NATIVPOST_ADMIN_EMAIL} to org ${orgId}. `
              + 'Add manually from the Clerk Dashboard if required.',
            );
          }
        }

        break;
      }

      // -----------------------------------------------------------
      // ORGANIZATION DELETED
      // Remove the org row from our DB. Clerk handles membership cleanup.
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
