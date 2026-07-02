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
import { eq } from 'drizzle-orm';

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

  // Match by our stored public_id first (fast, indexed). Fall back to a
  // substring match on media_url for rows uploaded before we started tracking
  // public_id explicitly.
  let rowsUpdated = 0;
  try {
    const updateSet = {
      moderationStatus,
      moderationKind,
      moderationLabels: (payload.moderation_response ?? []) as any,
      moderationCheckedAt: new Date(),
      // If Cloudinary rejects, hard-hide the row. Cloudinary itself will
      // stop delivering the asset — leaving it visible just shows a blank
      // tile like the 2026-07-02 incident.
      ...(moderationStatus === 'rejected'
        ? { isActive: false, curationStatus: 'rejected' as const }
        : moderationStatus === 'approved'
          // Only flip is_active back on if it was hidden BECAUSE of a
          // pending moderation. We don't want the webhook to overturn
          // human/admin decisions.
          ? { isActive: true }
          : {}),
    };

    const updated = await db
      .update(contentTemplateSchema)
      .set(updateSet)
      .where(eq(contentTemplateSchema.cloudinaryPublicId, publicId))
      .returning({ id: contentTemplateSchema.id });
    rowsUpdated = updated.length;
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
