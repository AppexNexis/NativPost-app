import { NextRequest, NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { db } from '@/libs/DB';
import { socialAccountSchema } from '@/models/Schema';
import { exchangeCodeForTokens, type SocialPlatform } from '@/lib/social-oauth';

// -----------------------------------------------------------
// GET /api/social-accounts/callback?code=...&state=platform:uuid
// OAuth callback — exchanges code for tokens, saves to DB
// -----------------------------------------------------------
export async function GET(request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    // Redirect to social accounts page with error
    return NextResponse.redirect(
      new URL('/dashboard/social-accounts?error=auth', request.url),
    );
  }

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const errorParam = request.nextUrl.searchParams.get('error');

  if (errorParam) {
    return NextResponse.redirect(
      new URL(`/dashboard/social-accounts?error=${errorParam}`, request.url),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/dashboard/social-accounts?error=missing_params', request.url),
    );
  }

  // Extract platform from state (format: "platform:uuid")
  const platform = state.split(':')[0] as SocialPlatform;

  // Exchange code for tokens
  const tokens = await exchangeCodeForTokens(platform, code);

  if (!tokens) {
    return NextResponse.redirect(
      new URL(`/dashboard/social-accounts?error=token_exchange_failed&platform=${platform}`, request.url),
    );
  }

  try {
    // Fetch user profile from platform to get username/ID
    const profile = await fetchPlatformProfile(platform, tokens.accessToken);

    // Save to database
    await db.insert(socialAccountSchema).values({
      orgId: orgId!,
      platform,
      platformUserId: profile?.id || null,
      platformUsername: profile?.username || null,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || null,
      tokenExpiresAt: tokens.expiresIn
        ? new Date(Date.now() + tokens.expiresIn * 1000)
        : null,
      accountType: profile?.type || 'page',
      profileImageUrl: profile?.imageUrl || null,
      isActive: true,
    });

    return NextResponse.redirect(
      new URL(`/dashboard/social-accounts?success=${platform}`, request.url),
    );
  } catch (err) {
    console.error('Failed to save social account:', err);
    return NextResponse.redirect(
      new URL(`/dashboard/social-accounts?error=save_failed&platform=${platform}`, request.url),
    );
  }
}

// -----------------------------------------------------------
// Fetch basic profile info from each platform
// -----------------------------------------------------------

interface PlatformProfile {
  id: string;
  username: string;
  type: string;
  imageUrl?: string;
}

async function fetchPlatformProfile(
  platform: SocialPlatform,
  accessToken: string,
): Promise<PlatformProfile | null> {
  try {
    switch (platform) {
      case 'facebook':
      case 'instagram': {
        const res = await fetch(
          `https://graph.facebook.com/v21.0/me?fields=id,name,picture&access_token=${accessToken}`,
        );
        const data = await res.json();
        return {
          id: data.id,
          username: data.name,
          type: 'page',
          imageUrl: data.picture?.data?.url,
        };
      }
      case 'linkedin': {
        const res = await fetch('https://api.linkedin.com/v2/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();
        return {
          id: data.sub,
          username: data.name,
          type: 'personal',
          imageUrl: data.picture,
        };
      }
      case 'twitter': {
        const res = await fetch('https://api.x.com/2/users/me?user.fields=profile_image_url', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();
        return {
          id: data.data?.id,
          username: data.data?.username,
          type: 'personal',
          imageUrl: data.data?.profile_image_url,
        };
      }
      case 'tiktok': {
        const res = await fetch(
          'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url',
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const data = await res.json();
        return {
          id: data.data?.user?.open_id,
          username: data.data?.user?.display_name,
          type: 'personal',
          imageUrl: data.data?.user?.avatar_url,
        };
      }
      default:
        return null;
    }
  } catch (err) {
    console.error(`Failed to fetch ${platform} profile:`, err);
    return null;
  }
}
