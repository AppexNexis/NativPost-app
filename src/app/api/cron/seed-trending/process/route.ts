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
  // Default lowered from 50 → 10 to stay under Vercel's 300s function cap
  // when processing an Apify run + hydration in the same invocation.
  // Cloudinary sync transcode runs ~10-20s per item; 10 keeps us at ~2min
  // for hydration alone, leaving headroom for the slideshow/carousel path.
  // Callers can override with ?hydrateLimit=N when running standalone.
  const hydrateLimit = Number(searchParams.get('hydrateLimit')) || 10;
  // Per-invocation cap on Apify template uploads. Each IG carousel = up
  // to 10 slides × ~3s Cloudinary = ~30s; 6 templates ≈ 3min worst case,
  // leaves headroom under the 300s Vercel timeout. Overridable via query.
  const maxTemplates = Number(searchParams.get('maxTemplates')) || 6;

  const cloudinary = {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    apiSecret: process.env.CLOUDINARY_API_SECRET!,
  };

  const results = await processPendingApifyRuns({
    apifyToken: process.env.APIFY_TOKEN!,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
    cloudinary,
    maxTemplatesPerInvocation: maxTemplates,
  });

  // If any run is 'partial' we're actively draining a large dataset —
  // skip the ambient hydration bridge on this call to reserve compute
  // for the next /process invocation. Once all runs are 'processed',
  // hydration resumes as normal.
  const anyPartial = results.some(r => r.outcome === 'partial');
  const skipHydrateThisRun = anyPartial;

  // Bridge tiktok.com page URLs → raw mp4 → Cloudinary so the queue
  // preview can actually play. Runs whether the Apify step processed
  // anything this cycle or not — this doubles as an ambient backfill.
  let hydration = null;
  if (hydrate && !skipHydrateThisRun) {
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
