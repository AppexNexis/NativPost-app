// src/app/api/cron/seed-trending/process/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { processPendingApifyRuns } from '@/lib/template-seed/providers/apify-async';

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const results = await processPendingApifyRuns({
    apifyToken: process.env.APIFY_TOKEN!,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
      apiKey: process.env.CLOUDINARY_API_KEY!,
      apiSecret: process.env.CLOUDINARY_API_SECRET!,
    },
  });

  return NextResponse.json({ success: true, results });
}