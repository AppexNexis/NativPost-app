// Platforms that support a distinct title field separate from the caption.
// Imported by the generate route (server) and the content detail page (client).
// Must stay in sync with TITLE_PLATFORMS in app/engine/content_generator.py.
export const TITLE_PLATFORMS = ['youtube', 'pinterest'] as const;
export type TitlePlatform = typeof TITLE_PLATFORMS[number];
