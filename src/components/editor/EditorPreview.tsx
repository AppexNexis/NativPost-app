import React from 'react';

import { useEditor } from './EditorContext';
import { SimpleVideoPreview } from './SimpleVideoPreview';

export function EditorPreview() {
  const { state } = useEditor();

  return (
    <div className="relative flex w-full items-center justify-center">
      <SimpleVideoPreview
        contentType={state.edit?.contentType || 'text'}
        script={state.script}
        style={state.style}
        mediaSlots={state.mediaSlots}
        aspectRatio={state.aspectRatio}
        layout={state.layout}
      />
      {state.isSaving && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-white">
          Saving…
        </div>
      )}
    </div>
  );
}
