import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

import { getDb } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';
import { fireEmailEvent } from '@/lib/email-webhook';

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
// -----------------------------------------------------------

async function getClerkUserByEmail(email: string): Promise<{ id: string } | null> {
  if (!CLERK_SECRET_KEY) {
    console.error('[Clerk Webhook] Missing CLERK_SECRET_KEY');
    return null;
  }

  const res = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}&limit=1`,
    {
      headers: new Headers({
        'Authorization': `Bearer ${CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      }),
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

async function addOrgMember(
  orgId: string,
  userId: string,
  role: 'admin' | 'basic_member' = 'admin',
): Promise<boolean> {
  if (!CLERK_SECRET_KEY) {
    console.error('[Clerk Webhook] Missing CLERK_SECRET_KEY — cannot add org member');
    return false;
  }

  const res = await fetch(
    `https://api.clerk.com/v1/organizations/${orgId}/memberships`,
    {
      method: 'POST',
      headers: new Headers({
        'Authorization': `Bearer ${CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ user_id: userId, role }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 422) {
      // Already a member — not an error
      console.log(`[Clerk Webhook] User ${userId} already a member of org ${orgId} — skipping`);
      return true;
    }
    console.error(`[Clerk Webhook] Failed to add member to org ${orgId}: ${res.status}`, body);
    return false;
  }

  console.log(`[Clerk Webhook] Added ${userId} as ${role} to org ${orgId}`);
  return true;
}

// -----------------------------------------------------------
// SHARED HELPERS — exported so billing.ts can call them
// as fallbacks when the webhook was missed/delayed.
// -----------------------------------------------------------

/**
 * Ensure the NativPost admin account is a member of the org.
 * Idempotent — safe to call multiple times, 422 is handled gracefully.
 */
export async function ensureNativPostAdminInOrg(orgId: string): Promise<void> {
  try {
    const adminUser = await getClerkUserByEmail(NATIVPOST_ADMIN_EMAIL);
    if (!adminUser) {
      console.warn(`[ensureAdmin] Could not find Clerk user for ${NATIVPOST_ADMIN_EMAIL}`);
      return;
    }
    const added = await addOrgMember(orgId, adminUser.id, 'admin');
    if (!added) {
      console.warn(
        `[ensureAdmin] Could not add ${NATIVPOST_ADMIN_EMAIL} to org ${orgId}. `
        + 'Add manually from Clerk Dashboard if needed.',
      );
    }
  } catch (err) {
    // Non-fatal — never crash the caller
    console.error(`[ensureAdmin] Unexpected error for org ${orgId}:`, err);
  }
}

/**
 * Resolve the creator of an org via Clerk memberships API,
 * then fire the welcome email sequence.
 * Idempotent — the email tool deduplicates enrollments via UNIQUE KEY.
 */
export async function fireWelcomeEmailForOrg(orgId: string): Promise<void> {
  try {
    if (!CLERK_SECRET_KEY) return;

    // Get the org's current members to find the real creator
    const res = await fetch(
      `https://api.clerk.com/v1/organizations/${orgId}/memberships?limit=10`,
      {
        headers: new Headers({
          'Authorization': `Bearer ${CLERK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        }),
      },
    );

    if (!res.ok) {
      console.warn(`[fireWelcomeEmail] Could not fetch members for org ${orgId}: ${res.status}`);
      return;
    }

    const json = await res.json();
    const members: Array<{
      role: string;
      public_user_data: {
        identifier: string;
        first_name?: string;
        last_name?: string;
        user_id: string;
      };
    }> = json.data ?? json;

    // First admin who is NOT the NativPost internal account
    const creator = members.find(
      m => m.role === 'admin' && m.public_user_data?.identifier !== NATIVPOST_ADMIN_EMAIL,
    );

    if (!creator) {
      console.warn(`[fireWelcomeEmail] No real creator found in org ${orgId} memberships`);
      return;
    }

    await fireEmailEvent('user.signup', {
      email: creator.public_user_data.identifier,
      first_name: creator.public_user_data.first_name ?? '',
      last_name: creator.public_user_data.last_name ?? '',
      clerk_user_id: creator.public_user_data.user_id,
    });

    console.log(
      `[fireWelcomeEmail] Welcome email queued for org ${orgId} → ${creator.public_user_data.identifier}`,
    );
  } catch (err) {
    // Non-fatal
    console.error(`[fireWelcomeEmail] Error for org ${orgId}:`, err);
  }
}

// -----------------------------------------------------------
// WEBHOOK HANDLER
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