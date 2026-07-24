// Account diagnostics (docs §11). Pure composition of the facts the service
// gathers (DB/vault) + an optional live platform probe into an ordered check
// list the Ops page renders. No db/network here — fully unit-tested.

import type { PlatformDiagnosis } from './execution-api';

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'info' | 'unknown';

export type DiagnosticCheck = {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
};

export type DiagnosticFacts = {
  platform: string;
  strategy: string;
  hasCredentials: boolean;
  /** Token expiry (epoch ms) from the vault blob, if stored. */
  tokenExpiresAt?: number;
  now: number;
  lastPublish:
    | { state: 'completed' | 'failed'; latencyMs: number | null; failureReason: string | null }
    | null;
  /** Result of the live probe, or null when the platform has no probe/strategy. */
  diagnosis: PlatformDiagnosis | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_WARN_MS = 7 * DAY_MS;

function expiryCheck(expiresAt: number | undefined, now: number): DiagnosticCheck {
  if (!expiresAt) {
    return {
      key: 'token_expiry',
      label: 'Token expiry',
      status: 'unknown',
      detail: 'No expiry stored — cannot pre-empt expiry (proactive refresh off).',
    };
  }
  const remaining = expiresAt - now;
  if (remaining <= 0) {
    return { key: 'token_expiry', label: 'Token expiry', status: 'fail', detail: 'Token has expired.' };
  }
  const days = Math.floor(remaining / DAY_MS);
  if (remaining < EXPIRY_WARN_MS) {
    return { key: 'token_expiry', label: 'Token expiry', status: 'warn', detail: `Expires in ${days} day(s) — refresh due.` };
  }
  return { key: 'token_expiry', label: 'Token expiry', status: 'ok', detail: `Valid — expires in ${days} day(s).` };
}

function lastPublishCheck(lastPublish: DiagnosticFacts['lastPublish']): DiagnosticCheck {
  if (!lastPublish) {
    return { key: 'last_publish', label: 'Last publish', status: 'info', detail: 'No publishes yet.' };
  }
  if (lastPublish.state === 'failed') {
    return {
      key: 'last_publish',
      label: 'Last publish',
      status: 'fail',
      detail: `Failed: ${lastPublish.failureReason || 'unknown reason'}`,
    };
  }
  const latency = lastPublish.latencyMs != null ? ` (${Math.round(lastPublish.latencyMs / 1000)}s)` : '';
  return { key: 'last_publish', label: 'Last publish', status: 'ok', detail: `Succeeded${latency}.` };
}

function liveChecks(facts: DiagnosticFacts): DiagnosticCheck[] {
  // Manual accounts have no automated publishing — live probe is not applicable.
  if (facts.strategy === 'manual') {
    return [
      { key: 'live_probe', label: 'Live API probe', status: 'info', detail: 'Operator-run (manual) — no API access to probe.' },
    ];
  }
  if (!facts.diagnosis) {
    return [
      {
        key: 'live_probe',
        label: 'Live API probe',
        status: 'unknown',
        detail: `No live probe wired for ${facts.platform} yet.`,
      },
    ];
  }

  const d = facts.diagnosis;
  const checks: DiagnosticCheck[] = [
    {
      key: 'api_reachable',
      label: 'API reachable',
      status: d.reachable ? 'ok' : 'fail',
      detail: d.reachable ? 'Reached the platform API.' : (d.detail || 'Could not reach the platform API.'),
    },
    {
      key: 'token_valid',
      label: 'Token valid',
      status: d.tokenValid ? 'ok' : 'fail',
      detail: d.tokenValid ? 'Access token accepted.' : (d.detail || 'Access token rejected.'),
    },
  ];
  if (d.identity) {
    checks.push({ key: 'identity', label: 'Account identity', status: 'ok', detail: d.identity });
  }
  for (const p of d.permissions ?? []) {
    checks.push({
      key: `perm_${p.name}`,
      label: `Permission: ${p.name}`,
      status: p.granted ? 'ok' : 'fail',
      detail: p.granted ? 'Granted.' : 'Missing — publishing will fail.',
    });
  }
  return checks;
}

/** Compose the ordered diagnostic check list from gathered facts (pure). */
export function buildChecks(facts: DiagnosticFacts): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];

  checks.push({
    key: 'credentials',
    label: 'Credentials captured',
    status: facts.hasCredentials ? 'ok' : 'fail',
    detail: facts.hasCredentials
      ? 'Sealed in the vault.'
      : 'None captured — capture credentials before publishing.',
  });

  checks.push({
    key: 'strategy',
    label: 'Execution strategy',
    status: facts.strategy === 'manual' ? 'info' : 'ok',
    detail: facts.strategy === 'manual'
      ? 'Operator-run (manual) — no automated API publishing.'
      : `Automated via ${facts.strategy}.`,
  });

  if (facts.hasCredentials) {
    checks.push(expiryCheck(facts.tokenExpiresAt, facts.now));
  }

  checks.push(...liveChecks(facts));
  checks.push(lastPublishCheck(facts.lastPublish));

  return checks;
}

/** Worst status across checks — drives the overall badge. */
export function overallStatus(checks: DiagnosticCheck[]): CheckStatus {
  const rank: Record<CheckStatus, number> = { fail: 4, warn: 3, unknown: 2, info: 1, ok: 0 };
  return checks.reduce<CheckStatus>(
    (worst, c) => (rank[c.status] > rank[worst] ? c.status : worst),
    'ok',
  );
}
