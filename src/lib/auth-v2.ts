import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Gets the current user's org ID from Clerk OR from internal service headers.
 *
 * Browser requests: Clerk cookies (standard user auth)
 * Internal requests: Authorization: Bearer <NATIVPOST_ENGINE_API_KEY> + X-Org-Id: <org-id>
 *
 * This allows the campaign engine and other internal services to call API routes
 * without needing Clerk session cookies.
 */
export async function getAuthContext(request?: NextRequest) {
  // Try Clerk auth first (browser requests)
  const { userId, orgId } = await auth();

  if (userId && orgId) {
    return { error: null, orgId, userId };
  }

  // Fallback: internal service auth (campaign engine, automation runner, etc.)
  if (request) {
    const authHeader = request.headers.get('authorization');
    const orgIdHeader = request.headers.get('x-org-id');
    const apiKey = process.env.NATIVPOST_ENGINE_API_KEY || '';

    if (authHeader && orgIdHeader && apiKey) {
      const token = authHeader.replace(/^Bearer\s+/i, '');
      if (token === apiKey) {
        return { error: null, orgId: orgIdHeader, userId: 'service' };
      }
    }
  }

  return {
    error: NextResponse.json(
      { error: 'Unauthorized — sign in and select an organization' },
      { status: 401 },
    ),
    orgId: null,
    userId: null,
  };
}

/**
 * Helper for API routes that need to check both auth methods.
 * Usage in route handlers:
 *
 *   export async function POST(request: NextRequest) {
 *     const { error, orgId } = await getAuthContext(request);
 *     if (error) return error;
 *     // ... orgId is guaranteed to be a string here
 *   }
 */
export async function getAuthContextWithFallback(request: NextRequest) {
  return getAuthContext(request);
}
