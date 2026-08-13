/**
 * Polar SDK client.
 *
 * Built lazily and cached, mirroring how the MSI billing code holds its Stripe
 * client: nothing here loads the SDK (or reads credentials) unless a Polar call
 * is actually made, so a Stripe-only deployment never pays for it and pure-logic
 * unit tests never touch the network.
 *
 * The `Polar` type is imported type-only so the import is erased at compile
 * time — the runtime import is the dynamic one inside getPolarClient().
 */

import type { Polar } from '@polar-sh/sdk';

export type PolarServer = 'sandbox' | 'production';

/**
 * Which Polar instance to talk to.
 *
 * Sandbox and production are fully separate instances with separate tokens,
 * customers and products — a production token is rejected by the sandbox API
 * and vice versa. POLAR_SERVER wins when set; otherwise it follows
 * BILLING_PLAN_ENV, which is the same dev/prod switch that already selects
 * which plan ids in src/lib/plans.ts are live.
 */
export function getPolarServer(
  server: string | undefined = process.env.POLAR_SERVER,
  planEnv: string | undefined = process.env.BILLING_PLAN_ENV,
): PolarServer {
  if (server === 'production' || server === 'sandbox') {
    return server;
  }
  return planEnv === 'prod' ? 'production' : 'sandbox';
}

/** True when Polar has enough configuration to make an authenticated call. */
export function isPolarConfigured(
  token: string | undefined = process.env.POLAR_ACCESS_TOKEN,
): boolean {
  return !!token && token.trim().length > 0;
}

let client: Polar | null = null;
let clientToken: string | null = null;

/**
 * The shared Polar client. Throws when POLAR_ACCESS_TOKEN is missing — callers
 * that must degrade gracefully should gate on isPolarConfigured() first rather
 * than catching. The cache is keyed on the token so a changed env var in a
 * long-lived dev process doesn't serve a stale client.
 */
export async function getPolarClient(): Promise<Polar> {
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error(
      'POLAR_ACCESS_TOKEN is not set — cannot call Polar. Create an '
      + 'Organization Access Token at polar.sh → Settings → Developers '
      + '(or sandbox.polar.sh for the sandbox).',
    );
  }
  if (client && clientToken === accessToken) {
    return client;
  }
  const { Polar: PolarCtor } = await import('@polar-sh/sdk');
  client = new PolarCtor({ accessToken, server: getPolarServer() });
  clientToken = accessToken;
  return client;
}

/** Drops the cached client. Test seam — not used in application code. */
export function resetPolarClient(): void {
  client = null;
  clientToken = null;
}
