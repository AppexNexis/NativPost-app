import React from 'react';
import { useEditor } from '../EditorContext';
import { getEditorKind } from '@/lib/editor/content-type-registry';

// ── Layout definitions ───────────────────────────────────────────
type LayoutDef = {
  id: string;
  label: string;
  description: string;
  contentTypes: string[]; // empty = all
};

// Layouts that only make sense for video kind (motion / camera-driven).
const VIDEO_ONLY_LAYOUTS = new Set(['talking_head', 'green_screen', 'video_hook']);
// Layouts that only make sense for image kind (static overlay).
const IMAGE_ONLY_LAYOUTS = new Set(['wall_of_text']);

const ALL_LAYOUTS: LayoutDef[] = [
  { id: 'centered', label: 'Centered', description: 'Text centered on screen', contentTypes: [] },
  { id: 'bottom_caption', label: 'Bottom Caption', description: 'Text at bottom, media above', contentTypes: [] },
  { id: 'top_caption', label: 'Top Caption', description: 'Text at top, media below', contentTypes: [] },
  { id: 'split_screen', label: 'Split Screen', description: 'Text on one side, media on other', contentTypes: [] },
  { id: 'wall_of_text', label: 'Wall of Text', description: 'Large text filling screen', contentTypes: ['wall_of_text'] },
  { id: 'talking_head', label: 'Talking Head', description: 'Speaker with overlaid text', contentTypes: ['talking_head'] },
  { id: 'green_screen', label: 'Green Screen', description: 'Subject with keyed background', contentTypes: ['green_screen'] },
  { id: 'video_hook', label: 'Video Hook', description: 'B-roll with text overlay', contentTypes: ['reel', 'ugc'] },
];

const ASPECT_RATIOS = ['9:16', '1:1', '16:9'];

export function LayoutTab() {
  const { state, dispatch } = useEditor();

  // Branch layout options on editor kind — image editor never renders
  // motion/talking-head layouts; video editor never renders static wall-of-text
  // (unless the content type itself is `wall_of_text`).
  const contentType = state.edit?.contentType ?? null;
  const editorKind = getEditorKind(contentType);

  const layouts = ALL_LAYOUTS.filter(layout => {
    if (editorKind === 'image' && VIDEO_ONLY_LAYOUTS.has(layout.id)) return false;
    if (
      editorKind === 'video'
      && IMAGE_ONLY_LAYOUTS.has(layout.id)
      && contentType !== 'wall_of_text'
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Layout */}
      <div>
        <label className="mb-3 block text-xs font-medium uppercase tracking-wide text-foreground">
          Layout
        </label>
        <div className="grid grid-cols-2 gap-2">
          {layouts.map(layout => {
            const isSelected = state.layout === layout.id;
            return (
              <button
                key={layout.id}
                onClick={() => dispatch({ type: 'SET_LAYOUT', payload: layout.id })}
                className={`rounded-xl border-2 p-3 text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/30 hover:bg-muted/30'
                }`}
              >
                <p className={`text-xs font-semibold ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                  {layout.label}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground leading-tight">{layout.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Aspect ratio */}
      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-foreground">Aspect ratio</label>
        <div className="flex gap-2">
          {ASPECT_RATIOS.map(ar => (
            <button
              key={ar}
              onClick={() => dispatch({ type: 'SET_ASPECT_RATIO', payload: ar })}
              className={`flex-1 rounded-lg border-2 px-3 py-2.5 text-center text-xs font-medium transition-all ${
                state.aspectRatio === ar
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/30'
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
