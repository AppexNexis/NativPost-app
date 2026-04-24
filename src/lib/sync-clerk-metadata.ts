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
    // Non-fatal — DB is source of truth. Log and continue.
    console.error(`[SyncClerk] Failed to sync org=${orgId}:`, err);
  }
}
