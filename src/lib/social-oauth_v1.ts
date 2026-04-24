/**
 * Social Platform OAuth Configuration
 */

import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';

export type SocialPlatform =
  | 'instagram'
  | 'facebook'
  | 'linkedin'
  | 'linkedin_page'
  | 'twitter'
  | 'tiktok'
  | 'youtube'
  | 'threads'
  | 'pinterest';

// -----------------------------------------------------------
// PKCE storage (in-memory, per-server-instance)
// -----------------------------------------------------------
const pkceStore = new Map<string, string>();

function generateCodeVerifier(): string {
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
  accountType: 'personal' | 'page' | 'organization';
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
    accountType: 'page',
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
    accountType: 'personal',
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
    accountType: 'personal',
  },
  linkedin_page: {
    name: 'LinkedIn Page',
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scopes: ['openid', 'profile', 'w_member_social', 'w_organization_social', 'r_organization_social'],
    clientIdEnv: 'LINKEDIN_PAGE_CLIENT_ID',
    clientSecretEnv: 'LINKEDIN_PAGE_CLIENT_SECRET',
    scopeSeparator: ' ',
    pkceMethod: 'none',
    accountType: 'organization',
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
    accountType: 'personal',
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
    accountType: 'personal',
  },
  youtube: {
    name: 'YouTube',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    scopeSeparator: ' ',
    pkceMethod: 'S256',
    accountType: 'personal',
  },
  threads: {
    name: 'Threads',
    authUrl: 'https://threads.net/oauth/authorize',
    tokenUrl: 'https://graph.threads.net/oauth/access_token',
    scopes: ['threads_basic', 'threads_content_publish'],
    clientIdEnv: 'THREADS_APP_ID',
    clientSecretEnv: 'THREADS_APP_SECRET',
    scopeSeparator: ',',
    pkceMethod: 'none',
    accountType: 'personal',
  },
  pinterest: {
    name: 'Pinterest',
    authUrl: 'https://www.pinterest.com/oauth/',
    tokenUrl: 'https://api.pinterest.com/v5/oauth/token',
    scopes: ['boards:read', 'pins:read', 'pins:write'],
    clientIdEnv: 'PINTEREST_CLIENT_ID',
    clientSecretEnv: 'PINTEREST_CLIENT_SECRET',
    scopeSeparator: ',',
    pkceMethod: 'none',
    accountType: 'personal',
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

  if (platform === 'tiktok') {
    params.set('client_key', clientId);
  } else {
    params.set('client_id', clientId);
  }

  // YouTube needs access_type=offline for refresh tokens
  if (platform === 'youtube') {
    params.set('access_type', 'offline');
    params.set('prompt', 'consent');
  }

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

  if (platform === 'twitter') {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  } else if (platform === 'tiktok') {
    body.client_key = clientId;
    body.client_secret = clientSecret;
  } else if (platform === 'pinterest') {
    // Pinterest uses HTTP Basic Auth
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  } else {
    body.client_id = clientId;
    body.client_secret = clientSecret;
  }

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
