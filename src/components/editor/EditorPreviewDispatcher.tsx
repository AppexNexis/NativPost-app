import React from 'react';

import { useEditor } from './EditorContext';
import { EditorPreview } from './EditorPreview';
import { ImageEditorPreview } from './ImageEditorPreview';
import { getEditorKind } from '@/lib/editor/content-type-registry';

/**
 * Dispatches to the right preview component for the current edit's content
 * type. Kept as its own component (rather than a branch inside EditorPage)
 * so the switch is reactive to `state.edit.contentType` changes — the
 * editor sidebar's future content-type switcher will see the preview swap
 * without a page reload.
 */
export function EditorPreviewDispatcher() {
  const { state } = useEditor();
  const kind = getEditorKind(state.edit?.contentType);
  if (kind === 'image') return <ImageEditorPreview />;
  return <EditorPreview />;
}
