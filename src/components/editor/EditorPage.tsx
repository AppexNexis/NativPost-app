import React from 'react';
import { useState, useEffect } from 'react';

import type { ContentEdit } from '@/types/v2';

import { EditorProvider } from './EditorContext';
import { EditorLayout } from './EditorLayout';
import { EditorPreview } from './EditorPreview';
import { EditorSidebar } from './EditorSidebar';

// ---------------------------------------------------------------------------
// Editor Page — loads edit session by query param or contentItemId
// ---------------------------------------------------------------------------
export default function EditorPage({
  editId,
  contentItemId,
}: {
  editId?: string;
  contentItemId?: string;
}) {
  const [edit, setEdit] = useState<ContentEdit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadEdit() {
      try {
        let url: string;
        if (editId) {
          url = `/api/content/edit/${editId}`;
        } else if (contentItemId) {
          // First fetch the content item to populate editor fields
          const itemRes = await fetch(`/api/content/${contentItemId}`);
          let contentType = 'text';
          let contentMode = 'normal';
          let targetPlatforms: string[] = [];
          let aspectRatio = '9:16';
          let script: Record<string, unknown> = {};
          let mediaSlots: Record<string, unknown> = {};

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
          } | undefined;

          if (item) {
            contentType = item.contentType || 'text';
            contentMode = item.contentMode || 'normal';
            targetPlatforms = item.targetPlatforms || [];
            aspectRatio = item.aspectRatio || '9:16';

            // Map caption to script fields
            if (item.caption) {
              script = { bodyText: item.caption };
            }

            // Map graphicUrls to mediaSlots
            if (item.graphicUrls && item.graphicUrls.length > 0) {
              mediaSlots = {
                background: { url: item.graphicUrls[0], assetType: 'video' },
              };
            }
          }

          // Create a new edit session from content item
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
              mediaSlots,
            }),
          });
          if (!res.ok) throw new Error('Failed to create edit session');
          const data = await res.json();
          setEdit(data.edit);
          setLoading(false);
          return;
        } else {
          throw new Error('No edit ID or content item ID provided');
        }

        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to load edit session');
        const data = await res.json();
        setEdit(data.edit);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    loadEdit();
  }, [editId, contentItemId]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mb-4 size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading editor...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-destructive">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!edit) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">No edit session found</p>
      </div>
    );
  }

  return (
    <EditorProvider initialEdit={edit}>
      <EditorLayout
        preview={<EditorPreview />}
        sidebar={<EditorSidebar />}
      />
    </EditorProvider>
  );
}
