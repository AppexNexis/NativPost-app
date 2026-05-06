/**
 * POST /api/social-accounts/deauthorize
 *
 * Meta calls this endpoint when a user removes your app from their
 * Facebook/Instagram account via Facebook's settings page.
 *
 * Meta sends a signed_request parameter. We verify the signature,
 * decode the payload, and deactivate the matching social account.
 *
 * Docs: https://developers.facebook.com/docs/facebook-login/manually-build-a-login-flow#deauth-callback
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

    // Verify signature
    const expectedSig = crypto
      .createHmac('sha256', appSecret)
      .update(payload)
      .digest('base64url');

    if (expectedSig !== encodedSig) {
      console.error('[Deauthorize] Invalid signature');
      return null;
    }

    // Decode payload
    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf-8'),
    );

    return decoded;
  } catch (err) {
    console.error('[Deauthorize] Failed to parse signed_request:', err);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) {
      console.error('[Deauthorize] META_APP_SECRET not configured');
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
    console.log(`[Deauthorize] Deauthorizing Meta user: ${metaUserId}`);

    const db = await getDb();

    // Mark matching social accounts as inactive
    await db
      .update(socialAccountSchema)
      .set({ isActive: false })
      .where(eq(socialAccountSchema.platformUserId, metaUserId));

    console.log(`[Deauthorize] Deactivated accounts for Meta user: ${metaUserId}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Deauthorize] Error:', err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}