/**
 * Cloudinary moderation webhook.
 *
 * Video moderation (aws_rek_video, google_video_moderation) is asynchronous.
 * Upload calls in the seed pipeline return status='pending' and we hide the
 * row (is_active=false, curation_status='pending_moderation'). Cloudinary
 * later POSTs the final verdict here, and we flip the row accordingly.
 *
 * Payload shape (from Cloudinary docs):
 * {
 *   notification_type: 'moderation',
 *   moderation_kind: 'aws_rek_video',
 *   moderation_status: 'approved' | 'rejected',
 *   moderation_response: { ... labels + confidence ... },
 *   public_id: 'nativpost/templates/tiktok_xxx_170...',
 *   resource_type: 'video',
 *   timestamp: '1700000000',
 *   signature: 'sha1-hex',
 *   ...
 * }
 *
 * Signature validation follows Cloudinary's docs for notification signatures:
 *   sha1(sorted-body-params-serialized + timestamp + api_secret)
 * but the SDK helper util.verifyNotificationSignature does this for us.
 */

import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { eq, or, sql } from 'drizzle-orm';

import { getDb } from '@/libs/DB';
import { contentTemplateSchema } from '@/models/Schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cloudinary considers signatures older than a set validity window (default
// 2 hours) invalid. We match that so replayed webhooks are rejected.
const SIGNATURE_VALIDITY_SECONDS = 2 * 60 * 60;

interface CloudinaryModerationPayload {
  notification_type?: string;
  moderation_kind?: string;
  moderation_status?: string;
  moderation_response?: unknown;
  public_id?: string;
  resource_type?: string;
  timestamp?: number | string;
}

export async function POST(req: NextRequest) {
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!apiSecret) {
    // Fail closed: without a secret we cannot verify signatures, so any
    // caller could flip rows to approved.
    return NextResponse.json({ error: 'server-misconfigured' }, { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-cld-signature');
  const timestampHeader = req.headers.get('x-cld-timestamp');

  if (!signature || !timestampHeader) {
    return NextResponse.json({ error: 'missing-signature' }, { status: 400 });
  }

  // Cloudinary Node SDK signs the raw request body + timestamp with api_secret.
  const isValid = cloudinary.utils.verifyNotificationSignature(
    rawBody,
    Number(timestampHeader),
    signature,
    SIGNATURE_VALIDITY_SECONDS,
  );
  if (!isValid) {
    return NextResponse.json({ error: 'invalid-signature' }, { status: 401 });
  }

  let payload: CloudinaryModerationPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 });
  }

  // We only care about moderation notifications here. Cloudinary sends other
  // notification types (upload, resource_state_change, etc.) on the same URL
  // if you point them all at this route.
  if (payload.notification_type !== 'moderation') {
    return NextResponse.json({ ignored: true, reason: 'not-moderation' });
  }

  const publicId = payload.public_id;
  const moderationStatus = payload.moderation_status ?? null;
  const moderationKind = payload.moderation_kind ?? null;

  if (!publicId) {
    return NextResponse.json({ error: 'missing-public-id' }, { status: 400 });
  }

  const db = await getDb();

  // Match by `cloudinary_public_id` (single-asset rows, video path) OR by
  // membership in `moderation_public_ids` (slideshow rows track every
  // slide's publicId here — see apify-async.ts slideshow upload loop).
  //
  // Slideshow gating semantics:
  //   - ANY 'rejected' callback → whole row rejected + hidden immediately.
  //   - 'approved' callbacks accumulate in `moderation_approved_ids`. Row
  //     only flips to visible once approvedIds ⊇ publicIds AND no
  //     rejection has been recorded.
  let rowsUpdated = 0;
  try {
    // Fetch matching rows first — we need moderationPublicIds + existing
    // moderationApprovedIds to decide whether this callback closes the
    // approval quorum for a slideshow.
    const matches = await db
      .select({
        id: contentTemplateSchema.id,
        moderationStatus: contentTemplateSchema.moderationStatus,
        moderationPublicIds: contentTemplateSchema.moderationPublicIds,
        moderationApprovedIds: contentTemplateSchema.moderationApprovedIds,
      })
      .from(contentTemplateSchema)
      .where(
        or(
          eq(contentTemplateSchema.cloudinaryPublicId, publicId),
          sql`${contentTemplateSchema.moderationPublicIds} @> ${JSON.stringify([publicId])}::jsonb`,
        ),
      );

    for (const row of matches) {
      const publicIds = (row.moderationPublicIds ?? []) as string[];
      const approvedSoFar = new Set((row.moderationApprovedIds ?? []) as string[]);
      const alreadyRejected = row.moderationStatus === 'rejected';

      let updateSet: Record<string, unknown> = {
        moderationKind,
        moderationLabels: (payload.moderation_response ?? []) as any,
        moderationCheckedAt: new Date(),
      };

      if (moderationStatus === 'rejected') {
        // Any single-slide rejection fails the whole row. Cloudinary refuses
        // to deliver rejected assets — leaving the row visible produces
        // blank tiles (see 2026-07-02 incident).
        updateSet = {
          ...updateSet,
          moderationStatus: 'rejected',
          isActive: false,
          curationStatus: 'rejected' as const,
        };
      } else if (moderationStatus === 'approved') {
        if (alreadyRejected) {
          // Never un-reject via a later approve — keep the row hidden.
          updateSet = {
            ...updateSet,
            // don't touch moderationStatus / isActive / curationStatus
          };
        } else {
          approvedSoFar.add(publicId);
          const nextApprovedIds = Array.from(approvedSoFar);
          const allApproved
            = publicIds.length > 0
              && publicIds.every(id => approvedSoFar.has(id));

          updateSet = {
            ...updateSet,
            moderationApprovedIds: nextApprovedIds,
            // Only flip status/isActive once every tracked publicId approved.
            // For single-asset rows (video), publicIds.length===1 so this
            // fires on the first callback — matches prior behavior.
            ...(allApproved
              ? { moderationStatus: 'approved', isActive: true }
              : { moderationStatus: 'pending' }),
          };
        }
      } else {
        // Unknown/other status — record it and move on.
        updateSet = { ...updateSet, moderationStatus };
      }

      await db
        .update(contentTemplateSchema)
        .set(updateSet)
        .where(eq(contentTemplateSchema.id, row.id));
      rowsUpdated++;
    }
  } catch (err) {
    console.error('[cloudinary-moderation] db update failed:', err);
    return NextResponse.json({ error: 'db-failed' }, { status: 500 });
  }

  if (rowsUpdated === 0) {
    console.warn(
      `[cloudinary-moderation] no row matched public_id=${publicId} status=${moderationStatus}`,
    );
  } else {
    console.log(
      `[cloudinary-moderation] ${moderationStatus} by ${moderationKind} → ${rowsUpdated} row(s) updated (public_id=${publicId})`,
    );
  }

  return NextResponse.json({ ok: true, rowsUpdated, publicId, moderationStatus });
}
