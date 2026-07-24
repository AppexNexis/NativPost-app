// Health-score refresh job (docs §11.3). Walks live/active managed accounts,
// asks each platform's registered stats provider for its latest metrics, and
// persists the composite score. If no provider is registered for a platform
// (or it has no data yet), the account is skipped — no score is fabricated.

import { eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { managedAccountSchema } from '@/models/Schema';

import { computeHealthScore } from './health';
import { getStatsProvider } from './health-providers';

type HealthAccount = { id: string; platform: string };

/**
 * Refresh one account's health score. Returns the new score, or null when no
 * provider is registered / the provider has no data yet.
 */
export async function computeAndStoreHealth(
  account: HealthAccount,
): Promise<number | null> {
  const provider = getStatsProvider(account.platform);
  if (!provider) {
    return null;
  }

  const stats = await provider.getStats({
    managedAccountId: account.id,
    platform: account.platform,
  });
  if (!stats) {
    return null;
  }

  const { overall } = computeHealthScore(stats);
  await db
    .update(managedAccountSchema)
    .set({ healthScore: overall })
    .where(eq(managedAccountSchema.id, account.id));

  return overall;
}

/** Refresh every live/active account. Returns how many scores were updated. */
export async function runHealthTick(): Promise<{
  scanned: number;
  updated: number;
}> {
  const accounts = await db
    .select({
      id: managedAccountSchema.id,
      platform: managedAccountSchema.platform,
    })
    .from(managedAccountSchema)
    .where(inArray(managedAccountSchema.lifecycleState, ['live', 'active']));

  let updated = 0;
  for (const account of accounts) {
    const score = await computeAndStoreHealth(account);
    if (score !== null) {
      updated += 1;
    }
  }

  return { scanned: accounts.length, updated };
}
