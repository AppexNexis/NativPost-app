import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef, ReactNode } from 'react';

import type { ContentEdit, ContentEditScript, TextStyle, MediaSlots, AudioTrack, ContentEditTiming } from '@/types/v2';

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
        script: action.payload.script || {},
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
type EditorContextType = {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  saveEdit: () => Promise<void>;
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
    script: initialEdit?.script || {},
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

  const saveEdit = useCallback(async () => {
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
      dispatch({ type: 'MARK_SAVED' });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err instanceof Error ? err.message : 'Save failed' });
      dispatch({ type: 'SET_SAVING', payload: false });
    }
  }, [state.edit, state.isDirty, state.script, state.style, state.layout, state.timing, state.mediaSlots, state.audioTrack, state.aspectRatio, state.targetPlatforms, state.contentMode]);

  // Autosave: debounce 1500ms whenever isDirty becomes true
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!state.isDirty || state.isSaving) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      saveEdit();
    }, 1500);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [state.isDirty, state.isSaving, saveEdit]);

  return (
    <EditorContext.Provider value={{ state, dispatch, saveEdit }}>
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used inside EditorProvider');
  return ctx;
}
