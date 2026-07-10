import { useEffect, useState } from 'react';

import type { ContentEdit } from '@/types/v2';

/**
 * useLoadEditSession
 *
 * Shared between EditorPage (route mode at /dashboard/editor) and
 * InlineEditorOverlay (Blitz swipe overlay). Given either an existing
 * `editId` OR a `contentItemId`, fetches / creates the edit session row
 * that EditorProvider hydrates from.
 *
 * When `contentItemId` is supplied the hook:
 *   1. GETs /api/content/[id] to snapshot the item's contentType +
 *      enrichmentData (editorScript / editorStyle / editorLayout /
 *      sourceMediaSlots) — required so the editor opens with the same
 *      overlays the Blitz preview shows, not a blank slate.
 *   2. POSTs /api/content/edit to create a new contentEdit row seeded
 *      with that snapshot.
 *
 * `sourceMediaSlots` restoration is critical: after Publish, the item's
 * graphicUrls[0] points at the baked MP4. Reusing that as the background
 * would double-stack overlays (baked text + fresh RemotionPreviewPlayer
 * text). We fall back to graphicUrls[0] only when the item was NEVER
 * compiled (legacy items opened straight from the library).
 */
export type UseLoadEditSessionResult = {
  edit: ContentEdit | null;
  loading: boolean;
  error: string | null;
};

export function useLoadEditSession({
  editId,
  contentItemId,
}: {
  editId?: string;
  contentItemId?: string;
}): UseLoadEditSessionResult {
  const [edit, setEdit] = useState<ContentEdit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadEdit() {
      setLoading(true);
      setError(null);
      try {
        if (editId) {
          const res = await fetch(`/api/content/edit/${editId}`);
          if (!res.ok) throw new Error('Failed to load edit session');
          const data = await res.json();
          if (!cancelled) setEdit(data.edit);
          return;
        }

        if (!contentItemId) {
          throw new Error('No edit ID or content item ID provided');
        }

        const itemRes = await fetch(`/api/content/${contentItemId}`);
        if (!itemRes.ok) {
          throw new Error('Failed to load content item for editing');
        }
        const itemData = await itemRes.json();
        const item = itemData.item as {
          contentType?: string;
          contentMode?: string;
          targetPlatforms?: string[];
          aspectRatio?: string;
          caption?: string;
          graphicUrls?: string[];
          enrichmentData?: {
            // Editor consumers read hookText / bodyText / ctaText / wallText
            // / slideCopy (per-slide captions from generateBlitzSlideCaptions).
            // Widen to Record<string, unknown> so future fields carry through
            // without narrowing the type here.
            editorScript?: Record<string, unknown>;
            editorStyle?: Record<string, unknown>;
            editorLayout?: string;
            sourceMediaSlots?: Record<string, unknown>;
            audioTrack?: unknown;
            isCompiled?: boolean;
          };
        } | undefined;

        let contentType = 'text';
        let contentMode = 'normal';
        let targetPlatforms: string[] = [];
        let aspectRatio = '9:16';
        let script: Record<string, unknown> = {};
        let mediaSlots: Record<string, unknown> = {};
        let editorStyle: Record<string, unknown> | undefined;
        let editorLayout: string | undefined;

        if (item) {
          contentType = item.contentType || 'text';
          contentMode = item.contentMode || 'normal';
          targetPlatforms = item.targetPlatforms || [];
          aspectRatio = item.aspectRatio || '9:16';

          if (item.enrichmentData?.editorScript) {
            script = item.enrichmentData.editorScript as Record<string, unknown>;
          } else if (item.caption) {
            script = { bodyText: item.caption };
          }

          editorStyle = item.enrichmentData?.editorStyle as Record<string, unknown> | undefined;
          editorLayout = item.enrichmentData?.editorLayout;

          const stashed = item.enrichmentData?.sourceMediaSlots as
            | Record<string, any>
            | undefined;
          if (stashed && Object.keys(stashed).length > 0) {
            mediaSlots = stashed;
          } else if (item.graphicUrls && item.graphicUrls.length > 0 && !item.enrichmentData?.isCompiled) {
            mediaSlots = {
              background: { url: item.graphicUrls[0]!, assetType: 'video' },
            };
          }
        }

        // Hydrate audioTrack from any previously mirrored edit so the
        // re-opened editor sees the user's last audio pick instead of null.
        const audioTrack = item?.enrichmentData?.audioTrack ?? null;

        const res = await fetch('/api/content/edit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'manual',
            contentItemId,
            contentType,
            contentMode,
            targetPlatforms,
            aspectRatio,
            script,
            style: editorStyle || {},
            layout: editorLayout || 'centered',
            mediaSlots,
            audioTrack,
          }),
        });
        if (!res.ok) throw new Error('Failed to create edit session');
        const data = await res.json();
        if (!cancelled) setEdit(data.edit);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadEdit();
    return () => {
      cancelled = true;
    };
  }, [editId, contentItemId]);

  return { edit, loading, error };
}
