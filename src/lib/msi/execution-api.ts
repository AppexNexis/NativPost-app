// Typed API adapter seam (docs §3.3; Phase 0 §2). The `official_api` /
// `delegated_access` strategies operate accounts by calling platform clients.
// This module builds the ADAPTER (operation dispatch + result mapping) against
// a `PlatformClient` interface, so it is fully testable with a fake client. The
// concrete Meta / TikTok / ... clients (real HTTP + credentials) are the wiring
// point — implement PlatformClient, then register the adapter at bootstrap:
//
//   const clients = new Map([
//     ['instagram', metaClient],
//     ['tiktok', tiktokClient],
//   ]);
//   registerExecutionAdapter(createApiExecutionAdapter('official_api', clients));
//
// Until registered, the strategy fails closed (the worker skips those jobs).

import type {
  ExecutionAdapter,
  ExecutionContext,
  ExecutionOperation,
  ExecutionResult,
  ExecutionStrategy,
} from './execution';

/** What a platform client returns on success. It throws on failure. */
export type PlatformCallResult = {
  evidenceUrl?: string;
  detail?: string;
};

/**
 * Per-platform integration contract. A concrete client (Meta Graph, TikTok
 * Content Posting, a Business-Center delegation, ...) implements this with real
 * API calls + credentials. The adapter is built against this interface only.
 */
export type PlatformClient = {
  readonly platform: string;
  execute: (
    operation: ExecutionOperation,
    ctx: ExecutionContext,
  ) => Promise<PlatformCallResult>;
};

export type PlatformClientRegistry = Map<string, PlatformClient>;

/**
 * Build an API-style execution adapter (works for both `official_api` and
 * `delegated_access` — the difference lives inside the client). Dispatches each
 * operation to the platform's client and maps the result uniformly:
 *   success            → completed (+ evidence)
 *   client throws      → failed (with the reason)
 *   no client/platform → failed (visible misconfiguration, never a silent no-op)
 */
export function createApiExecutionAdapter(
  strategy: ExecutionStrategy,
  clients: PlatformClientRegistry,
): ExecutionAdapter {
  return {
    strategy,
    async execute(
      operation: ExecutionOperation,
      ctx: ExecutionContext,
    ): Promise<ExecutionResult> {
      const client = clients.get(ctx.platform);
      if (!client) {
        return {
          outcome: 'failed',
          detail: `no ${strategy} client configured for ${ctx.platform}`,
        };
      }
      try {
        const res = await client.execute(operation, ctx);
        return {
          outcome: 'completed',
          detail: res.detail,
          evidenceUrl: res.evidenceUrl,
        };
      } catch (err) {
        return {
          outcome: 'failed',
          detail: err instanceof Error ? err.message : 'platform call failed',
        };
      }
    },
  };
}
