import React from 'react';
import { useEditor } from '../EditorContext';

const LAYOUTS = [
  { id: 'centered', label: 'Centered', description: 'Text centered on screen' },
  { id: 'bottom_caption', label: 'Bottom Caption', description: 'Text at bottom, media above' },
  { id: 'top_caption', label: 'Top Caption', description: 'Text at top, media below' },
  { id: 'split_screen', label: 'Split Screen', description: 'Text on one side, media on other' },
  { id: 'wall_of_text', label: 'Wall of Text', description: 'Large text filling screen' },
  { id: 'talking_head', label: 'Talking Head', description: 'Speaker with overlaid text' },
  { id: 'green_screen', label: 'Green Screen', description: 'Subject with keyed background' },
  { id: 'video_hook', label: 'Video Hook', description: 'B-roll with text overlay' },
];

const ASPECT_RATIOS = ['9:16', '1:1', '16:9'];

export function LayoutTab() {
  const { state, dispatch } = useEditor();

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-3 block text-xs font-medium uppercase tracking-wide text-foreground">LAYOUT</label>
        <div className="grid grid-cols-2 gap-2">
          {LAYOUTS.map(layout => (
            <button
              key={layout.id}
              onClick={() => dispatch({ type: 'SET_LAYOUT', payload: layout.id })}
              className={`rounded-xl border-2 p-3 text-left transition-all ${
                state.layout === layout.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/30 hover:bg-muted/30'
              }`}
            >
              <p className={`text-xs font-semibold ${state.layout === layout.id ? 'text-primary' : 'text-foreground'}`}>
                {layout.label}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground leading-tight">{layout.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-border" />

      <div>
        <label className="mb-3 block text-xs font-medium uppercase tracking-wide text-foreground">ASPECT RATIO</label>
        <div className="flex gap-2">
          {ASPECT_RATIOS.map(ar => (
            <button
              key={ar}
              onClick={() => dispatch({ type: 'SET_ASPECT_RATIO', payload: ar })}
              className={`flex-1 rounded-lg border-2 py-2.5 text-sm font-medium transition-all ${
                state.aspectRatio === ar
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/30 hover:text-foreground'
              }`}
            >
              {ar}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
