// Health-score data providers (docs §11.3). A per-platform provider fetches an
// account's latest metrics; the health service computes + stores the score.
// Providers are registered at bootstrap. Until a real one is registered for a
// platform, no score is computed (we never fabricate analytics). This is the
// framework — concrete TikTok/Instagram providers (real API) are the wiring
// point, same pattern as the execution PlatformClients.

import type { HealthInputs } from './health';

export type HealthStatsRequest = {
  managedAccountId: string;
  platform: string;
};

export type PlatformStatsProvider = {
  readonly platform: string;
  /** Latest metrics for the account, or null if no data yet (unconnected). */
  getStats: (req: HealthStatsRequest) => Promise<HealthInputs | null>;
};

const PROVIDERS = new Map<string, PlatformStatsProvider>();

export function registerStatsProvider(provider: PlatformStatsProvider): void {
  PROVIDERS.set(provider.platform, provider);
}

export function unregisterStatsProvider(platform: string): void {
  PROVIDERS.delete(platform);
}

export function getStatsProvider(platform: string): PlatformStatsProvider | null {
  return PROVIDERS.get(platform) ?? null;
}
