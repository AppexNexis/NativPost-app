// src/app/api/cron/seed-trending/start/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  startInstagramCarouselIngest,
  startInstagramIngest,
  startTikTokIngest,
  startTikTokSlideshowIngest,
} from '@/lib/template-seed/providers/apify-async';

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sources = (searchParams.get('sources') ?? 'instagram,tiktok').split(',');
  const limit = Number(searchParams.get('limit') ?? 15);
  const curationStatus = (searchParams.get('approve') === 'true' ? 'approved' : 'pending') as 'approved' | 'pending';
  const apifyToken = process.env.APIFY_TOKEN!;

  const started: Record<string, string> = {};

  if (sources.includes('instagram')) {
    started.instagram = await startInstagramIngest({
      apifyToken,
      limit,
      curationStatus,
      usernames: searchParams.get('instagramUsernames')?.split(','),
    });
  }
  if (sources.includes('tiktok')) {
    started.tiktok = await startTikTokIngest({
      apifyToken,
      limit,
      curationStatus,
      usernames: searchParams.get('tiktokUsernames')?.split(','),
    });
  }
  if (sources.includes('tiktok-slideshow')) {
    const urls = (searchParams.get('tiktokSlideshowUrls') ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(u => u.startsWith('http'));
    if (urls.length > 0) {
      started['tiktok-slideshow'] = await startTikTokSlideshowIngest({
        apifyToken,
        urls,
        limit,
        curationStatus,
      });
    }
  }
  if (sources.includes('instagram-carousel')) {
    // Profile-based carousel discovery. Pass comma-separated handles via
    // ?instagramCarouselUsernames=; the actor pulls each profile's recent
    // posts and groupInstagramCarousels() filters to sidecar posts only.
    const usernames = (searchParams.get('instagramCarouselUsernames') ?? '')
      .split(',')
      .map(s => s.trim().replace(/^@/, ''))
      .filter(Boolean);
    if (usernames.length > 0) {
      started['instagram-carousel'] = await startInstagramCarouselIngest({
        apifyToken,
        usernames,
        limit,
        curationStatus,
      });
    }
  }

  return NextResponse.json({ success: true, started });
}