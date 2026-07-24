import { describe, expect, it } from 'vitest';

import type { ExecutionContext } from './execution';
import {
  AdapterNotConfiguredError,
  getExecutionAdapter,
  registerExecutionAdapter,
  unregisterExecutionAdapter,
} from './execution';
import { createApiExecutionAdapter, type PlatformClient } from './execution-api';

const ctx: ExecutionContext = {
  managedAccountId: 'a',
  platform: 'tiktok',
  country: 'US',
  strategy: 'official_api',
};

function fakeClient(over: Partial<PlatformClient> = {}): PlatformClient {
  return {
    platform: 'tiktok',
    execute: async () => ({ evidenceUrl: 'https://x/post/1' }),
    ...over,
  };
}

describe('createApiExecutionAdapter', () => {
  it('maps a successful platform call to completed + evidence', async () => {
    const adapter = createApiExecutionAdapter(
      'official_api',
      new Map([['tiktok', fakeClient()]]),
    );
    const res = await adapter.execute('publish_post', ctx);
    expect(res.outcome).toBe('completed');
    expect(res.evidenceUrl).toBe('https://x/post/1');
  });

  it('maps a thrown client error to failed with the message', async () => {
    const client = fakeClient({
      execute: async () => {
        throw new Error('api 429');
      },
    });
    const adapter = createApiExecutionAdapter('official_api', new Map([['tiktok', client]]));
    const res = await adapter.execute('publish_post', ctx);
    expect(res.outcome).toBe('failed');
    expect(res.detail).toBe('api 429');
  });

  it('fails when no client is configured for the platform', async () => {
    const adapter = createApiExecutionAdapter('official_api', new Map());
    const res = await adapter.execute('publish_post', ctx);
    expect(res.outcome).toBe('failed');
    expect(res.detail).toMatch(/no official_api client/);
  });

  it('dispatches the operation to the client', async () => {
    let seen: string | null = null;
    const client = fakeClient({
      execute: async (op) => {
        seen = op;
        return {};
      },
    });
    const adapter = createApiExecutionAdapter('official_api', new Map([['tiktok', client]]));
    await adapter.execute('apply_profile', ctx);
    expect(seen).toBe('apply_profile');
  });
});

describe('registerExecutionAdapter', () => {
  it('registers then unregisters an adapter (fail-closed restored)', () => {
    const adapter = createApiExecutionAdapter('official_api', new Map());
    registerExecutionAdapter(adapter);
    expect(getExecutionAdapter('official_api')).toBe(adapter);

    unregisterExecutionAdapter('official_api');
    expect(() => getExecutionAdapter('official_api')).toThrow(AdapterNotConfiguredError);
  });
});
