import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { exchangeCodeForTokens, PLATFORM_CONFIGS, type SocialPlatform } from '@/lib/social-oauth';
import { db } from '@/libs/DB';
import { organizationSchema, socialAccountSchema } from '@/models/Schema';

export async function GET(request: NextRequest) {
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

  // Safety net: ensure org row exists before FK-dependent insert
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

  const tokens = await exchangeCodeForTokens(platform, code, state);

  if (!tokens) {
    return NextResponse.redirect(
      new URL(`/dashboard/connections?error=token_exchange_failed&platform=${platform}`, request.url),
    );
  }

  try {
    const profile = await fetchPlatformProfile(platform, tokens.accessToken);
    const config = PLATFORM_CONFIGS[platform];
    const accountType = profile?.type ?? config?.accountType ?? 'personal';

    // For platforms that support multiple accounts (e.g. linkedin + linkedin_page),
    // match on both platform name AND account type to allow both to coexist.
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

    const tokenExpiresAt = tokens.expiresIn
      ? new Date(Date.now() + tokens.expiresIn * 1000)
      : null;

    if (existing.length > 0 && existing[0]) {
      await db
        .update(socialAccountSchema)
        .set({
          platformUserId: profile?.id ?? null,
          platformUsername: profile?.username ?? null,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken ?? null,
          tokenExpiresAt,
          profileImageUrl: profile?.imageUrl ?? null,
          accountType,
          isActive: true,
        })
        .where(eq(socialAccountSchema.id, existing[0].id));
    } else {
      await db.insert(socialAccountSchema).values({
        orgId: orgId!,
        platform,
        platformUserId: profile?.id ?? null,
        platformUsername: profile?.username ?? null,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? null,
        tokenExpiresAt,
        accountType,
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
// Platform profile fetchers
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
          type: platform === 'facebook' ? 'page' : 'personal',
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

      case 'linkedin_page': {
        // First get the member's URN, then list their admin organizations
        const meRes = await fetch('https://api.linkedin.com/v2/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const meData = await meRes.json();

        // Fetch organizations the user administers
        const orgsRes = await fetch(
          `https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'X-Restli-Protocol-Version': '2.0.0',
            },
          },
        );
        const orgsData = await orgsRes.json();
        const firstOrgUrn = orgsData?.elements?.[0]?.organization;

        if (firstOrgUrn) {
          // Fetch the organization details
          const orgId = firstOrgUrn.replace('urn:li:organization:', '');
          const orgRes = await fetch(
            `https://api.linkedin.com/v2/organizations/${orgId}?projection=(id,localizedName,logoV2)`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'X-Restli-Protocol-Version': '2.0.0',
              },
            },
          );
          const orgData = await orgRes.json();
          return {
            id: firstOrgUrn,
            username: orgData.localizedName || `Organization ${orgId}`,
            type: 'organization',
            imageUrl: undefined,
          };
        }

        // Fall back to the member's own profile if no org found
        return {
          id: meData.sub,
          username: `${meData.name} (no admin orgs found)`,
          type: 'organization',
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

      case 'youtube': {
        const res = await fetch(
          'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const data = await res.json();
        const channel = data.items?.[0];
        return {
          id: channel?.id ?? '',
          username: channel?.snippet?.title ?? 'YouTube Channel',
          type: 'personal',
          imageUrl: channel?.snippet?.thumbnails?.default?.url,
        };
      }

      case 'threads': {
        const res = await fetch(
          `https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url&access_token=${accessToken}`,
        );
        const data = await res.json();
        return {
          id: data.id,
          username: data.username,
          type: 'personal',
          imageUrl: data.threads_profile_picture_url,
        };
      }

      case 'pinterest': {
        const res = await fetch('https://api.pinterest.com/v5/user_account', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();
        return {
          id: data.username ?? data.id ?? '',
          username: data.username ?? '',
          type: 'personal',
          imageUrl: data.profile_image,
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
