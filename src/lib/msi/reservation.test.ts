import { describe, expect, it } from 'vitest';

import {
  countHeldSlots,
  isReservationExpired,
  isReservationHeld,
  RESERVATION_TTL_MS,
  reservationExpiry,
  type ReservationLike,
} from './reservation';

const now = new Date('2026-07-23T12:00:00Z');
const future = new Date(now.getTime() + 60_000);
const past = new Date(now.getTime() - 60_000);

describe('capacity reservations', () => {
  it('computes a TTL expiry from the given time', () => {
    expect(reservationExpiry(now).getTime()).toBe(now.getTime() + RESERVATION_TTL_MS);
  });

  it('treats a held, unexpired reservation as held (not expired)', () => {
    const r = { status: 'held', expiresAt: future };
    expect(isReservationHeld(r, now)).toBe(true);
    expect(isReservationExpired(r, now)).toBe(false);
  });

  it('treats a held, past-TTL reservation as expired (not held)', () => {
    const r = { status: 'held', expiresAt: past };
    expect(isReservationHeld(r, now)).toBe(false);
    expect(isReservationExpired(r, now)).toBe(true);
  });

  it('ignores consumed/released reservations', () => {
    expect(isReservationHeld({ status: 'consumed', expiresAt: future }, now)).toBe(false);
    expect(isReservationExpired({ status: 'released', expiresAt: past }, now)).toBe(false);
  });

  it('sums only held slots for the matching country + platform', () => {
    const reservations: ReservationLike[] = [
      { status: 'held', expiresAt: future, quantity: 3, country: 'US', platform: 'tiktok' },
      { status: 'held', expiresAt: future, quantity: 2, country: 'US', platform: 'tiktok' },
      { status: 'held', expiresAt: past, quantity: 5, country: 'US', platform: 'tiktok' }, // expired
      { status: 'consumed', expiresAt: future, quantity: 4, country: 'US', platform: 'tiktok' }, // not held
      { status: 'held', expiresAt: future, quantity: 9, country: 'UK', platform: 'tiktok' }, // wrong country
      { status: 'held', expiresAt: future, quantity: 8, country: 'US', platform: 'instagram' }, // wrong platform
    ];
    expect(countHeldSlots(reservations, 'US', 'tiktok', now)).toBe(5);
  });
});
