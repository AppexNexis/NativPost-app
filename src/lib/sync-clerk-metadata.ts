/**
 * syncBillingToClerk
 *
 * Writes planStatus into the Clerk organization's publicMetadata so it's
 * embedded in the session JWT. Middleware can then read it instantly with
 * zero DB calls — eliminating the subscribe-page flicker.
 *
 * Call this every time planStatus changes in the DB.
 */

import { clerkClient } from '@clerk/nextjs/server';

export async function syncBillingToClerk(
  orgId: string,
  planStatus: string,
  plan: string,
): Promise<void> {
  try {
    const clerk = await clerkClient();
    await clerk.organizations.updateOrganizationMetadata(orgId, {
      publicMetadata: {
        planStatus,
        plan,
        billingUpdatedAt: new Date().toISOString(),
      },
    });
    console.log(`[SyncClerk] org=${orgId} planStatus=${planStatus} plan=${plan}`);
  } catch (err) {
    // Non-fatal - DB is source of truth. Log and continue.
    console.error(`[SyncClerk] Failed to sync org=${orgId}:`, err);
  }
}

/**
 * syncOnboardingCompleteToClerkUser
 *
 * Records that the current user has finished onboarding for a specific org.
 * Written to Clerk USER publicMetadata as a map keyed by orgId so the same
 * user can go through onboarding again for a fresh org later.
 *
 * Middleware reads sessionClaims.publicMetadata.onboardedOrgs[orgId] to
 * gate /dashboard access with zero DB roundtrip.
 */
export async function syncOnboardingCompleteToClerkUser(
  userId: string,
  orgId: string,
): Promise<void> {
  try {
    const clerk = await clerkClient();
    const user = await clerk.users.getUser(userId);
    const existing = (user.publicMetadata as any)?.onboardedOrgs ?? {};
    await clerk.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...(user.publicMetadata ?? {}),
        onboardedOrgs: {
          ...existing,
          [orgId]: new Date().toISOString(),
        },
      },
    });
    console.log(`[SyncClerk] user=${userId} org=${orgId} onboarding=complete`);
  } catch (err) {
    // Non-fatal - the DB onboarding_progress row is still authoritative.
    console.error(`[SyncClerk] Failed to sync onboarding user=${userId} org=${orgId}:`, err);
  }
}
