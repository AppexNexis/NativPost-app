import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { decodePlatformFromState, exchangeCodeForTokens, PLATFORM_CONFIGS, type SocialPlatform } from '@/lib/social-oauth';
import { getDb } from '@/libs/DB';
import { organizationSchema, socialAccountSchema } from '@/models/Schema';
import { resolveAndSaveWhatsAppAccount } from '@/lib/whatsapp-callback';

// const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

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

  const platform = decodePlatformFromState(state);

  if (!platform) {
    return NextResponse.redirect(
      new URL('/dashboard/connections?error=invalid_state', request.url),
    );
  }

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

  // ── WhatsApp: special handling ─────────────────────────────────────────────
  // WhatsApp requires resolving the WABA ID and phone number ID after token
  // exchange. resolveAndSaveWhatsAppAccount() handles the full DB write
  // (including metadata.phoneNumberId) so we return early here.
  if (platform === 'whatsapp') {
    const saved = await resolveAndSaveWhatsAppAccount(
      orgId!,
      tokens.accessToken,
      tokens.refreshToken,
    );
    if (!saved) {
      return NextResponse.redirect(
        new URL('/dashboard/connections?error=whatsapp_resolve_failed', request.url),
      );
    }
    return NextResponse.redirect(
      new URL('/dashboard/connections?success=whatsapp', request.url),
    );
  }
  // ──────────────────────────────────────────────────────────────────────────

  try {
    const profile = await fetchPlatformProfile(platform, tokens.accessToken);
    const config = PLATFORM_CONFIGS[platform];
    if (!config) {
      return NextResponse.redirect(
        new URL('/dashboard/connections?error=invalid_platform', request.url),
      );
    }
    const accountType = profile?.type ?? config?.accountType ?? 'personal';

    // Use page token if available (Facebook/Instagram), otherwise use the OAuth token
    const effectiveAccessToken = profile?.pageAccessToken ?? tokens.accessToken;

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
          accessToken: effectiveAccessToken,
          refreshToken: tokens.refreshToken ?? null,
          tokenExpiresAt,
          profileImageUrl: profile?.imageUrl ?? null,
          accountType,
          isActive: true,
          // metadata is not set here — only WhatsApp uses it, handled above
        })
        .where(eq(socialAccountSchema.id, existing[0].id));
    } else {
      await db.insert(socialAccountSchema).values({
        orgId: orgId!,
        platform,
        platformUserId: profile?.id ?? null,
        platformUsername: profile?.username ?? null,
        accessToken: effectiveAccessToken,
        refreshToken: tokens.refreshToken ?? null,
        tokenExpiresAt,
        accountType,
        profileImageUrl: profile?.imageUrl ?? null,
        isActive: true,
        // metadata is null for all non-WhatsApp platforms
        metadata: null,
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
  pageAccessToken?: string;
};

async function fetchPlatformProfile(
  platform: SocialPlatform,
  accessToken: string,
): Promise<PlatformProfile | null> {
  try {
    switch (platform) {
      case 'facebook': {
        const accountsRes = await fetch(
          `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,picture&access_token=${accessToken}`,
        );
        const accountsData = await accountsRes.json();
        let page = accountsData.data?.[0];

        if (!page) {
          console.log('[Facebook] /me/accounts returned empty — fetching page token directly');
          const pageId = '1094955300358244';
          const pageRes = await fetch(
            `https://graph.facebook.com/v21.0/${pageId}?fields=id,name,access_token,picture&access_token=${accessToken}`,
          );
          const pageData = await pageRes.json();
          console.log('[Facebook] Direct page fetch:', JSON.stringify(pageData));
          if (pageData.access_token) {
            page = {
              id: pageData.id,
              name: pageData.name,
              access_token: pageData.access_token,
              picture: pageData.picture,
            };
          }
        }

        if (page) {
          return {
            id: page.id,
            username: page.name,
            type: 'page',
            imageUrl: page.picture?.data?.url,
            pageAccessToken: page.access_token,
          };
        }

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

      case 'instagram': {
        const accountsRes = await fetch(
          `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${accessToken}`,
        );
        const accountsData = await accountsRes.json();
        let page = accountsData.data?.[0];

        if (!page) {
          console.log('[Instagram] /me/accounts returned empty — fetching page directly');
          const pageId = '1094955300358244';
          const pageRes = await fetch(
            `https://graph.facebook.com/v21.0/${pageId}?fields=id,name,access_token,instagram_business_account&access_token=${accessToken}`,
          );
          const pageData = await pageRes.json();
          console.log('[Instagram] Direct page fetch:', JSON.stringify(pageData));
          if (pageData.access_token) {
            page = {
              id: pageData.id,
              name: pageData.name,
              access_token: pageData.access_token,
              instagram_business_account: pageData.instagram_business_account,
            };
          }
        }

        if (page?.instagram_business_account?.id) {
          const igId = page.instagram_business_account.id;
          const igRes = await fetch(
            `https://graph.facebook.com/v21.0/${igId}?fields=id,name,username,profile_picture_url&access_token=${page.access_token}`,
          );
          const igData = await igRes.json();
          console.log('[Instagram] IG Business Account:', JSON.stringify(igData));
          return {
            id: igData.id,
            username: igData.username ?? igData.name,
            type: 'personal',
            imageUrl: igData.profile_picture_url,
            pageAccessToken: page.access_token,
          };
        }

        console.warn('[Instagram] No instagram_business_account found on page');
        const res = await fetch(
          `https://graph.facebook.com/v21.0/me?fields=id,name,picture&access_token=${accessToken}`,
        );
        const data = await res.json();
        return {
          id: data.id,
          username: data.name,
          type: 'personal',
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
        const meRes = await fetch('https://api.linkedin.com/v2/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const meData = await meRes.json();

        const orgsRes = await fetch(
          'https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED',
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

      case 'snapchat': {
        const meRes = await fetch(
          'https://kit.snapchat.com/v1/me?query={me{externalId,displayName}}',
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const meData = await meRes.json();
        const displayName = meData.data?.me?.displayName ?? '';
        const externalId = meData.data?.me?.externalId ?? '';

        const profileRes = await fetch(
          'https://businessapi.snapchat.com/v1/me/organizations',
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        console.log('[Snapchat] Orgs status:', profileRes.status);

        if (profileRes.ok) {
          const profileData = await profileRes.json();
          console.log('[Snapchat] Orgs data:', JSON.stringify(profileData));
          const orgId = profileData.organizations?.[0]?.organization?.id;

          if (orgId) {
            const pubRes = await fetch(
              `https://businessapi.snapchat.com/v1/organizations/${orgId}/public_profiles`,
              { headers: { Authorization: `Bearer ${accessToken}` } },
            );
            console.log('[Snapchat] Public profiles status:', pubRes.status);
            if (pubRes.ok) {
              const pubData = await pubRes.json();
              console.log('[Snapchat] Public profiles data:', JSON.stringify(pubData));
              const profileId = pubData.public_profiles?.[0]?.public_profile?.id;
              if (profileId) {
                return { id: profileId, username: displayName, type: 'personal' };
              }
            }
          }
        }

        return { id: externalId, username: displayName, type: 'personal' };
      }

      // WhatsApp is handled before this function is called — never reaches here
      default:
        return null;
    }
  } catch (err) {
    console.error(`Failed to fetch ${platform} profile:`, err);
    return null;
  }
}