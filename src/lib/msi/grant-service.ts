// DB wiring for authorization grants (docs §2, §4.1). Records the customer's
// signed, revocable authorization — the prerequisite for provisioning. Safe:
// this only stores the grant; it operates no accounts.

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { authorizationGrantSchema } from '@/models/Schema';

import type { GrantScope } from './grant';
import { isGrantActive } from './grant';

export type CreateGrantInput = {
  orgId: string;
  brandProfileId: string;
  grantVersion: string;
  signedByUserId: string;
  scope?: GrantScope;
  documentUrl?: string;
};

export async function createAuthorizationGrant(input: CreateGrantInput) {
  const [grant] = await db
    .insert(authorizationGrantSchema)
    .values({
      orgId: input.orgId,
      brandProfileId: input.brandProfileId,
      grantVersion: input.grantVersion,
      signedByUserId: input.signedByUserId,
      scope: input.scope ?? {},
      documentUrl: input.documentUrl,
    })
    .returning();

  if (!grant) {
    throw new Error('failed to create authorization grant');
  }
  return grant;
}

export async function revokeAuthorizationGrant(grantId: string, orgId: string) {
  const [grant] = await db
    .update(authorizationGrantSchema)
    .set({ status: 'revoked', revokedAt: new Date() })
    .where(
      and(
        eq(authorizationGrantSchema.id, grantId),
        eq(authorizationGrantSchema.orgId, orgId),
      ),
    )
    .returning();

  return grant ?? null;
}

/** The active grant for a brand, or null. Used by provisioning as the gate. */
export async function getActiveGrant(orgId: string, brandProfileId: string) {
  const [grant] = await db
    .select()
    .from(authorizationGrantSchema)
    .where(
      and(
        eq(authorizationGrantSchema.orgId, orgId),
        eq(authorizationGrantSchema.brandProfileId, brandProfileId),
        eq(authorizationGrantSchema.status, 'active'),
      ),
    )
    .limit(1);

  return grant && isGrantActive(grant) ? grant : null;
}
