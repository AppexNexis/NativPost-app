// Cross-org MSI operations aggregation (docs §8, §11). PURE helpers — the admin
// server page fetches rows and calls these, so the rollup logic stays unit
// tested. No `db`/`Env`.

import type { AccountState } from './lifecycle';
import { ACCOUNT_STATES } from './lifecycle';

export type PipelineCounts = Record<AccountState, number>;

/** Tally lifecycle states into a full count map (0 for missing states). */
export function summarizePipeline(states: string[]): PipelineCounts {
  const counts = Object.fromEntries(
    ACCOUNT_STATES.map(s => [s, 0]),
  ) as PipelineCounts;
  for (const s of states) {
    if (s in counts) {
      counts[s as AccountState] += 1;
    }
  }
  return counts;
}

export type CountrySummary = {
  country: string;
  accounts: number;
  operators: number;
  devices: number;
  operatorCapacity: number;
  deviceCapacity: number;
};

/** Roll account/operator/device rows up per country, busiest first. */
export function rollupCountries(
  accounts: { country: string }[],
  operators: { country: string; capacity: number }[],
  devices: { country: string; capacity: number }[],
): CountrySummary[] {
  const byCountry = new Map<string, CountrySummary>();
  const ensure = (c: string): CountrySummary => {
    let row = byCountry.get(c);
    if (!row) {
      row = {
        country: c,
        accounts: 0,
        operators: 0,
        devices: 0,
        operatorCapacity: 0,
        deviceCapacity: 0,
      };
      byCountry.set(c, row);
    }
    return row;
  };

  for (const a of accounts) {
    ensure(a.country).accounts += 1;
  }
  for (const o of operators) {
    const row = ensure(o.country);
    row.operators += 1;
    row.operatorCapacity += o.capacity;
  }
  for (const d of devices) {
    const row = ensure(d.country);
    row.devices += 1;
    row.deviceCapacity += d.capacity;
  }

  return [...byCountry.values()].sort((a, b) => b.accounts - a.accounts);
}
