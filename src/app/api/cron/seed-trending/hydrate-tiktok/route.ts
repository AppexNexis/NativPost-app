// src/app/api/cron/seed-trending/hydrate-tiktok/route.ts
//
// Standalone TikTok media backfill. Reads pending content_template rows
// whose sourcePlatform=tiktok and whose mediaUrl is missing or is a
// tiktok.com page URL, resolves the raw .mp4 via TikWM, and uploads it
// to Cloudinary. Safe to re-run — already-hydrated rows are skipped.
//
// Query params:
//   ?limit=50      (default 50, hard cap 200)
//   ?delayMs=750   (pause between TikWM calls; tune for rate limit)
//
// Auth: Bearer ${CRON_SECRET}

import { NextRequest, NextResponse } from 'next/server';

import { hydrateTikTokMedia } from '@/lib/template-seed/hydrate-tiktok';

// Backfill can process up to 200 items at ~5-6s each — raise the
// serverless timeout above Vercel's default 300s ceiling.
export const maxDuration = 800;

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get('limit')) || 50;
  const delayMs = Number(searchParams.get('delayMs')) || 750;

  const cloudinary = {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    apiSecret: process.env.CLOUDINARY_API_SECRET!,
  };

  try {
    const result = await hydrateTikTokMedia({
      cloudinary,
      tikwmApiKey: process.env.TIKWM_API_KEY,
      limit,
      delayMs,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[hydrate-tiktok] failed:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
