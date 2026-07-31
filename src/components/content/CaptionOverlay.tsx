'use client';

/**
 * CaptionOverlay — the caption layer drawn over card-sized previews
 * (posts grid, campaign review grid, campaign calendar).
 *
 * Geometry comes from `caption-spec.ts`, which mirrors whichever renderer is
 * canonical for the content type (EditorComposition for video, SlideView for
 * image kinds). This component's job is to reproduce that spec *exactly* at an
 * arbitrary card width, with no rendering artefacts.
 *
 * Why it measures instead of letting CSS wrap
 * ───────────────────────────────────────────
 * The obvious implementation — one `display:inline` span with
 * `box-decoration-break: clone` — is what the big renderers use, and at 360px+
 * it looks right. Shrunk to a ~90-200px card it falls apart in two ways:
 *
 *   1. The soft-wrap space at the end of each visual line is painted *inside*
 *      that line's highlight box, so every line carries a ragged blank tail and
 *      centred text sits visibly off-centre.
 *   2. A fragment's background covers the font's content area (ascent+descent),
 *      not the 1.5 line-height. Whether consecutive boxes touch or leave a
 *      hairline gap therefore depends on the metrics of the font that actually
 *      loaded — Inter overlaps, an Arial fallback leaves a gap. Cards were
 *      falling back (the font registry was never imported outside the editor),
 *      which is where the "spaces on each text line" came from.
 *
 * So: break the lines here, in the 360px basis, with the same font/size the
 * detail frame uses; trim each line; give each its own block box of exactly
 * 1.5em. Result — identical line breaks to the detail frame at every card
 * width, no trailing space inside a box, and boxes that stack flush regardless
 * of which font is in play.
 */

import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';

import type { ContentItem } from '@/types/v2';

import type { CaptionSpec } from './caption-spec';
import {
  captionSpecKey,
  DETAIL_FRAME_WIDTH,
  getOverlayTextParts,
  resolveCaptionSpec,
} from './caption-spec';

// ── Text measurement ──────────────────────────────────────────────────────
// One shared canvas for the whole app; measuring is a few microseconds per
// line, so a grid of hundreds of cards costs nothing measurable.
let sharedCtx: CanvasRenderingContext2D | null | undefined;

function getCtx(): CanvasRenderingContext2D | null {
  if (sharedCtx !== undefined) {
    return sharedCtx;
  }
  if (typeof document === 'undefined') {
    sharedCtx = null;
    return null;
  }
  sharedCtx = document.createElement('canvas').getContext('2d');
  return sharedCtx;
}

