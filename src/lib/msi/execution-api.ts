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
  // The platform's own post id for a publish (media id, tweet id, …).
  platformPostId?: string;
  // `true` = the platform accepted the operation but is still processing it
  // (async). The adapter maps this to a `processing` outcome and persists
  // `providerHandle` so the runner can confirm on a later tick.
  pending?: boolean;
  providerHandle?: string;
};

/** Result of polling an async operation via `checkStatus`. Throws on failure. */
export type PlatformStatusResult =
  | { done: false }
  | {
      done: true;
      platformPostId?: string;
      evidenceUrl?: string;
      detail?: string;
    };

/**
 * Per-platform integration contract. A concrete client (Meta Graph, TikTok
 * Content Posting, a Business-Center delegation, ...) implements this with real
 * API calls + credentials. The adapter is built against this interface only.
 *
 * Async publishing: `execute` initiates and may return `{ pending: true,
 * providerHandle }`; the runner later calls `checkStatus(handle, ctx)` once per
 * tick until it resolves. Synchronous clients omit `checkStatus`.
 */
export type PlatformClient = {
  readonly platform: string;
  execute: (
    operation: ExecutionOperation,
    ctx: ExecutionContext,
  ) => Promise<PlatformCallResult>;
  checkStatus?: (
    handle: string,
    ctx: ExecutionContext,
  ) => Promise<PlatformStatusResult>;
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
        if (res.pending) {
          // Accepted but still processing — the runner persists the handle and
          // confirms on a later tick (no blocking poll inside this tick).
          return {
            outcome: 'processing',
            detail: res.detail,
            providerHandle: res.providerHandle,
          };
        }
        return {
          outcome: 'completed',
          detail: res.detail,
          evidenceUrl: res.evidenceUrl,
          platformPostId: res.platformPostId,
        };
      } catch (err) {
        return {
          outcome: 'failed',
          detail: err instanceof Error ? err.message : 'platform call failed',
        };
      }
    },
    async checkStatus(
      handle: string,
      ctx: ExecutionContext,
    ): Promise<ExecutionResult> {
      const client = clients.get(ctx.platform);
      if (!client?.checkStatus) {
        return {
          outcome: 'failed',
          detail: `no ${strategy} status check for ${ctx.platform}`,
        };
      }
      try {
        const res = await client.checkStatus(handle, ctx);
        if (!res.done) {
          return { outcome: 'processing', providerHandle: handle };
        }
        return {
          outcome: 'completed',
          detail: res.detail,
          evidenceUrl: res.evidenceUrl,
          platformPostId: res.platformPostId,
        };
      } catch (err) {
        return {
          outcome: 'failed',
          detail: err instanceof Error ? err.message : 'status check failed',
        };
      }
    },
  };
}
