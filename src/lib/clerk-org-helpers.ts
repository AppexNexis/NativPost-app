/**
 * clerk-org-helpers.ts
 *
 * Shared helpers for Clerk org side-effects:
 * - Ensuring NativPost admin is a member of every org
 * - Firing the welcome email sequence for a new org's creator
 *
 * Kept in lib/ (not in a route file) so they can be imported
 * from both the Clerk webhook route and the billing.ts fallback
 * without triggering Next.js "not a valid Route export" errors.
 */

import { fireEmailEvent } from '@/lib/email-webhook';

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
const NATIVPOST_ADMIN_EMAIL = 'admin@nativpost.com';

// -----------------------------------------------------------
// CLERK BACKEND API HELPERS (private)
// -----------------------------------------------------------

async function getClerkUserByEmail(email: string): Promise<{ id: string } | null> {
  if (!CLERK_SECRET_KEY) {
    console.error('[ClerkOrgHelpers] Missing CLERK_SECRET_KEY');
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
    console.error(`[ClerkOrgHelpers] Failed to look up user by email: ${res.status}`, body);
    return null;
  }

  const users = await res.json();
  const user = Array.isArray(users) ? users[0] : users?.data?.[0];

  if (!user) {
    console.warn(`[ClerkOrgHelpers] No Clerk user found for email: ${email}`);
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
    console.error('[ClerkOrgHelpers] Missing CLERK_SECRET_KEY — cannot add org member');
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
      console.log(`[ClerkOrgHelpers] User ${userId} already a member of org ${orgId} — skipping`);
      return true;
    }
    console.error(`[ClerkOrgHelpers] Failed to add member to org ${orgId}: ${res.status}`, body);
    return false;
  }

  console.log(`[ClerkOrgHelpers] Added ${userId} as ${role} to org ${orgId}`);
  return true;
}

// -----------------------------------------------------------
// PUBLIC HELPERS
// -----------------------------------------------------------

/**
 * Ensure the NativPost admin account (admin@nativpost.com) is
 * a member of the org. Idempotent — 422 Already a member is
 * handled gracefully, safe to call more than once.
 */
export async function ensureNativPostAdminInOrg(orgId: string): Promise<void> {
  try {
    const adminUser = await getClerkUserByEmail(NATIVPOST_ADMIN_EMAIL);
    if (!adminUser) {
      console.warn(`[ClerkOrgHelpers] Could not find Clerk user for ${NATIVPOST_ADMIN_EMAIL}`);
      return;
    }
    const added = await addOrgMember(orgId, adminUser.id, 'admin');
    if (!added) {
      console.warn(
        `[ClerkOrgHelpers] Could not add ${NATIVPOST_ADMIN_EMAIL} to org ${orgId}. `
        + 'Add manually from Clerk Dashboard if needed.',
      );
    }
  } catch (err) {
    console.error(`[ClerkOrgHelpers] ensureNativPostAdminInOrg error for org ${orgId}:`, err);
  }
}

/**
 * Resolve the creator of an org via the Clerk memberships API,
 * then fire the welcome email sequence to the email tool.
 * Idempotent — the email tool deduplicates enrollments via UNIQUE KEY.
 */
/** The org's primary customer email (first non-NativPost admin member), or null. */
export async function getOrgCustomerEmail(orgId: string): Promise<string | null> {
  try {
    if (!CLERK_SECRET_KEY) {
      return null;
    }
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
      return null;
    }
    const json = await res.json();
    const members: Array<{
      role: string;
      public_user_data?: { identifier?: string };
    }> = json.data ?? json;
    const creator = members.find(
      m =>
        m.role === 'admin'
        && m.public_user_data?.identifier !== NATIVPOST_ADMIN_EMAIL,
    );
    return creator?.public_user_data?.identifier ?? null;
  } catch {
    return null;
  }
}

export async function fireWelcomeEmailForOrg(orgId: string): Promise<void> {
  try {
    if (!CLERK_SECRET_KEY) return;

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
      console.warn(`[ClerkOrgHelpers] Could not fetch members for org ${orgId}: ${res.status}`);
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
      console.warn(`[ClerkOrgHelpers] No real creator found in org ${orgId} memberships`);
      return;
    }

    await fireEmailEvent('user.signup', {
      email: creator.public_user_data.identifier,
      first_name: creator.public_user_data.first_name ?? '',
      last_name: creator.public_user_data.last_name ?? '',
      clerk_user_id: creator.public_user_data.user_id,
    });

    console.log(
      `[ClerkOrgHelpers] Welcome email queued for org ${orgId} → ${creator.public_user_data.identifier}`,
    );
  } catch (err) {
    console.error(`[ClerkOrgHelpers] fireWelcomeEmailForOrg error for org ${orgId}:`, err);
  }
}