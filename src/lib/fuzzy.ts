/**
 * Subsequence fuzzy match. Returns a relevance score, or null when the
 * query is not a subsequence of the target. Word-start hits score highest,
 * contiguous runs next, scattered matches lowest; earlier matches win ties.
 *
 * Used by the command palette; suitable for any small in-memory index.
 */
export function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!q) {
    return 0;
  }
  let score = 0;
  let ti = 0;
  let prevMatch = -2;
  for (let qi = 0; qi < q.length; qi++) {
    const idx = t.indexOf(q[qi]!, ti);
    if (idx === -1) {
      return null;
    }
    if (idx === 0 || t[idx - 1] === ' ' || t[idx - 1] === '-') {
      score += 3; // word start
    } else if (idx === prevMatch + 1) {
      score += 2; // contiguous
    } else {
      score += 1;
    }
    prevMatch = idx;
    ti = idx + 1;
  }
  // Prefer shorter targets and earlier first-hits
  return score + Math.max(0, 8 - t.indexOf(q[0]!)) - t.length / 50;
}
