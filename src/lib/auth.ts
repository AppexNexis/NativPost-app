import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/**
 * Gets the current user's org ID from Clerk.
 * Returns { orgId, userId } or a 401 NextResponse if not authenticated.
 */
export async function getAuthContext() {
  const { userId, orgId } = await auth();

  if (!userId || !orgId) {
    return {
      error: NextResponse.json(
        { error: 'Unauthorized — sign in and select an organization' },
        { status: 401 },
      ),
      orgId: null,
      userId: null,
    };
  }

  return { error: null, orgId, userId };
}
