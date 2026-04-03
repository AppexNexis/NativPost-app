/**
 * Social Platform OAuth Configuration
 *
 * Each platform has its own OAuth flow. This file centralizes
 * the URLs, scopes, and credential handling.
 *
 * Callback URL to register on each platform:
 *   Development: http://localhost:3000/api/social-accounts/callback
 *   Production:  https://app.nativpost.com/api/social-accounts/callback
 */

import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';

export type SocialPlatform = 'instagram' | 'facebook' | 'linkedin' | 'twitter' | 'tiktok';

// -----------------------------------------------------------
// PKCE storage (in-memory, per-server-instance)
// In production, use Redis or a DB table for multi-instance support
// -----------------------------------------------------------
const pkceStore = new Map<string, string>();

function generateCodeVerifier(): string {
  // 43-128 chars, URL-safe base64
  return crypto.randomBytes(48).toString('base64url');
}

async function generateCodeChallengeS256(verifier: string): Promise<string> {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return hash.toString('base64url');
}

// -----------------------------------------------------------
// PLATFORM CONFIGS
// -----------------------------------------------------------
type PlatformConfig = {
  name: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientIdEnv: string;
  clientSecretEnv: string;
  scopeSeparator: string;
  pkceMethod: 'none' | 'plain' | 'S256';
};

export const PLATFORM_CONFIGS: Record<SocialPlatform, PlatformConfig> = {
  facebook: {
    name: 'Facebook',
    authUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
    scopes: ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list', 'pages_read_user_content'],
    clientIdEnv: 'META_APP_ID',
    clientSecretEnv: 'META_APP_SECRET',
    scopeSeparator: ',',
    pkceMethod: 'none',
  },
  instagram: {
    name: 'Instagram',
    authUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
    scopes: ['instagram_basic', 'instagram_content_publish', 'instagram_manage_insights', 'pages_show_list'],
    clientIdEnv: 'META_APP_ID',
    clientSecretEnv: 'META_APP_SECRET',
    scopeSeparator: ',',
    pkceMethod: 'none',
  },
  linkedin: {
    name: 'LinkedIn',
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scopes: ['openid', 'profile', 'w_member_social'],
    clientIdEnv: 'LINKEDIN_CLIENT_ID',
    clientSecretEnv: 'LINKEDIN_CLIENT_SECRET',
    scopeSeparator: ' ',
    pkceMethod: 'none',
  },
  twitter: {
    name: 'X / Twitter',
    authUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.x.com/2/oauth2/token',
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    clientIdEnv: 'TWITTER_CLIENT_ID',
    clientSecretEnv: 'TWITTER_CLIENT_SECRET',
    scopeSeparator: ' ',
    pkceMethod: 'S256',
  },
  tiktok: {
    name: 'TikTok',
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    scopes: ['user.info.basic', 'video.publish', 'video.upload'],
    clientIdEnv: 'TIKTOK_CLIENT_KEY',
    clientSecretEnv: 'TIKTOK_CLIENT_SECRET',
    scopeSeparator: ',',
    pkceMethod: 'S256',
  },
};

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// -----------------------------------------------------------
// GENERATE OAUTH URL
// -----------------------------------------------------------
export async function getOAuthUrl(platform: SocialPlatform): Promise<string | null> {
  const config = PLATFORM_CONFIGS[platform];
  if (!config) {
    return null;
  }

  const clientId = process.env[config.clientIdEnv];
  if (!clientId) {
    return null;
  }

  const callbackUrl = `${BASE_URL}/api/social-accounts/callback`;
  const state = `${platform}:${crypto.randomUUID()}`;

  const params = new URLSearchParams({
    response_type: 'code',
    redirect_uri: callbackUrl,
    scope: config.scopes.join(config.scopeSeparator),
    state,
  });

  // Set client_id (platform-specific key name)
  if (platform === 'tiktok') {
    params.set('client_key', clientId);
  } else {
    params.set('client_id', clientId);
  }

  // PKCE handling
  if (config.pkceMethod === 'S256') {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallengeS256(verifier);
    pkceStore.set(state, verifier);
    params.set('code_challenge', challenge);
    params.set('code_challenge_method', 'S256');
  } else if (config.pkceMethod === 'plain') {
    const verifier = generateCodeVerifier();
    pkceStore.set(state, verifier);
    params.set('code_challenge', verifier);
    params.set('code_challenge_method', 'plain');
  }

  return `${config.authUrl}?${params.toString()}`;
}

// -----------------------------------------------------------
// EXCHANGE CODE FOR TOKENS
// -----------------------------------------------------------
export async function exchangeCodeForTokens(
  platform: SocialPlatform,
  code: string,
  state?: string,
): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number } | null> {
  const config = PLATFORM_CONFIGS[platform];
  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];

  if (!clientId || !clientSecret) {
    return null;
  }

  const callbackUrl = `${BASE_URL}/api/social-accounts/callback`;

  const body: Record<string, string> = {
    code,
    redirect_uri: callbackUrl,
    grant_type: 'authorization_code',
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  // Platform-specific auth handling
  if (platform === 'twitter') {
    // Twitter uses HTTP Basic Auth with client credentials
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  } else if (platform === 'tiktok') {
    body.client_key = clientId;
    body.client_secret = clientSecret;
  } else {
    body.client_id = clientId;
    body.client_secret = clientSecret;
  }

  // PKCE verifier
  if (config.pkceMethod !== 'none' && state) {
    const verifier = pkceStore.get(state);
    if (verifier) {
      body.code_verifier = verifier;
      pkceStore.delete(state);
    }
  }

  try {
    const res = await fetch(config.tokenUrl, {
      method: 'POST',
      headers,
      body: new URLSearchParams(body).toString(),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Token exchange failed for ${platform}:`, errorText);
      return null;
    }

    const data = await res.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  } catch (err) {
    console.error(`Token exchange error for ${platform}:`, err);
    return null;
  }
}
