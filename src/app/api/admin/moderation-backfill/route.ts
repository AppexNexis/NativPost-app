/**
 * Moderation backfill — re-run Cloudinary moderation on assets that were
 * uploaded before the ingestion pipeline was moderation-aware.
 *
 * Uses Cloudinary's explicit API to trigger post-hoc moderation on an
 * already-uploaded asset. Verdicts are asynchronous for aws_rek_video, so
 * results arrive at /api/webhooks/cloudinary-moderation.
 *
 * POST body:
 *   {
 *     limit?: number       — max rows to touch (default 50, hard cap 200)
 *     provider?: 'tiktok' | 'instagram' | 'pexels' | ...
 *     resourceType?: 'video' | 'image'   — default 'video'
 *     dryRun?: boolean
 *   }
 *
 * Why this exists: the 2026-07-02 Cloudinary AUP incident was caused by
 * unmoderated seed content. Even after ingestion is fixed, the historical
 * rows still sit in Cloudinary un-scored. Running this once flushes the
 * backlog through moderation so we catch and hide anything that would trip
 * AUP again.
 */

import { auth } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';

import { getDb } from '@/libs/DB';
import { getModerationForProvider, getModerationWebhookUrl } from '@/lib/template-seed/moderation-policy';
import { contentTemplateSchema } from '@/models/Schema';

export const runtime = 'nodejs';
export const maxDuration = 300; // Vercel Hobby cap — see nativpost-vercel-timeout memory

const HARD_LIMIT = 200;
const DEFAULT_LIMIT = 50;
const DELAY_BETWEEN_CALLS_MS = 250; // stay under Cloudinary rate limits

async function requireAdmin() {
  const { userId, orgId, orgRole } = await auth();
  if (!userId || !orgId) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  const teamOrgId = process.env.NEXT_PUBLIC_NATIVPOST_TEAM_ORG_ID;
  if (!teamOrgId || orgId !== teamOrgId || orgRole !== 'org:admin') {
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }
  return { error: null };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  // Cloudinary SDK config — same values the seed pipeline uses.
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  const body = (await req.json().catch(() => ({}))) as {
    limit?: number;
    provider?: string;
    resourceType?: 'video' | 'image';
    dryRun?: boolean;
  };

  const limit = Math.min(HARD_LIMIT, Math.max(1, body.limit ?? DEFAULT_LIMIT));
  const resourceType = body.resourceType ?? 'video';
  const notificationUrl = getModerationWebhookUrl();

  const db = await getDb();

  // Target: rows with a Cloudinary public_id but no moderation verdict yet.
  // If public_id is missing, the webhook can't route the verdict back — skip
  // those (they'll be caught by re-ingestion instead).
  const conditions = [
    isNotNull(contentTemplateSchema.cloudinaryPublicId),
    or(
      isNull(contentTemplateSchema.moderationStatus),
      eq(contentTemplateSchema.moderationStatus, 'pending'),
    ),
  ];
  if (body.provider) {
    conditions.push(eq(contentTemplateSchema.sourcePlatform, body.provider));
  }

  const rows = await db
    .select({
      id: contentTemplateSchema.id,
      publicId: contentTemplateSchema.cloudinaryPublicId,
      provider: contentTemplateSchema.sourcePlatform,
    })
    .from(contentTemplateSchema)
    .where(and(...conditions))
    .limit(limit);

  if (rows.length === 0) {
    return NextResponse.json({
      scanned: 0,
      queued: 0,
      failed: 0,
      message: 'No unscored rows with a Cloudinary public_id remain.',
    });
  }

  if (body.dryRun) {
    return NextResponse.json({
      dryRun: true,
      wouldQueue: rows.length,
      sample: rows.slice(0, 5),
    });
  }

  let queued = 0;
  let failed = 0;
  const details: Array<{ id: string; publicId: string | null; outcome: string; kind?: string; error?: string }> = [];

  for (const row of rows) {
    if (!row.publicId) {
      failed++;
      details.push({ id: row.id, publicId: null, outcome: 'no-public-id' });
      continue;
    }
    const moderationParam = getModerationForProvider(row.provider, resourceType);
    try {
      // explicit API triggers a fresh moderation pass on an existing asset.
      // Response includes the current moderation array; for aws_rek_video it
      // will be status='pending' — the final verdict arrives at the webhook.
      const result = await cloudinary.uploader.explicit(row.publicId, {
        type: 'upload',
        resource_type: resourceType,
        moderation: moderationParam,
        ...(notificationUrl ? { notification_url: notificationUrl } : {}),
      });

      const modResult = (result as any).moderation?.[0];
      const status = modResult?.status ?? 'pending';
      const kind = modResult?.kind ?? moderationParam;

      // Persist the interim status so the row is hidden until webhook lands.
      await db
        .update(contentTemplateSchema)
        .set({
          moderationStatus: status,
          moderationKind: kind,
          moderationLabels: ((result as any).moderation ?? []) as any,
          moderationCheckedAt: new Date(),
          // Hide pending + rejected until we get a definitive approval.
          ...(status !== 'approved' ? { isActive: false } : {}),
          ...(status === 'rejected' ? { curationStatus: 'rejected' as const } : {}),
        })
        .where(eq(contentTemplateSchema.id, row.id));

      queued++;
      details.push({ id: row.id, publicId: row.publicId, outcome: status, kind });
    } catch (err) {
      failed++;
      details.push({
        id: row.id,
        publicId: row.publicId,
        outcome: 'cloudinary-failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
    await sleep(DELAY_BETWEEN_CALLS_MS);
  }

  return NextResponse.json({
    scanned: rows.length,
    queued,
    failed,
    notificationUrl,
    details,
  });
}
