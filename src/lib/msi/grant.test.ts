import { describe, expect, it } from 'vitest';

import {
  assertActiveGrant,
  assertGrantCoversScope,
  GrantRequiredError,
  grantCoversScope,
  isGrantActive,
} from './grant';

const activeGrant = {
  status: 'active' as const,
  revokedAt: null,
  scope: { platforms: ['tiktok'], countries: ['US'] },
};

describe('grant enforcement', () => {
  it('treats only active, non-revoked grants as usable', () => {
    expect(isGrantActive(activeGrant)).toBe(true);
    expect(isGrantActive(null)).toBe(false);
    expect(isGrantActive(undefined)).toBe(false);
    expect(isGrantActive({ status: 'revoked', revokedAt: null })).toBe(false);
    expect(isGrantActive({ status: 'active', revokedAt: new Date() })).toBe(false);
  });

  it('assertActiveGrant throws GrantRequiredError for unusable grants', () => {
    expect(() => assertActiveGrant(null)).toThrow(GrantRequiredError);
    expect(() =>
      assertActiveGrant({ status: 'revoked', revokedAt: null }),
    ).toThrow(GrantRequiredError);
    expect(() => assertActiveGrant(activeGrant)).not.toThrow();
  });

  it('honours platform + country scope', () => {
    expect(grantCoversScope(activeGrant, { platform: 'tiktok', country: 'US' })).toBe(true);
    expect(grantCoversScope(activeGrant, { platform: 'instagram', country: 'US' })).toBe(false);
    expect(grantCoversScope(activeGrant, { platform: 'tiktok', country: 'UK' })).toBe(false);
  });

  it('treats an empty scope dimension as "all"', () => {
    const wide = { status: 'active', revokedAt: null, scope: { platforms: ['tiktok'] } };
    expect(grantCoversScope(wide, { platform: 'tiktok', country: 'anywhere' })).toBe(true);
    const openGrant = { status: 'active', revokedAt: null, scope: {} };
    expect(grantCoversScope(openGrant, { platform: 'x', country: 'y' })).toBe(true);
  });

  it('assertGrantCoversScope names the rejected platform/country', () => {
    expect(() =>
      assertGrantCoversScope(activeGrant, { platform: 'instagram', country: 'US' }),
    ).toThrow(/instagram in US/);
  });
});
