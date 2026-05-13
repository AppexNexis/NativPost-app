import { createHmac, randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { socialAccountSchema } from '@/models/Schema';

import { and, eq } from 'drizzle-orm';
import { twitterRequestTokenStore } from '@/lib/twitter-request-token-store';

function oauthSign1a(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerKey: string,
  consumerSecret: string,
  tokenSecret = '',
  token?: string,
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: '1.0',
    ...params,
  };
  if (token) oauthParams.oauth_token = token;

  const allParams = { ...oauthParams };
  const sortedKeys = Object.keys(allParams).sort();
  const paramString = sortedKeys
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k]!)}`)
    .join('&');

  const baseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(paramString),
  ].join('&');

  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  const signature = createHmac('sha1', signingKey).update(baseString).digest('base64');
  oauthParams.oauth_signature = signature;

  const headerParts = Object.keys(oauthParams)
    .filter(k => k.startsWith('oauth_'))
    .sort()
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k]!)}"`)
    .join(', ');

  return `OAuth ${headerParts}`;
}

export async function GET(request: NextRequest) {
  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const { error, orgId } = await getAuthContext();
  if (error) return NextResponse.redirect(`${BASE_URL}/dashboard/connections?error=auth`);

  const { searchParams } = request.nextUrl;
  const oauthToken = searchParams.get('oauth_token');
  const oauthVerifier = searchParams.get('oauth_verifier');

  if (!oauthToken || !oauthVerifier) {
    return NextResponse.redirect(`${BASE_URL}/dashboard/connections?error=twitter_v1_callback`);
  }

  const requestTokenSecret = twitterRequestTokenStore.get(oauthToken);
  twitterRequestTokenStore.delete(oauthToken);

  if (!requestTokenSecret) {
    return NextResponse.redirect(`${BASE_URL}/dashboard/connections?error=twitter_v1_state`);
  }

  const consumerKey = process.env.TWITTER_CONSUMER_KEY!;
  const consumerSecret = process.env.TWITTER_CONSUMER_SECRET!;

  // Exchange request token for access token
  const accessTokenUrl = 'https://api.twitter.com/oauth/access_token';
  const authHeader = oauthSign1a(
    'POST',
    accessTokenUrl,
    { oauth_verifier: oauthVerifier },
    consumerKey,
    consumerSecret,
    requestTokenSecret,
    oauthToken,
  );

  const res = await fetch(accessTokenUrl, {
    method: 'POST',
    headers: { Authorization: authHeader },
  });

  if (!res.ok) {
    console.error('[Twitter 1.0a] access_token failed:', await res.text());
    return NextResponse.redirect(`${BASE_URL}/dashboard/connections?error=twitter_v1_token`);
  }

  const body = await res.text();
  const params = new URLSearchParams(body);
  const accessToken = params.get('oauth_token');
  const accessTokenSecret = params.get('oauth_token_secret');
  const userId = params.get('user_id');
  const screenName = params.get('screen_name');

  if (!accessToken || !accessTokenSecret) {
    return NextResponse.redirect(`${BASE_URL}/dashboard/connections?error=twitter_v1_token`);
  }

  try {
    const db = await getDb();

    // Upsert: update existing twitter account for this org, or insert new
    const existing = await db
      .select({ id: socialAccountSchema.id })
      .from(socialAccountSchema)
      .where(
        and(
          eq(socialAccountSchema.orgId, orgId!),
          eq(socialAccountSchema.platform, 'twitter'),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(socialAccountSchema)
        .set({
          oauthToken: accessToken,
          oauthTokenSecret: accessTokenSecret,
          platformUserId: userId || null,
          platformUsername: screenName || null,
          isActive: true,
        })
        .where(eq(socialAccountSchema.id, existing[0].id));
    } else {
      await db.insert(socialAccountSchema).values({
        orgId: orgId!,
        platform: 'twitter',
        platformUserId: userId || null,
        platformUsername: screenName || null,
        accessToken: null,   // OAuth 2.0 token — not obtained here
        oauthToken: accessToken,
        oauthTokenSecret: accessTokenSecret,
        isActive: true,
        accountType: 'personal',
      });
    }

    return NextResponse.redirect(`${BASE_URL}/dashboard/connections?success=twitter`);
  } catch (err) {
    console.error('[Twitter 1.0a] DB error:', err);
    return NextResponse.redirect(`${BASE_URL}/dashboard/connections?error=twitter_v1_db`);
  }
}