import React, { ReactNode } from 'react';
import { ArrowLeft, Check, Loader2, Save, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { useEditor } from './EditorContext';

export function EditorLayout({
  preview,
  sidebar,
}: {
  preview: ReactNode;
  sidebar: ReactNode;
}) {
  const { state, saveEdit } = useEditor();
  const router = useRouter();

  const handleContinue = async () => {
    await saveEdit();
    if (state.edit?.contentItemId) {
      router.push(`/dashboard/content/${state.edit.contentItemId}`);
    } else {
      router.push('/dashboard/posts');
    }
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/dashboard/content-library');
    }
  };

  const isRemix = state.edit?.source === 'remix';

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Back"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div>
            <h1 className="text-sm font-semibold text-foreground leading-none">
              {isRemix ? 'Remix Editor' : 'Content Editor'}
            </h1>
            <p className="mt-0.5 flex items-center gap-1 text-xs leading-none">
              {state.isSaving ? (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Loader2 className="size-2.5 animate-spin" />
                  Saving…
                </span>
              ) : state.isDirty ? (
                <span className="text-amber-500">Unsaved changes</span>
              ) : (
                <span className="flex items-center gap-1 text-emerald-600">
                  <Check className="size-2.5" />
                  Saved
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={saveEdit}
            disabled={state.isSaving || !state.isDirty}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Save className="size-3" />
            Save
          </button>
          <button
            onClick={handleContinue}
            disabled={state.isSaving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {state.isSaving
              ? <Loader2 className="size-3 animate-spin" />
              : <Sparkles className="size-3" />
            }
            Schedule &amp; Publish
          </button>
        </div>
      </header>

      {/* ── Main area ────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left sidebar — controls */}
        <aside className="w-[340px] shrink-0 overflow-y-auto border-r border-border bg-card">
          {sidebar}
        </aside>

        {/* Center — live preview */}
        <main className="flex min-w-0 flex-1 flex-col items-center justify-center bg-muted/20 p-6">
          {preview}
        </main>
      </div>
    </div>
  );
}
