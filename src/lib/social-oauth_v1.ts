/**
 * Social Platform OAuth Configuration
 *
 * Each platform has its own OAuth flow. This file centralizes
 * the URLs, scopes, and credential handling.
 *
 * To enable a platform:
 * 1. Create a developer app on the platform
 * 2. Add the credentials to your .env.local
 * 3. Set the callback URL to: https://app.nativpost.com/api/social-accounts/callback?platform=<platform>
 */

import { Buffer } from 'node:buffer';

export type SocialPlatform = 'instagram' | 'facebook' | 'linkedin' | 'twitter' | 'tiktok';

// Add this at the top of the file
const pkceVerifiers = new Map<string, string>();

export function getPkceVerifier(state: string): string | undefined {
  return pkceVerifiers.get(state);
}

type PlatformConfig = {
  name: string;
  emoji: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientIdEnv: string;
  clientSecretEnv: string;
};

export const PLATFORM_CONFIGS: Record<SocialPlatform, PlatformConfig> = {
  facebook: {
    name: 'Facebook',
    emoji: '📘',
    authUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
    scopes: ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list', 'pages_read_user_content'],
    //  scopes: ['email', 'public_profile', 'pages_show_list'],
    clientIdEnv: 'META_APP_ID',
    clientSecretEnv: 'META_APP_SECRET',
  },
  instagram: {
    name: 'Instagram',
    emoji: '📸',
    authUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
    scopes: ['instagram_basic', 'instagram_content_publish', 'instagram_manage_insights', 'pages_show_list'],
    //  scopes: ['email', 'public_profile', 'instagram_basic'],
    clientIdEnv: 'META_APP_ID',
    clientSecretEnv: 'META_APP_SECRET',
  },
  linkedin: {
    name: 'LinkedIn',
    emoji: '💼',
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    // scopes: ['openid', 'profile', 'w_member_social', 'r_organization_social'],
    scopes: ['openid', 'profile', 'w_member_social'],
    clientIdEnv: 'LINKEDIN_CLIENT_ID',
    clientSecretEnv: 'LINKEDIN_CLIENT_SECRET',
  },
  twitter: {
    name: 'X / Twitter',
    emoji: '𝕏',
    authUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.x.com/2/oauth2/token',
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    clientIdEnv: 'TWITTER_CLIENT_ID',
    clientSecretEnv: 'TWITTER_CLIENT_SECRET',
  },
  tiktok: {
    name: 'TikTok',
    emoji: '🎵',
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    scopes: ['user.info.basic', 'video.publish', 'video.upload'],
    clientIdEnv: 'TIKTOK_CLIENT_KEY',
    clientSecretEnv: 'TIKTOK_CLIENT_SECRET',
  },
};

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

/**
 * Generates the OAuth authorization URL for a given platform.
 */
export function getOAuthUrl_v1(platform: SocialPlatform): string | null {
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
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: config.scopes.join(platform === 'twitter' ? ' ' : ','),
    state,
  });

  // Platform-specific params
  if (platform === 'twitter') {
    params.set('code_challenge', 'challenge');
    params.set('code_challenge_method', 'plain');
  }
  if (platform === 'tiktok') {
    params.delete('client_id');
    params.set('client_key', clientId);
  }

  return `${config.authUrl}?${params.toString()}`;
}

export function getOAuthUrl(platform: SocialPlatform): string | null {
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
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: config.scopes.join(platform === 'twitter' ? ' ' : ','),
    state,
  });

  if (platform === 'twitter') {
    // Generate a proper PKCE verifier
    const verifier = crypto.randomUUID().replace(/-/g, '')
      + crypto.randomUUID().replace(/-/g, '');
    pkceVerifiers.set(state, verifier); // store for callback
    params.set('code_challenge', verifier);
    params.set('code_challenge_method', 'plain');
  }

  if (platform === 'tiktok') {
    params.delete('client_id');
    params.set('client_key', clientId);
  }

  return `${config.authUrl}?${params.toString()}`;
}

/**
 * Exchanges an OAuth code for access + refresh tokens.
 */
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
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: callbackUrl,
    grant_type: 'authorization_code',
  };

  // Twitter uses basic auth
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  // if (platform === 'twitter') {
  //   headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  //   body.code_verifier = 'challenge';
  //   delete body.client_id;
  //   delete body.client_secret;
  // }

  if (platform === 'twitter') {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    // Use stored verifier instead of hardcoded 'challenge'
    const verifier = state ? getPkceVerifier(state) : undefined;
    body.code_verifier = verifier || '';
    pkceVerifiers.delete(state || ''); // clean up
    delete body.client_id;
    delete body.client_secret;
  }

  if (platform === 'tiktok') {
    delete body.client_id;
    body.client_key = clientId;
  }

  try {
    const res = await fetch(config.tokenUrl, {
      method: 'POST',
      headers,
      body: new URLSearchParams(body).toString(),
    });

    if (!res.ok) {
      console.error(`Token exchange failed for ${platform}:`, await res.text());
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
