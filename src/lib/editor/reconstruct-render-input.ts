/**
 * Reconstruct a RenderEditorVideoInput from a persisted contentItem row.
 *
 * Two data paths exist:
 *   1. Editor path – script/style/layout live inside enrichmentData.editorState
 *      (set when a user opens the editor).
 *   2. Campaign/Blitz path – script/style/layout live at the enrichmentData
 *      top level as editorScript / editorStyle / editorLayout (set during
 *      Phase 1 server-side generation).
 *
 * Both produce the same RenderEditorVideoInput — the engine doesn't care
 * where the data came from.
 */

import type { RenderEditorVideoInput } from './render-editor-video';

export type ReconstructResult =
  | { ok: true; input: RenderEditorVideoInput }
  | { ok: false; reason: string };

/**
 * Try to build a RenderEditorVideoInput from the content item's persisted
 * enrichment data.
 *
 * Returns `{ ok: false, reason }` when required fields are missing so the
 * caller can return a clear error message to the user rather than a cryptic
 * engine failure.
 */
export function reconstructRenderInput(
  enrichmentData: Record<string, unknown> | null | undefined,
  aspectRatio: string | null | undefined,
  contentType: string | null | undefined,
): ReconstructResult {
  if (!enrichmentData || typeof enrichmentData !== 'object') {
    return { ok: false, reason: 'No enrichment data found.' };
  }

  if (!contentType) {
    return { ok: false, reason: 'Content type is missing.' };
  }

  const mediaSlots = enrichmentData.sourceMediaSlots as Record<string, unknown> | undefined;
  if (!mediaSlots || typeof mediaSlots !== 'object') {
    return { ok: false, reason: 'No source media slots found.' };
  }

  // ── Data source: editorState (editor) vs top-level fields (campaign/Blitz) ─
  let script: any;
  let style: any;
  let layout: string;
  let audioTrack: RenderEditorVideoInput['audioTrack'];

  const editorState = enrichmentData.editorState as Record<string, unknown> | undefined;

  if (editorState && typeof editorState === 'object') {
    // Path A: Editor. script/style/layout inside editorState.
    script = (editorState.script as Record<string, unknown>) || {};
    style = (editorState.style as Record<string, unknown>) || {};
    layout = (editorState.layout as string) || 'centered';
    audioTrack = (enrichmentData.audioTrack as RenderEditorVideoInput['audioTrack']) ||
      (editorState.audioTrack as RenderEditorVideoInput['audioTrack']) ||
      null;
  } else {
    // Path B: Campaign / Blitz. Fields stored at enrichmentData top level.
    const editorScript = enrichmentData.editorScript as Record<string, unknown> | undefined;
    if (!editorScript || typeof editorScript !== 'object') {
      return { ok: false, reason: 'No editor state or editor script found.' };
    }
    script = editorScript;
    style = (enrichmentData.editorStyle as Record<string, unknown>) || {};
    layout = (enrichmentData.editorLayout as string) || 'centered';
    audioTrack = (enrichmentData.audioTrack as RenderEditorVideoInput['audioTrack']) || null;
  }

  return {
    ok: true,
    input: {
      script,
      style,
      layout,
      aspectRatio: aspectRatio || '9:16',
      mediaSlots,
      contentType,
      audioTrack,
    },
  };
}
