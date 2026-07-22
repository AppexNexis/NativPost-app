import { describe, expect, it } from 'vitest';

import { CONTENT_LANGUAGE_GROUPS, CONTENT_LANGUAGES, contentLanguageLabel } from './content-languages';

describe('content-languages', () => {
  it('offers a broad catalog (50–100+ languages)', () => {
    expect(CONTENT_LANGUAGES.length).toBeGreaterThanOrEqual(50);
  });

  it('has no duplicate codes', () => {
    const codes = CONTENT_LANGUAGES.map(l => l.value);

    expect(new Set(codes).size).toBe(codes.length);
  });

  it('every language has a non-empty label and native name', () => {
    for (const lang of CONTENT_LANGUAGES) {
      expect(lang.label.length).toBeGreaterThan(0);
      expect(lang.native.length).toBeGreaterThan(0);
    }
  });

  it('groups cover every language exactly once', () => {
    const grouped = CONTENT_LANGUAGE_GROUPS.flatMap(g => g.languages);

    expect(grouped.length).toBe(CONTENT_LANGUAGES.length);
  });

  it('keeps the existing stored defaults valid (en/es/fr/pt)', () => {
    for (const code of ['en', 'es', 'fr', 'pt']) {
      expect(CONTENT_LANGUAGES.some(l => l.value === code)).toBe(true);
    }
  });

  it('labels known codes and falls back to the raw code for unknown ones', () => {
    expect(contentLanguageLabel('de')).toBe('German — Deutsch');
    expect(contentLanguageLabel('en')).toBe('English');
    expect(contentLanguageLabel('xx')).toBe('xx');
  });
});
