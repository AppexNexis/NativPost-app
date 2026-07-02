// src/app/api/cron/seed-trending/process/route.ts
import { NextRequest, NextResponse } from 'next/server';

import { hydrateTikTokMedia } from '@/lib/template-seed/hydrate-tiktok';
import { processPendingApifyRuns } from '@/lib/template-seed/providers/apify-async';

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const hydrate = searchParams.get('hydrate') !== 'false';
  const hydrateLimit = Number(searchParams.get('hydrateLimit')) || 50;

  const cloudinary = {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    apiSecret: process.env.CLOUDINARY_API_SECRET!,
  };

  const results = await processPendingApifyRuns({
    apifyToken: process.env.APIFY_TOKEN!,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
    cloudinary,
  });

  // Bridge tiktok.com page URLs → raw mp4 → Cloudinary so the queue
  // preview can actually play. Runs whether the Apify step processed
  // anything this cycle or not — this doubles as an ambient backfill.
  let hydration = null;
  if (hydrate) {
    try {
      hydration = await hydrateTikTokMedia({
        cloudinary,
        tikwmApiKey: process.env.TIKWM_API_KEY,
        limit: hydrateLimit,
      });
    } catch (err) {
      console.error('[seed-trending/process] hydration failed:', err);
      hydration = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  return NextResponse.json({ success: true, results, hydration });
}
