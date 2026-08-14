import { describe, expect, it } from 'vitest';

import { TEXT_LIMITS } from '@/components/editor/compositions/text-limits';

import {
  composeCaptionFromScript,
  deriveScriptFromCaption,
  isAuthoredScript,
  isBlankScript,
  resolveItemScript,
  tightenCta,
} from './derive-script';

describe('isAuthoredScript', () => {
  it('treats an emptied script as authored — a cleared field is a decision', () => {
    expect(isAuthoredScript({ hookText: '', bodyText: '', ctaText: '' })).toBe(true);
  });

  it('treats a missing or empty script as unauthored', () => {
    expect(isAuthoredScript(null)).toBe(false);
    expect(isAuthoredScript(undefined)).toBe(false);
    expect(isAuthoredScript({})).toBe(false);
    expect(isAuthoredScript({ editorStyle: {} })).toBe(false);
  });

  it('counts slide copy as authored text', () => {
    expect(isAuthoredScript({ slideCopy: [] })).toBe(true);
  });
});

describe('isBlankScript', () => {
  it('is true for a script whose every field was cleared', () => {
    expect(isBlankScript({ hookText: '', bodyText: '  ', ctaText: '' })).toBe(true);
    expect(isBlankScript({ slideCopy: ['', '  '] })).toBe(true);
  });

  it('is false when any field still carries copy', () => {
    expect(isBlankScript({ hookText: '', bodyText: 'still here' })).toBe(false);
    expect(isBlankScript({ slideCopy: [{ text: 'slide one' }] })).toBe(false);
  });
});

describe('tightenCta', () => {
  it('keeps a short CTA verbatim', () => {
    expect(tightenCta('Link in bio.')).toBe('Link in bio.');
  });

  it('keeps only the closing sentence of a paragraph', () => {
    const cta = tightenCta(
      "studio-crafted content isn't a luxury. it's the baseline for brands",
    );

    expect(cta).not.toContain('luxury');
    expect(cta.length).toBeLessThanOrEqual(TEXT_LIMITS.cta);
  });

  it('fits within the CTA budget even with no sentence break', () => {
    const cta = tightenCta('a'.repeat(200));

    expect(cta.length).toBeLessThanOrEqual(TEXT_LIMITS.cta);
  });

  it('never advertises the cut with an ellipsis', () => {
    const cta = tightenCta(
      'for the first 50 signups we are offering 20 percent off, after that regular pricing applies',
    );

    expect(cta.endsWith('…')).toBe(false);
    expect(cta.endsWith('...')).toBe(false);
  });

  it('returns empty for empty input', () => {
    expect(tightenCta('')).toBe('');
    expect(tightenCta(null)).toBe('');
  });
});

describe('deriveScriptFromCaption', () => {
  it('caps every field to what the renderer fits', () => {
    const caption = [
      'h'.repeat(400),
      'b'.repeat(400),
      'c'.repeat(400),
    ].join('\n');

    const script = deriveScriptFromCaption(caption);

    expect(script.hookText!.length).toBeLessThanOrEqual(TEXT_LIMITS.hook);
    expect(script.bodyText!.length).toBeLessThanOrEqual(TEXT_LIMITS.body);
    expect(script.ctaText!.length).toBeLessThanOrEqual(TEXT_LIMITS.cta);
  });

  it('maps a single line to the hook only', () => {
    expect(deriveScriptFromCaption('one line')).toEqual({ hookText: 'one line' });
  });

  it('returns an empty script for empty input', () => {
    expect(deriveScriptFromCaption('')).toEqual({});
    expect(deriveScriptFromCaption(null)).toEqual({});
  });
});

describe('resolveItemScript', () => {
  it('does NOT resurrect the caption for a script the author cleared', () => {
    const script = resolveItemScript({
      caption: 'we started nativpost because we kept seeing the same problem',
      enrichmentData: { editorScript: { hookText: '', bodyText: '', ctaText: '' } },
    });

    expect(script).toEqual({ hookText: '', bodyText: '', ctaText: '' });
  });

  it('falls back to the caption for a legacy item with no script', () => {
    const script = resolveItemScript({
      caption: 'hook line\nbody line',
      enrichmentData: {},
    });

    expect(script.hookText).toBe('hook line');
    expect(script.bodyText).toBe('body line');
  });

  it('returns the authored script untouched when it has copy', () => {
    const script = resolveItemScript({
      caption: 'stale caption',
      enrichmentData: { editorScript: { hookText: 'authored hook' } },
    });

    expect(script.hookText).toBe('authored hook');
  });
});

describe('composeCaptionFromScript', () => {
  it('empties the caption when every field was cleared', () => {
    expect(composeCaptionFromScript({ hookText: '', bodyText: '', ctaText: '' })).toBe('');
  });

  it('joins the authored parts in reading order', () => {
    expect(composeCaptionFromScript({ hookText: 'hook', bodyText: 'body', ctaText: 'cta' }))
      .toBe('hook\n\nbody\n\ncta');
  });

  it('falls back to wall text, then slide copy', () => {
    expect(composeCaptionFromScript({ wallText: 'the wall' })).toBe('the wall');
    expect(composeCaptionFromScript({ slideCopy: ['one', { text: 'two' }] })).toBe('one\n\ntwo');
  });
});
