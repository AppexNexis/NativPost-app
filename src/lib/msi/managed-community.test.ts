import { describe, expect, it } from 'vitest';

import {
  communityQuotaForTier,
  isUnlimited,
  MANAGED_COMMUNITY_QUOTA,
  remainingReplies,
} from './managed-community';

describe('Managed Community quota', () => {
  it('maps tiers to monthly reply quotas', () => {
    expect(communityQuotaForTier('basic')).toBe(500);
    expect(communityQuotaForTier('active')).toBe(1000);
    expect(communityQuotaForTier('unlimited')).toBe(-1);
  });

  it('returns null for unknown / missing tiers', () => {
    expect(communityQuotaForTier('nope')).toBeNull();
    expect(communityQuotaForTier(null)).toBeNull();
    expect(communityQuotaForTier(undefined)).toBeNull();
  });

  it('matches the catalog tier ids', () => {
    expect(Object.keys(MANAGED_COMMUNITY_QUOTA).sort()).toEqual(['active', 'basic', 'unlimited']);
  });

  it('detects unlimited', () => {
    expect(isUnlimited(-1)).toBe(true);
    expect(isUnlimited(500)).toBe(false);
  });

  it('computes remaining, with unlimited as Infinity', () => {
    expect(remainingReplies(500, 120)).toBe(380);
    expect(remainingReplies(500, 500)).toBe(0);
    expect(remainingReplies(500, 700)).toBe(0);
    expect(remainingReplies(-1, 9999)).toBe(Number.POSITIVE_INFINITY);
  });
});
