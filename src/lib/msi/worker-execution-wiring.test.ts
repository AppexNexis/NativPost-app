import { describe, expect, it } from 'vitest';

import {
  AdapterNotConfiguredError,
  getExecutionAdapter,
} from './execution';
import { ensureExecutionAdaptersRegistered } from './worker-service';

// Verifies the first production execution path is wired: the worker's call site
// (getExecutionAdapter) resolves `official_api` to an adapter that routes to the
// registered platform clients, while unconfigured strategies/platforms stay
// fail-closed. Does NOT hit the DB or network — it exercises only the wiring,
// so it never calls the Instagram client's execute (which would need both).

describe('worker execution wiring', () => {
  it('official_api is fail-closed until the worker registers it', () => {
    // Fresh module registry (vitest isolates per file): before registration the
    // strategy has no adapter and throws.
    expect(() => getExecutionAdapter('official_api')).toThrow(
      AdapterNotConfiguredError,
    );
  });

  it('registers the official_api adapter at the worker call site (idempotent)', () => {
    ensureExecutionAdaptersRegistered();
    ensureExecutionAdaptersRegistered(); // second call is a no-op

    const adapter = getExecutionAdapter('official_api');

    expect(adapter.strategy).toBe('official_api');
  });

  it('keeps delegated_access fail-closed (not yet integrated)', () => {
    ensureExecutionAdaptersRegistered();
    expect(() => getExecutionAdapter('delegated_access')).toThrow(
      AdapterNotConfiguredError,
    );
  });

  it('routes a platform with no client to a visible failure, not a silent no-op', async () => {
    ensureExecutionAdaptersRegistered();
    const adapter = getExecutionAdapter('official_api');

    const result = await adapter.execute('publish_post', {
      managedAccountId: 'acc-1',
      platform: 'pinterest', // no client registered → must fail visibly
      country: 'US',
      strategy: 'official_api',
    });

    expect(result.outcome).toBe('failed');
    expect(result.detail).toContain('pinterest');
  });
});
