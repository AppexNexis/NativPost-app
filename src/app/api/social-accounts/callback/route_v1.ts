import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { exchangeCodeForTokens, type SocialPlatform } from '@/lib/social-oauth';
// import { db } from '@/libs/DB';
import { getDb } from '@/libs/DB';
import { organizationSchema, socialAccountSchema } from '@/models/Schema';

// -----------------------------------------------------------
// GET /api/social-accounts/callback?code=...&state=platform:uuid
// OAuth callback — exchanges code for tokens, saves to DB
// -----------------------------------------------------------
export async function GET(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return NextResponse.redirect(
      new URL('/dashboard/connections?error=auth', request.url),
    );
  }

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const errorParam = request.nextUrl.searchParams.get('error');

  if (errorParam) {
    return NextResponse.redirect(
      new URL(`/dashboard/connections?error=${errorParam}`, request.url),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/dashboard/connections?error=missing_params', request.url),
    );
  }

  const platform = state.split(':')[0] as SocialPlatform;

  // -----------------------------------------------------------
  // SAFETY NET: Ensure org row exists before any FK-dependent insert.
  //
  // The Clerk webhook handles this in production, but it cannot
  // reach localhost during local dev — so the webhook never fires
  // and the org row never gets created. Without this upsert, every
  // social account connect attempt throws:
  //   "violates foreign key constraint social_account_org_id_organization_id_fk"
  //
  // onConflictDoNothing() makes this fully idempotent — if the row
  // already exists (webhook worked), this is a no-op.
  // -----------------------------------------------------------
  await db
    .insert(organizationSchema)
    .values({
      id: orgId!,
      plan: 'starter',
      planStatus: 'trialing',
      postsPerMonth: 20,
      platformsLimit: 3,
      setupFeePaid: false,
    })
    .onConflictDoNothing();

  // Exchange authorization code for access/refresh tokens
  const tokens = await exchangeCodeForTokens(platform, code, state);

  if (!tokens) {
    return NextResponse.redirect(
      new URL(`/dashboard/connections?error=token_exchange_failed&platform=${platform}`, request.url),
    );
  }

  try {
    // Fetch user profile from platform
    const profile = await fetchPlatformProfile(platform, tokens.accessToken);

    // Check if this platform is already connected for this org
    const existing = await db
      .select({ id: socialAccountSchema.id })
      .from(socialAccountSchema)
      .where(
        and(
          eq(socialAccountSchema.orgId, orgId!),
          eq(socialAccountSchema.platform, platform),
        ),
      )
      .limit(1);

    if (existing.length > 0 && existing[0]) {
      // Reconnect — update tokens on the existing row
      await db
        .update(socialAccountSchema)
        .set({
          platformUserId: profile?.id ?? null,
          platformUsername: profile?.username ?? null,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken ?? null,
          tokenExpiresAt: tokens.expiresIn
            ? new Date(Date.now() + tokens.expiresIn * 1000)
            : null,
          profileImageUrl: profile?.imageUrl ?? null,
          isActive: true,
          // updatedAt: new Date(),
        })
        .where(eq(socialAccountSchema.id, existing[0].id));
    } else {
      // New connection
      await db.insert(socialAccountSchema).values({
        orgId: orgId!,
        platform,
        platformUserId: profile?.id ?? null,
        platformUsername: profile?.username ?? null,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? null,
        tokenExpiresAt: tokens.expiresIn
          ? new Date(Date.now() + tokens.expiresIn * 1000)
          : null,
        accountType: profile?.type ?? 'personal',
        profileImageUrl: profile?.imageUrl ?? null,
        isActive: true,
      });
    }

    return NextResponse.redirect(
      new URL(`/dashboard/connections?success=${platform}`, request.url),
    );
  } catch (err) {
    console.error('Failed to save social account:', err);
    return NextResponse.redirect(
      new URL(`/dashboard/connections?error=save_failed&platform=${platform}`, request.url),
    );
  }
}

// -----------------------------------------------------------
// Fetch basic profile info from each platform
// -----------------------------------------------------------

type PlatformProfile = {
  id: string;
  username: string;
  type: string;
  imageUrl?: string;
};

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
        const res = await fetch(
          'https://api.x.com/2/users/me?user.fields=profile_image_url',
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
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
