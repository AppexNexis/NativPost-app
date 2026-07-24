// MSI pricing (docs §8). Per-account monthly + per-post. Pure.

export const MSI_PER_ACCOUNT_USD = 80;
export const MSI_PER_POST_USD = 1.5;

export function perAccountCents(): number {
  return Math.round(MSI_PER_ACCOUNT_USD * 100);
}

export function orderMonthlyTotalCents(quantity: number): number {
  return perAccountCents() * Math.max(1, Math.floor(quantity));
}

export function orderMonthlyTotalUsd(quantity: number): number {
  return orderMonthlyTotalCents(quantity) / 100;
}
