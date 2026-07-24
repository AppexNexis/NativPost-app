// Account diagnostics runner (docs §11). Gathers the DB/vault facts + runs the
// live platform probe, then composes them via the pure `buildChecks`. Powers the
// Ops diagnostics page. Read-only; safe to run on demand.

import { and, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  managedAccountSchema,
  msiCredentialSchema,
  msiJobSchema,
} from '@/models/Schema';

import { revealAccountCredentials } from './credentials-service';
import {
  buildChecks,
  type DiagnosticCheck,
  type DiagnosticFacts,
  overallStatus,
} from './diagnostics';
import type { PlatformDiagnosis } from './execution';
import {
  AdapterNotConfiguredError,
  getExecutionAdapter,
  resolveStrategy,
} from './execution';
import { ensureExecutionAdaptersRegistered } from './worker-service';

export type DiagnosticReport = {
  platform: string;
  strategy: string;
  overall: ReturnType<typeof overallStatus>;
  checks: DiagnosticCheck[];
  generatedAt: string;
};

export async function runAccountDiagnostics(
  accountId: string,
): Promise<DiagnosticReport | null> {
  const [account] = await db
    .select({
      id: managedAccountSchema.id,
      platform: managedAccountSchema.platform,
      country: managedAccountSchema.country,
      executionStrategy: managedAccountSchema.executionStrategy,
    })
    .from(managedAccountSchema)
    .where(eq(managedAccountSchema.id, accountId))
    .limit(1);
  if (!account) {
    return null;
  }

  const strategy = resolveStrategy({
    executionStrategy: account.executionStrategy,
    platform: account.platform,
  });

  const [credential] = await db
    .select({ id: msiCredentialSchema.id })
    .from(msiCredentialSchema)
    .where(eq(msiCredentialSchema.managedAccountId, accountId))
    .limit(1);
  const hasCredentials = Boolean(credential);

  // Token expiry — read from the vault blob (all client cred shapes store it).
  let tokenExpiresAt: number | undefined;
  if (hasCredentials) {
    try {
      const raw = await revealAccountCredentials(accountId);
      if (raw) {
        const blob = JSON.parse(raw) as { expiresAt?: number };
        if (typeof blob.expiresAt === 'number') {
          tokenExpiresAt = blob.expiresAt;
        }
      }
    } catch {
      // Vault unavailable / blob unreadable — leave expiry unknown.
    }
  }

  // Last publish result.
  const [lastJob] = await db
    .select({
      state: msiJobSchema.state,
      startedAt: msiJobSchema.startedAt,
      completedAt: msiJobSchema.completedAt,
      failureReason: msiJobSchema.failureReason,
    })
    .from(msiJobSchema)
    .where(
      and(
        eq(msiJobSchema.managedAccountId, accountId),
        eq(msiJobSchema.jobType, 'publish_post'),
        inArray(msiJobSchema.state, ['completed', 'failed']),
      ),
    )
    .orderBy(desc(msiJobSchema.updatedAt))
    .limit(1);

  const lastPublish: DiagnosticFacts['lastPublish'] = lastJob
    ? {
        state: lastJob.state === 'failed' ? 'failed' : 'completed',
        latencyMs:
          lastJob.startedAt && lastJob.completedAt
            ? lastJob.completedAt.getTime() - lastJob.startedAt.getTime()
            : null,
        failureReason: lastJob.failureReason ?? null,
      }
    : null;

  // Live probe — best-effort; a probe failure must not fail the report.
  let diagnosis: PlatformDiagnosis | null = null;
  if (hasCredentials) {
    try {
      ensureExecutionAdaptersRegistered();
      const adapter = getExecutionAdapter(strategy);
      if (adapter.diagnose) {
        diagnosis = await adapter.diagnose({
          managedAccountId: accountId,
          platform: account.platform,
          country: account.country,
          strategy,
        });
      }
    } catch (err) {
      if (!(err instanceof AdapterNotConfiguredError)) {
        diagnosis = {
          reachable: false,
          tokenValid: false,
          detail: err instanceof Error ? err.message : 'probe failed',
        };
      }
    }
  }

  const facts: DiagnosticFacts = {
    platform: account.platform,
    strategy,
    hasCredentials,
    tokenExpiresAt,
    now: Date.now(),
    lastPublish,
    diagnosis,
  };
  const checks = buildChecks(facts);

  return {
    platform: account.platform,
    strategy,
    overall: overallStatus(checks),
    checks,
    generatedAt: new Date().toISOString(),
  };
}
