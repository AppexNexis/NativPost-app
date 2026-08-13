/**
 * Resolve the billing contact for an org from Clerk.
 *
 * Billing webhooks only carry an orgId, but the emails they trigger
 * (plan.upgraded, subscription.cancelled, trial.ending) and the Trustpilot
 * invitation all need a real person. This looks up the org's admin membership
 * and skips the NativPost staff account, which is added to every org for
 * support access and must never receive customer lifecycle mail.
 *
 * Extracted from the Stripe webhook so the Stripe and Polar webhooks cannot
 * drift apart on who gets billing mail. Every function here is best-effort:
 * a Clerk outage returns null rather than failing the webhook, because losing
 * an email is always better than losing a payment event.
 */

const CLERK_API = 'https://api.clerk.com/v1';
const STAFF_IDENTIFIER = 'admin@nativpost.com';

type ClerkMembership = {
  role: string;
  public_user_data: {
    identifier: string;
    first_name?: string;
    last_name?: string;
  };
};

/**
 * The org's non-staff admin membership, or null. One Clerk round-trip that
 * both getEmailForOrg and getNameForOrg build on — the original code fetched
 * the same list twice per webhook.
 */
async function getAdminMembership(orgId: string): Promise<ClerkMembership | null> {
  try {
    const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
    if (!CLERK_SECRET_KEY) {
      return null;
    }

    const res = await fetch(
      `${CLERK_API}/organizations/${orgId}/memberships?limit=10`,
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
    const members: ClerkMembership[] = json.data ?? json;
    return (
      members.find(
        m => m.role === 'admin' && m.public_user_data?.identifier !== STAFF_IDENTIFIER,
      ) ?? null
    );
  } catch {
    return null;
  }
}

/** The org admin's email address, or null when it can't be resolved. */
export async function getEmailForOrg(orgId: string): Promise<string | null> {
  const admin = await getAdminMembership(orgId);
  return admin?.public_user_data?.identifier ?? null;
}

/** The org admin's display name, or null. */
export async function getNameForOrg(orgId: string): Promise<string | null> {
  const admin = await getAdminMembership(orgId);
  if (!admin) {
    return null;
  }
  const { first_name, last_name } = admin.public_user_data;
  return [first_name, last_name].filter(Boolean).join(' ') || null;
}

/** Email and name in one Clerk round-trip — what the webhooks actually need. */
export async function getContactForOrg(
  orgId: string,
): Promise<{ email: string | null; name: string | null }> {
  const admin = await getAdminMembership(orgId);
  if (!admin) {
    return { email: null, name: null };
  }
  const { identifier, first_name, last_name } = admin.public_user_data;
  return {
    email: identifier ?? null,
    name: [first_name, last_name].filter(Boolean).join(' ') || null,
  };
}
