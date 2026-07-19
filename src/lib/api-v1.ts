/**
 * Shared helpers for the /api/v1 public surface.
 *
 *   - Consistent error envelope: { error: { code, message, docs_url } }
 *   - snake_case serialization of DB rows to hide internal camelCase.
 *   - Cursor pagination helpers.
 *
 * These are intentionally minimal — the public shape MUST stay stable
 * across code changes, so mapping is explicit rather than "spread the row".
 */

import { NextResponse } from 'next/server';
import { Buffer } from 'node:buffer';

export const DOCS_URL = 'https://docs.nativpost.com';

export function apiError(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        docs_url: `${DOCS_URL}/errors`,
        ...extra,
      },
    },
    { status },
  );
}

export function apiOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

/** Encode a plain ISO createdAt into an opaque cursor string. */
export function encodeCursor(createdAt: Date): string {
  return Buffer.from(createdAt.toISOString()).toString('base64url');
}

/** Decode a cursor back to a Date. Returns null on any parse failure. */
export function decodeCursor(cursor: string | null | undefined): Date | null {
  if (!cursor) return null;
  try {
    const iso = Buffer.from(cursor, 'base64url').toString('utf8');
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export function paginationParams(request: Request): { limit: number; cursor: string | null } {
  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get('limit'));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 25;
  const cursor = url.searchParams.get('cursor');
  return { limit, cursor };
}

// -----------------------------------------------------------
// SERIALIZERS
// One serializer per resource. Explicit field mapping — never spread.
// -----------------------------------------------------------

export function serializeContent(row: {
  id: string;
  caption: string;
  hashtags: unknown;
  contentType: string;
  topic: string | null;
  graphicUrls: unknown;
  targetPlatforms: unknown;
  platformSpecific: unknown;
  status: string;
  scheduledFor: Date | null;
  publishedAt: Date | null;
  aspectRatio: string | null;
  durationSeconds: number | null;
  campaignId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    object: 'content' as const,
    caption: row.caption,
    hashtags: Array.isArray(row.hashtags) ? row.hashtags : [],
    content_type: row.contentType,
    topic: row.topic,
    media_urls: Array.isArray(row.graphicUrls) ? row.graphicUrls : [],
    target_platforms: Array.isArray(row.targetPlatforms) ? row.targetPlatforms : [],
    platform_specific: row.platformSpecific ?? {},
    status: row.status,
    scheduled_for: row.scheduledFor?.toISOString() ?? null,
    published_at: row.publishedAt?.toISOString() ?? null,
    aspect_ratio: row.aspectRatio,
    duration_seconds: row.durationSeconds,
    campaign_id: row.campaignId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function serializeCampaign(row: {
  id: string;
  name: string;
  description: string | null;
  status: string;
  contentMix: unknown;
  postsPerDay: number | null;
  campaignLengthDays: number | null;
  startDate: Date | null;
  totalPosts: number | null;
  generatedPosts: number | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    object: 'campaign' as const,
    name: row.name,
    description: row.description,
    status: row.status,
    content_mix: row.contentMix ?? {},
    posts_per_day: row.postsPerDay,
    campaign_length_days: row.campaignLengthDays,
    start_date: row.startDate?.toISOString() ?? null,
    total_posts: row.totalPosts ?? 0,
    generated_posts: row.generatedPosts ?? 0,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function serializeTemplate(row: {
  id: string;
  sourceUrl: string;
  sourcePlatform: string;
  sourceCreator: string | null;
  contentType: string;
  thumbnailUrl: string;
  mediaUrl: string | null;
  durationSeconds: number | null;
  niches: unknown;
  angles: unknown;
  engagementScore: number | null;
  viewCount: number | null;
  likeCount: number | null;
  isActive: boolean | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    object: 'template' as const,
    source_url: row.sourceUrl,
    source_platform: row.sourcePlatform,
    source_creator: row.sourceCreator,
    content_type: row.contentType,
    thumbnail_url: row.thumbnailUrl,
    media_url: row.mediaUrl,
    duration_seconds: row.durationSeconds,
    niches: Array.isArray(row.niches) ? row.niches : [],
    angles: Array.isArray(row.angles) ? row.angles : [],
    engagement_score: row.engagementScore,
    view_count: row.viewCount,
    like_count: row.likeCount,
    is_active: row.isActive ?? false,
    created_at: row.createdAt.toISOString(),
  };
}

export function serializeSocialAccount(row: {
  id: string;
  platform: string;
  platformUsername: string | null;
  platformUserId: string | null;
  accountType: string | null;
  profileImageUrl: string | null;
  isActive: boolean;
  connectedAt: Date;
}) {
  return {
    id: row.id,
    object: 'social_account' as const,
    platform: row.platform,
    username: row.platformUsername,
    platform_user_id: row.platformUserId,
    account_type: row.accountType,
    profile_image_url: row.profileImageUrl,
    is_active: row.isActive,
    connected_at: row.connectedAt.toISOString(),
  };
}

export function serializeMediaAsset(row: {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  assetType: string;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  aspectRatio: string | null;
  durationSeconds: number | null;
  tags: unknown;
  createdAt: Date;
}) {
  return {
    id: row.id,
    object: 'media_asset' as const,
    url: row.url,
    thumbnail_url: row.thumbnailUrl,
    asset_type: row.assetType,
    mime_type: row.mimeType,
    width: row.width,
    height: row.height,
    aspect_ratio: row.aspectRatio,
    duration_seconds: row.durationSeconds,
    tags: Array.isArray(row.tags) ? row.tags : [],
    created_at: row.createdAt.toISOString(),
  };
}

export function serializeWebhook(row: {
  id: string;
  url: string;
  events: unknown;
  description: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    object: 'webhook_endpoint' as const,
    url: row.url,
    events: Array.isArray(row.events) ? row.events : [],
    description: row.description,
    enabled: row.enabled,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
