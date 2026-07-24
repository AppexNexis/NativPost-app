import { describe, expect, it } from 'vitest';

import {
  MAX_ACCOUNTS_PER_ORDER,
  parseHandles,
  parseOrderRequest,
} from './order-request';

const valid = {
  authorized: true,
  brandProfileId: 'brand-1',
  country: 'US',
  platform: 'tiktok',
  niche: '  Home wellness  ',
  handlePreferences: [' @a ', '', '@b', 42],
  quantity: 3,
};

describe('parseOrderRequest', () => {
  it('accepts a valid request and normalizes fields', () => {
    const res = parseOrderRequest(valid);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.niche).toBe('Home wellness'); // trimmed
      expect(res.value.handlePreferences).toEqual(['@a', '@b']); // trimmed, non-string dropped
      expect(res.value.quantity).toBe(3);
    }
  });

  it('requires authorization', () => {
    const res = parseOrderRequest({ ...valid, authorized: false });
    expect(res).toMatchObject({ ok: false });
    expect(res.ok === false && res.error).toMatch(/Authorization/);
  });

  it('rejects a non-object body', () => {
    expect(parseOrderRequest(null).ok).toBe(false);
    expect(parseOrderRequest('nope').ok).toBe(false);
  });

  it('requires brand, country, and platform', () => {
    expect(parseOrderRequest({ ...valid, brandProfileId: '' }).ok).toBe(false);
    expect(parseOrderRequest({ ...valid, country: undefined }).ok).toBe(false);
    expect(parseOrderRequest({ ...valid, platform: 123 }).ok).toBe(false);
  });

  it('rejects unsupported country or platform', () => {
    expect(parseOrderRequest({ ...valid, country: 'ZZ' }).ok).toBe(false);
    expect(parseOrderRequest({ ...valid, platform: 'myspace' }).ok).toBe(false);
  });

  it('defaults quantity to 1 and enforces the range', () => {
    const def = parseOrderRequest({ ...valid, quantity: undefined });
    expect(def.ok && def.value.quantity).toBe(1);
    expect(parseOrderRequest({ ...valid, quantity: 0 }).ok).toBe(false);
    expect(parseOrderRequest({ ...valid, quantity: -2 }).ok).toBe(false);
    expect(parseOrderRequest({ ...valid, quantity: 2.5 }).ok).toBe(false);
    expect(parseOrderRequest({ ...valid, quantity: 'five' }).ok).toBe(false);
    expect(
      parseOrderRequest({ ...valid, quantity: MAX_ACCOUNTS_PER_ORDER + 1 }).ok,
    ).toBe(false);
  });

  it('treats a blank niche as null', () => {
    const res = parseOrderRequest({ ...valid, niche: '   ' });
    expect(res.ok && res.value.niche).toBeNull();
  });
});

describe('parseHandles', () => {
  it('returns [] for non-arrays', () => {
    expect(parseHandles(undefined)).toEqual([]);
    expect(parseHandles('a,b')).toEqual([]);
  });

  it('trims, drops empties/non-strings, and caps the count', () => {
    const many = Array.from({ length: 20 }, (_, i) => `@h${i}`);
    expect(parseHandles(many).length).toBe(10);
    expect(parseHandles([' @x ', 1, null, ''])).toEqual(['@x']);
  });
});
