/**
 * GET /api/social-accounts/tiktok/creator-info
 *
 * Fetches TikTok creator_info for the org's connected TikTok account.
 * Called client-side when the TikTok publish modal opens — required by
 * TikTok's guidelines to always fetch fresh creator info before showing
 * the publish UI.
 *
 * Returns:
 *   nickname, avatarUrl, privacyLevelOptions, commentDisabled,
 *   duetDisabled, stitchDisabled, maxVideoDurationSec
 */

import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { socialAccountSchema } from '@/models/Schema';

const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || '';
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || '';

async function refreshTikTokToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string } | null> {
  try {
    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: TIKTOK_CLIENT_KEY,
        client_secret: TIKTOK_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });
    const data = await res.json() as { access_token?: string; refresh_token?: string };
    if (!data.access_token) return null;
    return { accessToken: data.access_token, refreshToken: data.refresh_token || refreshToken };
  } catch { return null; }
}

export async function GET(_request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  // Find connected TikTok account
  const [account] = await db
    .select()
    .from(socialAccountSchema)
    .where(and(
      eq(socialAccountSchema.orgId, orgId!),
      eq(socialAccountSchema.platform, 'tiktok'),
      eq(socialAccountSchema.isActive, true),
    ))
    .limit(1);

  if (!account?.accessToken) {
    return NextResponse.json(
      { error: 'No connected TikTok account. Connect TikTok in Connections first.' },
      { status: 404 },
    );
  }

  let token = account.accessToken;

  // Fetch creator_info — required before every publish attempt
  const fetchCreatorInfo = async (accessToken: string) => {
    const res = await fetch(
      'https://open.tiktokapis.com/v2/post/publish/creator_info/query/',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({}),
      },
    );
    return { res, data: await res.json() as Record<string, unknown> };
  };

  let { res, data } = await fetchCreatorInfo(token);

  // Token expired — refresh and retry once
  if (res.status === 401 || (data as { error?: { code?: string } }).error?.code === 'access_token_invalid') {
    if (!account.refreshToken) {
      return NextResponse.json(
        { error: 'TikTok session expired. Please reconnect your TikTok account in Connections.' },
        { status: 401 },
      );
    }

    const refreshed = await refreshTikTokToken(account.refreshToken);
    if (!refreshed) {
      return NextResponse.json(
        { error: 'TikTok session expired. Please reconnect your TikTok account in Connections.' },
        { status: 401 },
      );
    }

    // Save refreshed token
    await db
      .update(socialAccountSchema)
      .set({ accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken })
      .where(eq(socialAccountSchema.id, account.id));

    token = refreshed.accessToken;
    const retried = await fetchCreatorInfo(token);
    res = retried.res;
    data = retried.data;
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: 'Could not fetch TikTok account info. Please try again.' },
      { status: 502 },
    );
  }

  const d = (data as {
    data?: {
      nickname?: string;
      avatar_url?: string;
      privacy_level_options?: string[];
      comment_disabled?: boolean;
      duet_disabled?: boolean;
      stitch_disabled?: boolean;
      max_video_post_duration_sec?: number;
      creator_username?: string;
    }
  }).data;

  if (!d) {
    return NextResponse.json(
      { error: 'Could not read TikTok account info. Please try again.' },
      { status: 502 },
    );
  }

  return NextResponse.json({
    nickname: d.nickname || d.creator_username || 'TikTok User',
    avatarUrl: d.avatar_url || null,
    privacyLevelOptions: d.privacy_level_options || ['SELF_ONLY'],
    commentDisabled: d.comment_disabled ?? false,
    duetDisabled: d.duet_disabled ?? false,
    stitchDisabled: d.stitch_disabled ?? false,
    maxVideoDurationSec: d.max_video_post_duration_sec ?? 600,
  });
}