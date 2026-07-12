/**
 * POST /api/brand-profile/generate-angles
 *
 * Standalone angle generation for the description-mode onboarding path
 * (the extract route calls the helper directly). Body: { profile }.
 * Returns { angles }.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { generateContentAnglesFromProfile } from '@/lib/onboarding/generate-content-angles';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { error } = await getAuthContext();
  if (error) return error;

  let body: { profile?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const profile = body.profile ?? {};
  const angles = await generateContentAnglesFromProfile(profile as any);

  const res = NextResponse.json({ angles }, { status: 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
