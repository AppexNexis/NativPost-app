// Managed Advertising add-on (docs §19). Pure — no db/Env. Percent-of-spend
// billing math + validation. The ad spend is paid by the customer to the ad
// platform directly; we bill a one-time setup fee + a management fee that is a
// percentage of the spend we record.

export const AD_SETUP_FEE_CENTS = 4900; // $49 one-time per campaign
export const AD_MGMT_PCT_MIN = 10;
export const AD_MGMT_PCT_MAX = 20;

/** A management percentage must be a whole number within the allowed range. */
export function isValidManagementPct(pct: number): boolean {
  return Number.isInteger(pct) && pct >= AD_MGMT_PCT_MIN && pct <= AD_MGMT_PCT_MAX;
}

/** Management fee (cents) for a recorded spend, rounded to the nearest cent. */
export function computeManagementFeeCents(spendCents: number, pct: number): number {
  if (spendCents <= 0 || pct <= 0) {
    return 0;
  }
  return Math.round((spendCents * pct) / 100);
}

/** Display helper: cents → "$1,234.56". */
export function formatUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
