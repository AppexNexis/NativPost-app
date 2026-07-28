/**
 * Editor font registry — the single app-side source of truth.
 *
 * WYSIWYG CONTRACT: every font here MUST also be registered, byte-for-byte, in
 * the engine renderer at
 *   NativPost-engine/video-renderer/src/compositions/EditorComposition.tsx
 * or published video text will fall back to a different typeface than the
 * editor preview. The image engine (image-engine/src/routes/slide.ts) builds a
 * dynamic Google Fonts @import from any family name, so carousel/slideshow/
 * data_story slide bakes pick these up automatically.
 *
 * Importing this module runs each loadFont() side effect, which injects the
 * @font-face rules globally — that is what makes these fonts available not just
 * to the Remotion compositions but also to the DOM previews (SlideView,
 * ImageEditorPreview) and the raw-fontFamily compositions (Slideshow,
 * DataStory) without needing next/font.
 *
 * All families are Google Fonts available via @remotion/google-fonts.
 */

import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadRoboto } from '@remotion/google-fonts/Roboto';
import { loadFont as loadMontserrat } from '@remotion/google-fonts/Montserrat';
import { loadFont as loadPoppins } from '@remotion/google-fonts/Poppins';
import { loadFont as loadPublicSans } from '@remotion/google-fonts/PublicSans';
import { loadFont as loadWorkSans } from '@remotion/google-fonts/WorkSans';
import { loadFont as loadNunito } from '@remotion/google-fonts/Nunito';
import { loadFont as loadOswald } from '@remotion/google-fonts/Oswald';
import { loadFont as loadAnton } from '@remotion/google-fonts/Anton';
import { loadFont as loadBebasNeue } from '@remotion/google-fonts/BebasNeue';
import { loadFont as loadArchivoBlack } from '@remotion/google-fonts/ArchivoBlack';
import { loadFont as loadPlayfair } from '@remotion/google-fonts/PlayfairDisplay';
import { loadFont as loadLora } from '@remotion/google-fonts/Lora';
import { loadFont as loadMerriweather } from '@remotion/google-fonts/Merriweather';
import { loadFont as loadCaveat } from '@remotion/google-fonts/Caveat';
import { loadFont as loadPacifico } from '@remotion/google-fonts/Pacifico';
import { loadFont as loadBangers } from '@remotion/google-fonts/Bangers';

// Keys = the exact family names shown in the picker and stored in
// TextStyle.fontFamily. Order here is the picker order.
export const FONT_REGISTRY: Record<string, { fontFamily: string }> = {
  'Inter': loadInter(),
  'Roboto': loadRoboto(),
  'Montserrat': loadMontserrat(),
  'Poppins': loadPoppins(),
  'Public Sans': loadPublicSans(),
  'Work Sans': loadWorkSans(),
  'Nunito': loadNunito(),
  'Oswald': loadOswald(),
  'Anton': loadAnton(),
  'Bebas Neue': loadBebasNeue(),
  'Archivo Black': loadArchivoBlack(),
  'Playfair Display': loadPlayfair(),
  'Lora': loadLora(),
  'Merriweather': loadMerriweather(),
  'Caveat': loadCaveat(),
  'Pacifico': loadPacifico(),
  'Bangers': loadBangers(),
};

// Ordered list of family names for the font picker. Derived from the registry
// so the picker and the render registry can never drift.
export const EDITOR_FONTS: string[] = Object.keys(FONT_REGISTRY);

// Resolve a stored family name to the loaded Remotion fontFamily string.
// Falls back to the raw name (system font) and finally to Inter.
export function resolveFont(fontFamily?: string): string {
  const inter = FONT_REGISTRY['Inter']?.fontFamily ?? 'Inter';
  if (!fontFamily) return inter;
  return FONT_REGISTRY[fontFamily]?.fontFamily || fontFamily;
}
