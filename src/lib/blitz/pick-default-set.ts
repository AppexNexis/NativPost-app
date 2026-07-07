/**
 * pickDefaultSet
 *
 * Picks the user's most recent Media Set matching a content type, for Blitz
 * media substitution. Returns the raw `media_set` row (with resolved asset
 * URLs pre-fetched) or `null` if no match exists.
 *
 * Set.type values in the schema today: 'slideshow' | 'video' | 'curated'.
 * The Blitz caller only asks for substitution on the safe-swap content types
 * (slideshow / carousel / wall_of_text). For those we map:
 *   - slideshow / carousel → Set.type = 'slideshow'
 *   - wall_of_text → Set.type = 'slideshow' (image assets used as background)
 *
 * Anything else returns null and Blitz falls back to template media as-is
 * (per user decision).
 */

import { and, desc, eq, inArray } from 'drizzle-orm';

import { mediaAssetSchema, mediaSetSchema } from '@/models/Schema';

export type ResolvedSet = {
  id: string;
  name: string;
  type: string;
  assets: Array<{ url: string; assetType: 'image' | 'video' }>;
};

const CONTENT_TYPE_TO_SET_TYPE: Record<string, string | undefined> = {
  slideshow: 'slideshow',
  carousel: 'slideshow',
  wall_of_text: 'slideshow',
};

export async function pickDefaultSet(
  db: any,
  orgId: string,
  contentType: string,
): Promise<ResolvedSet | null> {
  const setType = CONTENT_TYPE_TO_SET_TYPE[contentType];
  if (!setType) return null;

  const [set] = await db
    .select()
    .from(mediaSetSchema)
    .where(and(eq(mediaSetSchema.orgId, orgId), eq(mediaSetSchema.type, setType)))
    .orderBy(desc(mediaSetSchema.updatedAt))
    .limit(1);

  if (!set) return null;

  const uuids = Array.isArray(set.assetUuids)
    ? (set.assetUuids as string[]).filter(Boolean)
    : [];

  if (uuids.length === 0) return null;

  const assets = await db
    .select({
      id: mediaAssetSchema.id,
      url: mediaAssetSchema.url,
      assetType: mediaAssetSchema.assetType,
    })
    .from(mediaAssetSchema)
    .where(
      and(
        eq(mediaAssetSchema.orgId, orgId),
        inArray(mediaAssetSchema.id, uuids),
      ),
    );

  // Preserve the ordering the user configured on the set.
  const byId = new Map<string, { url: string; assetType: string }>();
  for (const a of assets as any[]) byId.set(a.id, { url: a.url, assetType: a.assetType });
  const ordered = uuids
    .map((uid) => byId.get(uid))
    .filter((a): a is { url: string; assetType: string } => Boolean(a) && Boolean(a!.url));

  if (ordered.length === 0) return null;

  return {
    id: set.id,
    name: set.name,
    type: set.type,
    assets: ordered.map((a) => ({
      url: a.url,
      assetType: (a.assetType === 'video' ? 'video' : 'image') as 'image' | 'video',
    })),
  };
}
