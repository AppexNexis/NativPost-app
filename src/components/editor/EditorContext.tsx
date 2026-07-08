import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef, ReactNode } from 'react';

import type { ContentEdit, ContentEditScript, TextStyle, MediaSlots, AudioTrack, ContentEditTiming } from '@/types/v2';

// ---------------------------------------------------------------------------
// Caption → script splitter
// ---------------------------------------------------------------------------
// The editor's overlay renderer needs hook/body/CTA fields. If the initial
// edit only has a caption (common for legacy items or freshly generated
// content where the AI returned a single blob), split it so the overlay is
// never blank on publish. Without this, `state.script` stays `{}` and the
// content-detail page falls through to raw-video display because
// `hasEditorState` is false.
function deriveScriptFromCaption(caption?: string | null): ContentEditScript {
  if (!caption || typeof caption !== 'string') return {};
  const lines = caption.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return {};
  if (lines.length === 1) return { hookText: lines[0] };
  if (lines.length === 2) return { hookText: lines[0], bodyText: lines[1] };
  return {
    hookText: lines[0],
    bodyText: lines.slice(1, -1).join('\n'),
    ctaText: lines[lines.length - 1],
  };
}

function initialScript(edit?: ContentEdit | null): ContentEditScript {
  const s = edit?.script;
  const hasContent = s && (s.hookText || s.bodyText || s.ctaText || s.wallText);
  if (hasContent) return s;
  // Fall back to caption-derived script — supports items opened directly from
  // the content library without a persisted editor session.
  return deriveScriptFromCaption((edit as any)?.caption);
}

// ---------------------------------------------------------------------------
// Editor State
// ---------------------------------------------------------------------------
export type EditorState = {
  edit: ContentEdit | null;
  script: ContentEditScript;
  style: TextStyle;
  layout: string;
  timing: ContentEditTiming;
  mediaSlots: MediaSlots;
  audioTrack: AudioTrack | null;
  aspectRatio: string;
  targetPlatforms: string[];
  contentMode: string;
  isSaving: boolean;
  isDirty: boolean;
  error: string | null;
};

