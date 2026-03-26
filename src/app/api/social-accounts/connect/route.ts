import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getOAuthUrl, type SocialPlatform } from '@/lib/social-oauth';

// -----------------------------------------------------------
// GET /api/social-accounts/connect?platform=instagram
// Redirects user to the platform's OAuth authorization page
// -----------------------------------------------------------
export async function GET(request: NextRequest) {
  const { error } = await getAuthContext();
  if (error) {
    return error;
  }

  const platform = request.nextUrl.searchParams.get('platform') as SocialPlatform | null;

  if (!platform) {
    return NextResponse.json({ error: 'Missing platform parameter' }, { status: 400 });
  }

  // getOAuthUrl is now async (for S256 PKCE hash generation)
  const url = await getOAuthUrl(platform);

  if (!url) {
    return NextResponse.json(
      { error: `Platform "${platform}" is not configured. Add API credentials to your environment.` },
      { status: 400 },
    );
  }

  return NextResponse.redirect(url);
}
