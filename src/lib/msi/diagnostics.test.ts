import { describe, expect, it } from 'vitest';

import { buildChecks, type DiagnosticFacts, overallStatus } from './diagnostics';

const base: DiagnosticFacts = {
  platform: 'instagram',
  strategy: 'official_api',
  hasCredentials: true,
  now: 1_000_000_000_000,
  lastPublish: null,
  diagnosis: null,
};

const find = (checks: ReturnType<typeof buildChecks>, key: string) =>
  checks.find(c => c.key === key)!;

describe('buildChecks — credentials + expiry', () => {
  it('fails when no credentials are captured', () => {
    const checks = buildChecks({ ...base, hasCredentials: false });
    expect(find(checks, 'credentials').status).toBe('fail');
    // expiry check is skipped without credentials
    expect(checks.find(c => c.key === 'token_expiry')).toBeUndefined();
  });

  it('grades token expiry ok / warn / fail / unknown', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(find(buildChecks({ ...base, tokenExpiresAt: base.now + 40 * day }), 'token_expiry').status).toBe('ok');
    expect(find(buildChecks({ ...base, tokenExpiresAt: base.now + 2 * day }), 'token_expiry').status).toBe('warn');
    expect(find(buildChecks({ ...base, tokenExpiresAt: base.now - 1 }), 'token_expiry').status).toBe('fail');
    expect(find(buildChecks({ ...base, tokenExpiresAt: undefined }), 'token_expiry').status).toBe('unknown');
  });
});

describe('buildChecks — strategy + live probe', () => {
  it('marks manual accounts info and skips the live probe', () => {
    const checks = buildChecks({ ...base, strategy: 'manual' });
    expect(find(checks, 'strategy').status).toBe('info');
    expect(find(checks, 'live_probe').detail).toMatch(/manual/i);
  });

  it('shows an unknown live probe when none is wired', () => {
    const checks = buildChecks({ ...base, diagnosis: null });
    expect(find(checks, 'live_probe').status).toBe('unknown');
  });

  it('expands a live diagnosis into reachable / token / identity / permission checks', () => {
    const checks = buildChecks({
      ...base,
      diagnosis: {
        reachable: true,
        tokenValid: true,
        identity: '@brand',
        permissions: [
          { name: 'instagram_content_publish', granted: true },
          { name: 'instagram_basic', granted: false },
        ],
      },
    });
    expect(find(checks, 'api_reachable').status).toBe('ok');
    expect(find(checks, 'token_valid').status).toBe('ok');
    expect(find(checks, 'identity').detail).toBe('@brand');
    expect(find(checks, 'perm_instagram_content_publish').status).toBe('ok');
    expect(find(checks, 'perm_instagram_basic').status).toBe('fail');
  });

  it('flags an invalid token', () => {
    const checks = buildChecks({
      ...base,
      diagnosis: { reachable: true, tokenValid: false, detail: 'code 190' },
    });
    expect(find(checks, 'token_valid').status).toBe('fail');
  });
});

describe('buildChecks — last publish', () => {
  it('reports success with latency', () => {
    const checks = buildChecks({
      ...base,
      lastPublish: { state: 'completed', latencyMs: 42_000, failureReason: null },
    });
    expect(find(checks, 'last_publish').status).toBe('ok');
    expect(find(checks, 'last_publish').detail).toMatch(/42s/);
  });

  it('reports failure with the reason', () => {
    const checks = buildChecks({
      ...base,
      lastPublish: { state: 'failed', latencyMs: null, failureReason: 'Unsupported image format' },
    });
    expect(find(checks, 'last_publish').status).toBe('fail');
    expect(find(checks, 'last_publish').detail).toMatch(/Unsupported image format/);
  });
});

describe('overallStatus', () => {
  it('returns the worst status present', () => {
    expect(overallStatus(buildChecks({ ...base, hasCredentials: false }))).toBe('fail');
    expect(
      overallStatus(
        buildChecks({
          ...base,
          tokenExpiresAt: base.now + 40 * 24 * 60 * 60 * 1000,
          diagnosis: { reachable: true, tokenValid: true, identity: '@b' },
          lastPublish: { state: 'completed', latencyMs: 1000, failureReason: null },
        }),
      ),
    ).toBe('ok');
  });
});
