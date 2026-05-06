/**
 * POST /api/social-accounts/delete
 *
 * Meta calls this endpoint when a user requests deletion of their
 * data from your app via Facebook's "Off-Facebook Activity" tool.
 *
 * Meta sends a signed_request. We verify it, then either:
 *  - Delete the user's social account records, OR
 *  - Return a status URL if deletion is async/deferred
 *
 * We must return a confirmation_code and optionally a url where
 * Meta can show the user the deletion status.
 *
 * Docs: https://developers.facebook.com/docs/facebook-login/manually-build-a-login-flow#erasure-callback
 */

import crypto from 'node:crypto';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { eq } from 'drizzle-orm';
import { getDb } from '@/libs/DB';
import { socialAccountSchema } from '@/models/Schema';

function parseSignedRequest(
  signedRequest: string,
  appSecret: string,
): { user_id: string; algorithm: string } | null {
  try {
    const [encodedSig, payload] = signedRequest.split('.');

    if (!encodedSig || !payload) return null;

    const expectedSig = crypto
      .createHmac('sha256', appSecret)
      .update(payload)
      .digest('base64url');

    if (expectedSig !== encodedSig) {
      console.error('[Delete] Invalid signature');
      return null;
    }

    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf-8'),
    );

    return decoded;
  } catch (err) {
    console.error('[Delete] Failed to parse signed_request:', err);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) {
      console.error('[Delete] META_APP_SECRET not configured');
      return NextResponse.json({ success: false }, { status: 500 });
    }

    const body = await request.formData();
    const signedRequest = body.get('signed_request') as string | null;

    if (!signedRequest) {
      return NextResponse.json({ error: 'Missing signed_request' }, { status: 400 });
    }

    const data = parseSignedRequest(signedRequest, appSecret);
    if (!data?.user_id) {
      return NextResponse.json({ error: 'Invalid signed_request' }, { status: 400 });
    }

    const metaUserId = data.user_id;

    // Generate a unique confirmation code for this deletion request
    const confirmationCode = crypto
      .createHash('sha256')
      .update(`${metaUserId}-${Date.now()}`)
      .digest('hex')
      .slice(0, 16);

    console.log(`[Delete] Data deletion request for Meta user: ${metaUserId}, code: ${confirmationCode}`);

    const db = await getDb();

    // Delete all social account records linked to this Meta user ID
    await db
      .delete(socialAccountSchema)
      .where(eq(socialAccountSchema.platformUserId, metaUserId));

    console.log(`[Delete] Deleted social accounts for Meta user: ${metaUserId}`);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nativpost.com';

    // Meta requires this exact response shape
    return NextResponse.json({
      url: `${appUrl}/data-deletion?code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    });
  } catch (err) {
    console.error('[Delete] Error:', err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

/**
 * GET /api/social-accounts/delete
 *
 * Optional: Meta may GET this URL to verify it's reachable.
 * Return 200 so their validation check passes.
 */
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}