import { describe, expect, it } from 'vitest';

import { parseChanges, parseReviewRequest } from './review-request';

describe('parseReviewRequest', () => {
  it('accepts approve', () => {
    expect(parseReviewRequest({ action: 'approve' })).toEqual({
      ok: true,
      value: { action: 'approve' },
    });
  });

  it('accepts request_changes and normalizes changes', () => {
    const res = parseReviewRequest({
      action: 'request_changes',
      changes: [{ field: '  Bio  ', note: 'shorter' }, { note: 'no field' }, null, 5],
    });
    expect(res.ok).toBe(true);
    if (res.ok && res.value.action === 'request_changes') {
      expect(res.value.changes).toEqual([
        { field: 'Bio', note: 'shorter' },
        { field: 'general', note: 'no field' },
      ]);
    }
  });

  it('rejects an unknown or missing action', () => {
    expect(parseReviewRequest({ action: 'delete' }).ok).toBe(false);
    expect(parseReviewRequest({}).ok).toBe(false);
    expect(parseReviewRequest(null).ok).toBe(false);
  });

  it('ignores changes on approve', () => {
    const res = parseReviewRequest({ action: 'approve', changes: [{ field: 'Bio' }] });
    expect(res.ok && res.value).toEqual({ action: 'approve' });
  });
});

describe('parseChanges', () => {
  it('returns [] for non-arrays', () => {
    expect(parseChanges(undefined)).toEqual([]);
    expect(parseChanges('x')).toEqual([]);
  });

  it('defaults field to "general" and note to empty string', () => {
    expect(parseChanges([{}])).toEqual([{ field: 'general', note: '' }]);
  });
});