// Canvas `font` shorthand needs quoted family names ("Public Sans") or the
// whole declaration is silently ignored and we'd measure in the default font.
function quoteFamily(family: string): string {
  return family
    .split(',')
    .map((part) => {
      const name = part.trim().replace(/^['"]|['"]$/g, '');
      return /^[\w-]+$/.test(name) ? name : `"${name}"`;
    })
    .join(', ');
}

// spec.fontFamily === null means "inherit the page font", which is what
// SlideView does when nothing is authored. Canvas can't inherit, so read the
// resolved stack off <body> once and measure against that.
let inheritedFamily: string | undefined;

function pageFamily(): string {
  if (inheritedFamily === undefined) {
    inheritedFamily = typeof document === 'undefined'
      ? 'sans-serif'
      : getComputedStyle(document.body).fontFamily || 'sans-serif';
  }
  return inheritedFamily;
}

export function canvasFontString(spec: CaptionSpec): string {
  const family = spec.fontFamily ? `${quoteFamily(spec.fontFamily)}, sans-serif` : pageFamily();
  return `${spec.fontStyle} ${spec.fontWeight} ${spec.fontPx}px ${family}`;
}

// useLayoutEffect so the measured lines replace the fallback before the browser
// paints; React warns if it runs during SSR, hence the isomorphic alias.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const LETTER_SPACING_EM = -0.01;

// A grid can hold hundreds of cards, but captions repeat across re-renders far
// more often than they change — cap the memo so it can't grow unbounded.
const LINE_CACHE_LIMIT = 500;
const lineCache = new Map<string, string[]>();

/**
 * Greedy word wrap — the same algorithm the browser uses for `white-space:
 * normal`, so the breaks match what CSS would have produced, minus the trailing
 * space. Newlines collapse to spaces exactly as they do in the canonical
 * renderers (both draw `{text}` with default white-space).
 */
export function wrapCaptionLines(spec: CaptionSpec, maxWidthPx: number): string[] {
  const words = spec.text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }

  const ctx = getCtx();
  if (!ctx || maxWidthPx <= 0) {
    return [words.join(' ')];
  }

  const font = canvasFontString(spec);
  // The authored family is usually still loading on first paint, so the first
  // pass measures against a fallback. That result must NOT be cached under the
  // same key as the post-load pass, or the re-measure would return it unchanged.
  let fontReady = true;
  try {
    fontReady = (document as any).fonts?.check?.(font) ?? true;
  } catch {
    // check() throws on a font string it can't parse — treat as ready so we
    // measure once and never re-run rather than taking the card down.
  }
  const cacheKey = `${captionSpecKey(spec)}|${maxWidthPx.toFixed(2)}|${fontReady}`;
  const cached = lineCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  ctx.font = font;
  // letterSpacing lands in Chrome 99+/Safari 17.4+; where it's missing we fold
  // the tracking into the measurement by hand.
  const nativeTracking = 'letterSpacing' in ctx;
  const trackingPx = LETTER_SPACING_EM * spec.fontPx;
  if (nativeTracking) {
    (ctx as any).letterSpacing = `${trackingPx}px`;
  }
  const measure = (s: string) =>
    ctx.measureText(s).width + (nativeTracking ? 0 : trackingPx * s.length);

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= maxWidthPx) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = '';
    }
    if (measure(word) <= maxWidthPx) {
      current = word;
      continue;
    }
    // Single word wider than the frame — hard-break it, mirroring
    // `word-break: break-word` in the canonical renderers.
    let chunk = '';
    for (const ch of word) {
      if (chunk && measure(chunk + ch) > maxWidthPx) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    current = chunk;
  }
  if (current) {
    lines.push(current);
  }

  if (lineCache.size >= LINE_CACHE_LIMIT) {
    lineCache.clear();
  }
  lineCache.set(cacheKey, lines);
  return lines;
}

// ── Component ─────────────────────────────────────────────────────────────
// Every length is emitted in `cqw` against the 360px basis, so the card is a
// proportional copy of the detail frame at any width. Box padding/radius stay
// em-based and scale with the font automatically.
const cqw = (px: number) => `${((px / DETAIL_FRAME_WIDTH) * 100).toFixed(4)}cqw`;

type Props = {
  item: ContentItem;
  /** Optional override; defaults to the item's own overlay text. */
  text?: string;
};

/**
 * Item-driven wrapper: resolves the spec from a saved post, then hands off to
 * `CaptionLayer`. Surfaces whose style isn't saved yet — the campaign post
 * editor, whose controls live in React state — build a spec with
 * `buildCaptionSpec` and render `CaptionLayer` directly.
 */
export function CaptionOverlay({ item, text }: Props) {
  const spec = useMemo(() => {
    const overlay = text === undefined
      ? getOverlayTextParts(item)
      : { text, scale: 1 };
    return resolveCaptionSpec(item, overlay);
  }, [item, text]);

  return <CaptionLayer spec={spec} />;
}

