import React from 'react';

import { EditorProvider } from './EditorContext';
import { EditorLayout } from './EditorLayout';
import { EditorPreviewDispatcher } from './EditorPreviewDispatcher';
import { EditorSidebar } from './EditorSidebar';
import { useLoadEditSession } from './useLoadEditSession';

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
  const { edit, loading, error } = useLoadEditSession({ editId, contentItemId });

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
        preview={<EditorPreviewDispatcher />}
        sidebar={<EditorSidebar />}
      />
    </EditorProvider>
  );
}
