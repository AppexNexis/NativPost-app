/**
 * Editor content-type registry — single source of truth for how the editor
 * behaves per content type.
 *
 * Historically the tab set, slot map, and CT label map lived duplicated across
 * `EditorSidebar.tsx`, `EditorLayout.tsx`, and `MediaTab.tsx`. Content types
 * split further into two *kinds* — video-shaped (Remotion + video engine) and
 * image-shaped (Image Engine). This module centralizes both so the Editor
 * shell + the Create page consume one canonical enum.
 *
 * Add a new content type by extending `EDITOR_KIND` + the three per-type maps.
 * Everything downstream (EditorSidebar tabs, MediaTab slot rendering,
 * EditorLayout preview + publish, RemotionPreviewPlayer composition dispatch)
 * derives from these constants.
 */

// ── Kinds — decide which editor experience loads ────────────────
// - 'video' → Remotion preview + /api/editor/render (video engine)
// - 'image' → ImageEditorPreview (per-slide DOM) + /api/editor/render-image
// - 'text'  → no preview media, script-only publish (text_only)
export type EditorKind = 'video' | 'image' | 'text';

export const EDITOR_KIND: Record<string, EditorKind> = {
  // Video kind — driven by the video engine + Remotion compositions
  reel: 'video',
  video_hook: 'video',
  video_hook_demo: 'video',
  ugc: 'video',
  talking_head: 'video',
  green_screen: 'video',
  wall_of_text: 'video',
  // Image kind — driven by the Image Engine
  single_image: 'image',
  slideshow: 'image',
  carousel: 'image',
  data_story: 'image',
  // Text kind
  text_only: 'text',
};

export function getEditorKind(contentType: string | null | undefined): EditorKind {
  if (!contentType) return 'video';
  return EDITOR_KIND[contentType] ?? 'video';
}

// ── Editor tab visibility per content type ──────────────────────
// Same tab IDs as `EditorSidebar` uses. Image kind excludes Audio (no
// soundtrack in a static-image or PDF-style carousel). Text-only shows just
// the Text tab.
export const EDITOR_TABS_BY_TYPE: Record<string, string[]> = {
  text_only: ['text'],
  // Image kind
  single_image: ['text', 'layout', 'media'],
  slideshow: ['text', 'layout', 'media'],
  carousel: ['text', 'layout', 'media'],
  data_story: ['text', 'layout', 'media'],
  // Video kind
  reel: ['text', 'layout', 'media', 'audio'],
  video_hook: ['text', 'layout', 'media', 'audio'],
  video_hook_demo: ['text', 'layout', 'media', 'audio'],
  ugc: ['text', 'layout', 'media', 'audio'],
  talking_head: ['text', 'layout', 'media', 'audio'],
  green_screen: ['text', 'layout', 'media', 'audio'],
  wall_of_text: ['text', 'layout', 'audio'],
};

export function getEditorTabs(contentType: string | null | undefined): string[] {
  if (!contentType) return ['text', 'layout', 'media', 'audio'];
  return EDITOR_TABS_BY_TYPE[contentType] ?? ['text', 'layout', 'media', 'audio'];
}

// ── MediaTab slot visibility per content type ───────────────────
// Slot IDs are consumed by MediaTab and correspond to keys on
// `MediaSlots` (types/v2.ts): 'background' | 'hookVideo' | 'slides' |
// 'demoVideo'. Additional labels ('charts', 'faceVideo', 'subjectVideo')
// are UI-only aliases MediaTab renders custom UI for.
export const EDITOR_MEDIA_SLOTS_BY_TYPE: Record<string, string[]> = {
  text_only: [],
  single_image: ['background'],
  slideshow: ['slides'],
  carousel: ['slides'],
  data_story: ['slides'],
  reel: ['background', 'hookVideo'],
  video_hook: ['background', 'hookVideo'],
  video_hook_demo: ['background', 'hookVideo'],
  ugc: ['demoVideo'],
  talking_head: ['background', 'faceVideo'],
  green_screen: ['background', 'subjectVideo'],
  wall_of_text: ['background'],
};

export function getEditorMediaSlots(contentType: string | null | undefined): string[] {
  if (!contentType) return ['background'];
  return EDITOR_MEDIA_SLOTS_BY_TYPE[contentType] ?? ['background'];
}

// ── Display labels for content types ────────────────────────────
export const EDITOR_CT_LABELS: Record<string, string> = {
  text_only: 'Text',
  single_image: 'Image',
  slideshow: 'Slideshow',
  carousel: 'Carousel',
  data_story: 'Data Story',
  reel: 'Video',
  video_hook: 'Video Hook',
  video_hook_demo: 'Video Hook Demo',
  ugc: 'UGC',
  talking_head: 'Talking Head',
  green_screen: 'Green Screen',
  wall_of_text: 'Wall of Text',
};

export function getEditorLabel(contentType: string | null | undefined): string {
  if (!contentType) return 'Content';
  return (
    EDITOR_CT_LABELS[contentType]
    ?? contentType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  );
}

// ── Content mode vocabulary ─────────────────────────────────────
// Editor's mode set (matches EditorSidebar's toggle: normal/promo/educational
// /trending). Create page has a different vocab (normal/concise/controversial)
// — that drift is tracked as a follow-up and NOT resolved here to avoid
// breaking historical rows persisted under the Create page's ids.
export const CONTENT_MODES = [
  { id: 'normal', label: 'Normal' },
  { id: 'promo', label: 'Promo' },
  { id: 'educational', label: 'Educate' },
  { id: 'trending', label: 'Trending' },
] as const;

export type ContentModeId = (typeof CONTENT_MODES)[number]['id'];