export function CaptionLayer({ spec }: { spec: CaptionSpec | null }) {
  // Text is wrapped in the 360px basis: the frame minus its padding, times the
  // caption block's max width, minus the highlight box's own horizontal padding
  // (0.42em a side). Identical inputs to the detail frame ⇒ identical breaks.
  const wrapWidthPx = spec
    ? (DETAIL_FRAME_WIDTH - spec.framePadPx * 2) * (spec.maxWidthPct / 100)
    - (spec.boxColor ? spec.fontPx * 0.84 : 0)
    : 0;

  const [lines, setLines] = useState<string[] | null>(null);
  const specKey = spec ? `${captionSpecKey(spec)}|${wrapWidthPx.toFixed(2)}` : '';

  useIsomorphicLayoutEffect(() => {
    if (!spec) {
      setLines(null);
      return;
    }
    let cancelled = false;
    const run = () => {
      if (!cancelled) {
        setLines(wrapCaptionLines(spec, wrapWidthPx));
      }
    };
    run();
    // Webfonts resolve after first paint; re-measure once the authored family
    // is actually available or the breaks would be computed against a fallback.
    const fonts = (document as any).fonts;
    if (fonts?.load) {
      fonts.load(canvasFontString(spec)).then(run).catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [specKey]);

  if (!spec) {
    return null;
  }

  const { position } = spec;
  const hasBox = !!spec.boxColor;

  const textStyle: React.CSSProperties = {
    // null → omit the declaration entirely so the page font is inherited,
    // exactly as SlideView leaves it when no family is authored.
    fontFamily: spec.fontFamily ?? undefined,
    fontWeight: spec.fontWeight,
    fontStyle: spec.fontStyle,
    textDecoration: spec.textDecoration,
    color: spec.color,
    lineHeight: 1.5,
    letterSpacing: `${LETTER_SPACING_EM}em`,
    ...(hasBox
      ? {
          backgroundColor: spec.boxColor!,
          borderRadius: '0.18em',
          boxShadow: '0 6px 24px rgba(0,0,0,0.28)',
        }
      : {
          textShadow: '0 2px 10px rgba(0,0,0,0.55)',
        }),
  };

  return (
    // containerType makes 1cqw == 1% of the card's width, so every cqw length
    // below scales with the card. Children read cqw from this ancestor.
    <div className="pointer-events-none absolute inset-0" style={{ containerType: 'inline-size' }}>
      {spec.dimming > 0 && (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: `rgba(0,0,0,${spec.dimming})` }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          top: position.top,
          bottom: position.bottom,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: position.justifyContent,
          alignItems: position.alignItems,
          padding: cqw(spec.framePadPx),
        }}
      >
        <div style={{ maxWidth: `${spec.maxWidthPct}%`, fontSize: cqw(spec.fontPx), textAlign: spec.align }}>
          {lines === null
            ? (
                // Pre-measurement paint (SSR + hydration): the classic inline
                // span. Swapped for measured lines in useLayoutEffect, i.e.
                // before the browser paints, so it is never visible client-side.
                <span
                  style={{
                    ...textStyle,
                    display: 'inline',
                    wordBreak: 'break-word',
                    boxDecorationBreak: 'clone',
                    WebkitBoxDecorationBreak: 'clone',
                    ...(hasBox ? { padding: '0.16em 0.42em' } : {}),
                  }}
                >
                  {spec.text}
                </span>
              )
            : lines.map((line, i) => (
                <div
                  // Lines are positional; text alone isn't unique (a caption can
                  // repeat a line).
                  key={`${i}-${line}`}
                  style={{
                    ...textStyle,
                    // A block box of exactly 1.5em (line-height) that hugs its
                    // own trimmed text: consecutive lines meet flush, and no
                    // soft-wrap space is ever painted inside a highlight box.
                    display: 'block',
                    width: 'fit-content',
                    whiteSpace: 'pre',
                    ...(hasBox ? { padding: '0 0.42em' } : {}),
                    marginLeft: spec.align === 'left' ? 0 : 'auto',
                    marginRight: spec.align === 'right' ? 0 : 'auto',
                  }}
                >
                  {line}
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}
