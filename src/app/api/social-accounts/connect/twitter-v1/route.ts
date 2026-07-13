import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { twitterRequestTokenStore } from '@/lib/twitter-request-token-store';

import { createHmac, randomBytes } from 'node:crypto';


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

export async function GET(_request: NextRequest) {
  const { error } = await getAuthContext();
  if (error) return error;

  const consumerKey = process.env.TWITTER_CONSUMER_KEY;
  const consumerSecret = process.env.TWITTER_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    return NextResponse.json({ error: 'Twitter OAuth 1.0a not configured' }, { status: 400 });
  }

  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const callbackUrl = `${BASE_URL}/api/social-accounts/callback/twitter-v1`;

  const requestTokenUrl = 'https://api.twitter.com/oauth/request_token';
  const authHeader = oauthSign1a(
    'POST',
    requestTokenUrl,
    { oauth_callback: callbackUrl },
    consumerKey,
    consumerSecret,
  );

  const res = await fetch(requestTokenUrl, {
    method: 'POST',
    headers: { Authorization: authHeader },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[Twitter 1.0a] request_token failed:', text);
    return NextResponse.redirect(`${BASE_URL}/dashboard/social-accounts?error=twitter_v1_init`);
  }

  const body = await res.text();
  const params = new URLSearchParams(body);
  const oauthToken = params.get('oauth_token');
  const oauthTokenSecret = params.get('oauth_token_secret');

  if (!oauthToken || !oauthTokenSecret) {
    return NextResponse.redirect(`${BASE_URL}/dashboard/social-accounts?error=twitter_v1_init`);
  }

  // Store secret keyed by request token — retrieved in callback
  twitterRequestTokenStore.set(oauthToken, oauthTokenSecret);

  return NextResponse.redirect(
    `https://api.twitter.com/oauth/authorize?oauth_token=${oauthToken}`,
  );
}