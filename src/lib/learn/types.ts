/**
 * Learning-centre content model.
 *
 * Guides are typed data rather than markdown files. That buys three things the
 * reference design needs and a markdown pipeline would have to reconstruct:
 *
 *   1. The table of contents is derived from `sections`, so an anchor can
 *      never drift from the heading it points at.
 *   2. Content is type-checked — a guide that links to a slug that doesn't
 *      exist, or forgets a summary, fails `check-types` rather than shipping.
 *   3. No new runtime dependency. The app has no markdown renderer, and the
 *      curated set here (a dozen or so guides, written by the team) does not
 *      justify adding one.
 *
 * Inline formatting inside `text` supports a deliberately small subset —
 * `**bold**`, `` `code` `` and `[label](href)` — rendered by `renderInline`
 * in components/learn/GuideBody.tsx.
 */

export type GuideBlock =
  /** A paragraph. */
  | { type: 'p'; text: string }
  /** A bulleted or numbered list. */
  | { type: 'list'; items: string[]; ordered?: boolean }
  /** Numbered steps with a bold lead-in — the "do this, then this" shape. */
  | { type: 'steps'; items: { title: string; text: string }[] }
  /** A highlighted aside. */
  | { type: 'callout'; tone: 'info' | 'tip' | 'warn'; text: string }
  /** A fenced code sample. */
  | { type: 'code'; lang?: string; code: string }
  /** A simple data table. */
  | { type: 'table'; head: string[]; rows: string[][] }
  /** A keyboard-shortcut row. */
  | { type: 'shortcuts'; items: { keys: string[]; label: string }[] };

export type GuideSection = {
  /** URL fragment. Must be unique within the guide and stable — it's linkable. */
  id: string;
  heading: string;
  blocks: GuideBlock[];
};

export type GuideVideo = {
  /**
   * Either an absolute URL, or a Cloudinary public id resolved against
   * NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME. See lib/learn/video.ts.
   */
  src: string;
  /** Poster image — same resolution rules as `src`. */
  poster?: string;
  /** Human label, e.g. "1:15". Shown on the card; not used for playback. */
  duration?: string;
};

export type GuideCategory =
  | 'start-here'
  | 'daily-workflow'
  | 'planning'
  | 'creating'
  | 'accounts'
  | 'developers';

export type Guide = {
  slug: string;
  title: string;
  /** One or two sentences. Shown on cards and as the article's lead. */
  summary: string;
  category: GuideCategory;
  /** Sort order within the category. */
  order: number;
  /** Promoted to the hero card on the index. Exactly one guide should set it. */
  featured?: boolean;
  video?: GuideVideo;
  /** Estimated read time in minutes. */
  readingMinutes: number;
  sections: GuideSection[];
  /** Slugs shown under "Read next". Validated by the registry. */
  readNext?: string[];
};

export const CATEGORY_LABELS: Record<GuideCategory, string> = {
  'start-here': 'Start here',
  'daily-workflow': 'Daily workflow',
  'planning': 'Planning ahead',
  'creating': 'Creating content',
  'accounts': 'Accounts & channels',
  'developers': 'For developers',
};

/** Display order of the category sections on the index page. */
export const CATEGORY_ORDER: GuideCategory[] = [
  'start-here',
  'accounts',
  'daily-workflow',
  'planning',
  'creating',
  'developers',
];
