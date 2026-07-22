import { describe, expect, it } from 'vitest';

import { PLATFORM_COLORS, PLATFORM_LABELS, platformColor, platformLabel, PLATFORMS } from './platforms';

describe('platforms', () => {
  it('returns canonical labels for known platforms', () => {
    expect(platformLabel('instagram')).toBe('Instagram');
    expect(platformLabel('twitter')).toBe('X');
    expect(platformLabel('linkedin_page')).toBe('LinkedIn Page');
  });

  it('falls back to the raw key for unknown platforms', () => {
    expect(platformLabel('mastodon')).toBe('mastodon');
  });

  it('returns a neutral color for unknown platforms', () => {
    expect(platformColor('mastodon')).toBe('bg-zinc-500');
  });

  it('flat maps stay in sync with the canonical record', () => {
    for (const [key, meta] of Object.entries(PLATFORMS)) {
      expect(PLATFORM_LABELS[key]).toBe(meta.label);
      expect(PLATFORM_COLORS[key]).toBe(meta.color);
    }
  });

  it('every platform has a non-empty label and a bg-* color class', () => {
    for (const meta of Object.values(PLATFORMS)) {
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.color).toMatch(/^bg-/);
    }
  });
});
