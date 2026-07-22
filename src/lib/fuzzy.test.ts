import { describe, expect, it } from 'vitest';

import { fuzzyScore } from './fuzzy';

describe('fuzzyScore', () => {
  it('returns null when the query is not a subsequence', () => {
    expect(fuzzyScore('xyz', 'Calendar')).toBeNull();
    expect(fuzzyScore('calz', 'Calendar')).toBeNull();
  });

  it('matches subsequences case-insensitively', () => {
    expect(fuzzyScore('cal', 'Calendar')).not.toBeNull();
    expect(fuzzyScore('CAL', 'calendar')).not.toBeNull();
  });

  it('an empty query matches everything with score 0', () => {
    expect(fuzzyScore('', 'Anything')).toBe(0);
  });

  it('prefers word-start matches over scattered ones', () => {
    // "bp" hits both word starts in "Brand Profile" but is scattered in "Blitz post"
    const wordStart = fuzzyScore('bp', 'Brand Profile')!;
    const scattered = fuzzyScore('bp', 'Blitz repost')!;

    expect(wordStart).toBeGreaterThan(scattered);
  });

  it('prefers contiguous runs over scattered matches', () => {
    const contiguous = fuzzyScore('cal', 'Calendar')!;
    const scattered = fuzzyScore('cal', 'Create althing')!;

    expect(contiguous).toBeGreaterThan(scattered);
  });

  it('ranks the exact page above a loose match for a real nav query', () => {
    const analytics = fuzzyScore('ana', 'Analytics');
    const loose = fuzzyScore('ana', 'Plan anything');

    expect(analytics).not.toBeNull();
    expect(loose).not.toBeNull();
    expect(analytics!).toBeGreaterThan(loose!);
  });

  it('returns null when letters exist but not in order', () => {
    // 'ana' — "Campaigns" has no second "a" after its "n"
    expect(fuzzyScore('ana', 'Campaigns')).toBeNull();
  });
});
