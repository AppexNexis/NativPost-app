// Pure validation for POST /api/msi/orders (the configure flow). Extracted from
// the route so every branch is unit-tested and the route stays thin. No db/Env.

import { isSupportedCountry, isSupportedPlatform } from './catalog';

export const MAX_ACCOUNTS_PER_ORDER = 100;
export const MAX_HANDLE_PREFERENCES = 10;

export type ParsedOrderRequest = {
  brandProfileId: string;
  country: string;
  platform: string;
  niche: string | null;
  handlePreferences: string[];
  quantity: number;
};

export type OrderParseResult =
  | { ok: true; value: ParsedOrderRequest }
  | { ok: false; error: string };

/** Normalize handle preferences: strings only, trimmed, non-empty, capped. */
export function parseHandles(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((h): h is string => typeof h === 'string')
    .map(h => h.trim())
    .filter(Boolean)
    .slice(0, MAX_HANDLE_PREFERENCES);
}

export function parseOrderRequest(input: unknown): OrderParseResult {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Invalid request body' };
  }
  const b = input as Record<string, unknown>;

  if (!b.authorized) {
    return {
      ok: false,
      error: 'Authorization is required to configure managed accounts',
    };
  }

  const { brandProfileId, country, platform } = b;
  if (
    typeof brandProfileId !== 'string'
    || !brandProfileId
    || typeof country !== 'string'
    || !country
    || typeof platform !== 'string'
    || !platform
  ) {
    return { ok: false, error: 'brand, country, and platform are required' };
  }

  if (!isSupportedCountry(country) || !isSupportedPlatform(platform)) {
    return { ok: false, error: 'Unsupported country or platform' };
  }

  const quantity = Number(b.quantity ?? 1);
  if (
    !Number.isInteger(quantity)
    || quantity < 1
    || quantity > MAX_ACCOUNTS_PER_ORDER
  ) {
    return {
      ok: false,
      error: `quantity must be an integer between 1 and ${MAX_ACCOUNTS_PER_ORDER}`,
    };
  }

  const niche
    = typeof b.niche === 'string' && b.niche.trim() ? b.niche.trim() : null;

  return {
    ok: true,
    value: {
      brandProfileId,
      country,
      platform,
      niche,
      handlePreferences: parseHandles(b.handlePreferences),
      quantity,
    },
  };
}
