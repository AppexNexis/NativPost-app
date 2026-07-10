'use client';

/**
 * InlineEditorOverlay
 *
 * Full-screen overlay that hosts the editor UI ON the Blitz page (or any
 * host surface) instead of navigating to /dashboard/editor. Replaces the
 * previous flow where clicking "Edit" on a Blitz card pushed the user to
 * a separate route and required a returnTo redirect.
 *
 * Contract:
 *   - <InlineEditorOverlay contentItemId={id} onCancel={fn} onDone={fn} />
 *   - Mounts inside a Radix Dialog (focus trap + Esc + backdrop click).
 *   - Reuses the exact EditorProvider + EditorSidebar + EditorPreviewDispatcher
 *     stack — this is the SAME editing UI as the route, just embedded.
 *   - Save path: awaits `saveEdit({ awaitMirror: true })` so the immediate
 *     GET refresh on the host page sees the mirrored enrichmentData
 *     (else the Blitz card renders the pre-edit row).
 *   - Cancel path: calls `discardPending()` first to neutralize the
 *     1500ms autosave debounce, then invokes `onCancel`.
 *   - Deep-link `/dashboard/editor?mode=blitz-edit` still works — that
 *     route is untouched.
 */

import * as Dialog from '@radix-ui/react-dialog';
import { Check, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ContentItem } from '@/types/v2';

import { EditorProvider, useEditor } from './EditorContext';
import { EditorPreviewDispatcher } from './EditorPreviewDispatcher';
import { EditorSidebar } from './EditorSidebar';
import { useLoadEditSession } from './useLoadEditSession';

export type InlineEditorOverlayProps = {
  contentItemId: string;
  onCancel: () => void;
  onDone: (updatedItem?: ContentItem) => void;
};

export function InlineEditorOverlay({
  contentItemId,
  onCancel,
  onDone,
}: InlineEditorOverlayProps) {
  const { edit, loading, error } = useLoadEditSession({ contentItemId });

  // Body registers its handleCancelClick here so Esc + backdrop can route
  // through the same dirty-check + discardPending() handshake as the
  // header buttons. Without this bridge, Radix's default onOpenChange
  // would silently bypass the confirm-discard modal.
  const requestCloseRef = useRef<(() => void) | null>(null);

  const handleDismiss = () => {
    if (requestCloseRef.current) {
      requestCloseRef.current();
    } else {
      // Body not yet mounted (still loading) — safe to close directly.
      onCancel();
    }
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) handleDismiss();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          <Dialog.Title className="sr-only">Edit post</Dialog.Title>

          {loading ? (
            <OverlayLoading />
          ) : error ? (
            <OverlayError message={error} onClose={onCancel} />
          ) : !edit ? (
            <OverlayError message="No edit session available" onClose={onCancel} />
          ) : (
            <EditorProvider initialEdit={edit}>
              <InlineEditorBody
                contentItemId={contentItemId}
                onCancel={onCancel}
                onDone={onDone}
                requestCloseRef={requestCloseRef}
              />
            </EditorProvider>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------------------
// Body — mounted inside EditorProvider so it can read state / call saveEdit
// ---------------------------------------------------------------------------
function InlineEditorBody({
  contentItemId,
  onCancel,
  onDone,
  requestCloseRef,
}: {
  contentItemId: string;
  onCancel: () => void;
  onDone: (updatedItem?: ContentItem) => void;
  requestCloseRef: React.MutableRefObject<(() => void) | null>;
}) {
  const { state, saveEdit, mirrorEdit, discardPending } = useEditor();
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const handleDone = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Save the edit row (no-op if autosave already saved since isDirty is false).
      // saveEdit returns false on server error so we can skip mirroring a
      // half-saved state onto the linked content_item.
      const saveOk = await saveEdit({ awaitMirror: false });
      if (!saveOk) {
        // Error banner is already shown by SET_ERROR from saveEdit; bail
        // out so the user can retry without stale-state corruption.
        setSaving(false);
        return;
      }
      // ALWAYS mirror on success so the content_item enrichmentData
      // reflects edits. saveEdit guards on isDirty and returns early when
      // autosave already persisted — skipping the mirror step. mirrorEdit
      // bypasses the guard so the Blitz card refresh below reads the
      // edited state, not stale data.
      await mirrorEdit();

      // Fetch the fresh content item and hand it to the host so it can
      // update its local queue in place without an extra roundtrip.
      let updatedItem: ContentItem | undefined;
      try {
        const res = await fetch(`/api/content/${contentItemId}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          updatedItem = data.item as ContentItem;
        }
      } catch {
        // Ignore — the host can still refetch on its own timer.
      }

      onDone(updatedItem);
    } catch (err) {
      console.error('[InlineEditor] Save failed:', err);
      setSaving(false);
    }
  }, [saving, saveEdit, mirrorEdit, contentItemId, onDone]);

  const handleCancelClick = useCallback(() => {
    if (saving) return;
    if (state.isDirty) {
      setConfirmDiscard(true);
      return;
    }
    discardPending();
    onCancel();
  }, [saving, state.isDirty, discardPending, onCancel]);

  // Register the handler on the ref so the parent's Dialog onOpenChange
  // (Esc + backdrop) routes through the same dirty-check path as the
  // header X and Cancel buttons.
  useEffect(() => {
    requestCloseRef.current = handleCancelClick;
    return () => {
      requestCloseRef.current = null;
    };
  }, [handleCancelClick, requestCloseRef]);

  const confirmDiscardAndClose = useCallback(() => {
    discardPending();
    setConfirmDiscard(false);
    onCancel();
  }, [discardPending, onCancel]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCancelClick}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            title="Close editor"
          >
            <X className="size-4" />
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold leading-none text-foreground">
              Edit Post
            </h1>
            {state.edit?.contentType && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium capitalize text-primary">
                {String(state.edit.contentType).replace(/_/g, ' ')}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-1.5 sm:flex">
            {state.isSaving ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Saving&hellip;
              </span>
            ) : state.isDirty ? (
              <span className="text-xs text-muted-foreground">Unsaved</span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-emerald-600">
                <Check className="size-3" />
                Saved
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleCancelClick}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleDone}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            {saving ? 'Saving\u2026' : 'Done Editing'}
          </button>
        </div>
      </header>

      {/* ── Main content: sidebar + preview ────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-96 shrink-0 overflow-hidden border-r border-border bg-card">
          <EditorSidebar />
        </aside>
        <main className="flex flex-1 items-center justify-center overflow-hidden">
          <EditorPreviewDispatcher />
        </main>
      </div>

      {/* ── Discard-changes confirmation ───────────────────────────── */}
      {confirmDiscard && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
            <h2 className="text-sm font-semibold text-foreground">
              Discard unsaved changes?
            </h2>
            <p className="mt-2 text-xs text-muted-foreground">
              Your edits will not be saved to this post.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDiscard(false)}
                className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={confirmDiscardAndClose}
                className="inline-flex items-center rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OverlayLoading() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading editor&hellip;</p>
      </div>
    </div>
  );
}

function OverlayError({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="max-w-md rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-destructive">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Close
        </button>
      </div>
    </div>
  );
}