type EditorAction =
  | { type: 'SET_EDIT'; payload: ContentEdit }
  | { type: 'UPDATE_SCRIPT'; payload: Partial<ContentEditScript> }
  | { type: 'UPDATE_STYLE'; payload: Partial<TextStyle> }
  | { type: 'SET_LAYOUT'; payload: string }
  | { type: 'UPDATE_TIMING'; payload: Partial<ContentEditTiming> }
  | { type: 'UPDATE_MEDIA_SLOTS'; payload: Partial<MediaSlots> }
  | { type: 'SET_AUDIO_TRACK'; payload: AudioTrack | null }
  | { type: 'SET_ASPECT_RATIO'; payload: string }
  | { type: 'SET_TARGET_PLATFORMS'; payload: string[] }
  | { type: 'SET_CONTENT_MODE'; payload: string }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SET_DIRTY'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'MARK_SAVED' };

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SET_EDIT':
      return {
        ...state,
        edit: action.payload,
        script: initialScript(action.payload),
        style: action.payload.style || {},
        layout: action.payload.layout || 'centered',
        timing: action.payload.timing || {},
        mediaSlots: action.payload.mediaSlots || {},
        audioTrack: action.payload.audioTrack || null,
        aspectRatio: action.payload.aspectRatio || '9:16',
        targetPlatforms: action.payload.targetPlatforms || [],
        contentMode: action.payload.contentMode || 'normal',
        isDirty: false,
        error: null,
      };
    case 'UPDATE_SCRIPT':
      return { ...state, script: { ...state.script, ...action.payload }, isDirty: true };
    case 'UPDATE_STYLE':
      return { ...state, style: { ...state.style, ...action.payload }, isDirty: true };
    case 'SET_LAYOUT':
      return { ...state, layout: action.payload, isDirty: true };
    case 'UPDATE_TIMING':
      return { ...state, timing: { ...state.timing, ...action.payload }, isDirty: true };
    case 'UPDATE_MEDIA_SLOTS':
      return { ...state, mediaSlots: { ...state.mediaSlots, ...action.payload }, isDirty: true };
    case 'SET_AUDIO_TRACK':
      return { ...state, audioTrack: action.payload, isDirty: true };
    case 'SET_ASPECT_RATIO':
      return { ...state, aspectRatio: action.payload, isDirty: true };
    case 'SET_TARGET_PLATFORMS':
      return { ...state, targetPlatforms: action.payload, isDirty: true };
    case 'SET_CONTENT_MODE':
      return { ...state, contentMode: action.payload, isDirty: true };
    case 'SET_SAVING':
      return { ...state, isSaving: action.payload };
    case 'SET_DIRTY':
      return { ...state, isDirty: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'MARK_SAVED':
      return { ...state, isDirty: false, isSaving: false };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
type SaveEditOpts = {
  /**
   * Await the fire-and-forget mirror PATCH to /api/content/[id] before
   * resolving. Used by InlineEditorOverlay's Done handler so the fresh
   * GET after save sees the mirrored enrichmentData instead of the
   * pre-edit row.
   */
  awaitMirror?: boolean;
};

type EditorContextType = {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  saveEdit: (opts?: SaveEditOpts) => Promise<void>;
  /**
   * Clears the pending autosave timer and marks the session non-dirty so
   * the debounce effect does not re-schedule. Used by the inline overlay
   * on Cancel to prevent a debounced write from landing after unmount.
   * In-flight fetches (already started) are NOT cancelled.
   */
  discardPending: () => void;
};

const EditorContext = createContext<EditorContextType | null>(null);

export function EditorProvider({
  children,
  initialEdit,
}: {
  children: ReactNode;
  initialEdit?: ContentEdit | null;
}) {
  const [state, dispatch] = useReducer(editorReducer, {
    edit: initialEdit || null,
    script: initialScript(initialEdit),
    style: initialEdit?.style || {},
    layout: initialEdit?.layout || 'centered',
    timing: initialEdit?.timing || {},
    mediaSlots: initialEdit?.mediaSlots || {},
    audioTrack: initialEdit?.audioTrack || null,
    aspectRatio: initialEdit?.aspectRatio || '9:16',
    targetPlatforms: initialEdit?.targetPlatforms || [],
    contentMode: initialEdit?.contentMode || 'normal',
    isSaving: false,
    isDirty: false,
    error: null,
  });

  // Ref-gated saveEdit: when discardPending() is called (e.g. Cancel in the
  // inline overlay) further saveEdit calls resolve immediately without
  // touching the network.
  const discardRef = useRef(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveEdit = useCallback(async (opts?: SaveEditOpts) => {
    if (discardRef.current) return;
    if (!state.edit || !state.isDirty) return;
    dispatch({ type: 'SET_SAVING', payload: true });
    try {
      const res = await fetch(`/api/content/edit/${state.edit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: state.script,
          style: state.style,
          layout: state.layout,
          timing: state.timing,
          mediaSlots: state.mediaSlots,
          audioTrack: state.audioTrack,
          aspectRatio: state.aspectRatio,
          targetPlatforms: state.targetPlatforms,
          contentMode: state.contentMode,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');

      // Mirror the edit into the linked content item's enrichmentData so the
      // content detail page can render the user's edits WITHOUT a full
      // Publish (which runs the image/video engine). Without this, edits
      // stay stranded in the contentEdit row and the detail page keeps
      // showing the pre-edit template. `sourceMediaSlots` carries the
      // authoritative slide array (including added / removed slides) — the
      // detail page's gallery falls back to it when the item's graphicUrls
      // are stale (see content/[id]/page.tsx). Fire-and-forget by default;
      // InlineEditorOverlay passes { awaitMirror: true } so the immediate
      // GET after save sees the mirrored row (else the Blitz card refresh
      // reads a stale enrichmentData).
      const linkedContentItemId = (state.edit as any)?.contentItemId;
      if (linkedContentItemId) {
        const mirrorPromise = fetch(`/api/content/${linkedContentItemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enrichmentData: {
              editorScript: state.script,
              editorStyle: state.style,
              editorLayout: state.layout,
              aspectRatio: state.aspectRatio,
              sourceMediaSlots: state.mediaSlots,
            },
            aspectRatio: state.aspectRatio,
          }),
        }).catch(() => {
          // Silent — Save is still recorded on the edit row.
        });
        if (opts?.awaitMirror) {
          await mirrorPromise;
        } else {
          void mirrorPromise;
        }
      }

      dispatch({ type: 'MARK_SAVED' });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err instanceof Error ? err.message : 'Save failed' });
      dispatch({ type: 'SET_SAVING', payload: false });
    }
  }, [state.edit, state.isDirty, state.script, state.style, state.layout, state.timing, state.mediaSlots, state.audioTrack, state.aspectRatio, state.targetPlatforms, state.contentMode]);

  const discardPending = useCallback(() => {
    discardRef.current = true;
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    // Reset isDirty so the debounce effect stops re-scheduling. The
    // provider is about to unmount anyway on Cancel, but this belt-and-
    // suspenders keeps a race-free surface if the caller keeps the
    // overlay mounted after Cancel for any reason.
    dispatch({ type: 'MARK_SAVED' });
  }, []);

  // Autosave: debounce 1500ms whenever isDirty becomes true
  useEffect(() => {
    if (discardRef.current) return;
    if (!state.isDirty || state.isSaving) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void saveEdit();
    }, 1500);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [state.isDirty, state.isSaving, saveEdit]);

  return (
    <EditorContext.Provider value={{ state, dispatch, saveEdit, discardPending }}>
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used inside EditorProvider');
  return ctx;
}
