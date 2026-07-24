// Capacity reservation soft-holds (docs §6.2). A checkout places a short-lived
// hold so two buyers can't oversell the same country+platform slots. Pure
// helpers over the msi_capacity_reservation rows; the worker (./worker) expires
// stale holds.

/** How long a checkout hold survives before it must be renewed or released. */
export const RESERVATION_TTL_MS = 30 * 60 * 1000; // 30 minutes

export type ReservationLike = {
  status: string; // held | consumed | released | expired
  expiresAt: Date;
  quantity: number;
  country: string;
  platform: string;
};

export function reservationExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + RESERVATION_TTL_MS);
}

export function isReservationHeld(
  r: Pick<ReservationLike, 'status' | 'expiresAt'>,
  now: Date = new Date(),
): boolean {
  return r.status === 'held' && r.expiresAt.getTime() > now.getTime();
}

/** A hold that is still `held` but past its TTL — the worker should expire it. */
export function isReservationExpired(
  r: Pick<ReservationLike, 'status' | 'expiresAt'>,
  now: Date = new Date(),
): boolean {
  return r.status === 'held' && r.expiresAt.getTime() <= now.getTime();
}

/** Total slots currently held for a country+platform (feeds reservedSlots). */
export function countHeldSlots(
  reservations: ReservationLike[],
  country: string,
  platform: string,
  now: Date = new Date(),
): number {
  return reservations
    .filter(
      r =>
        r.country === country &&
        r.platform === platform &&
        isReservationHeld(r, now),
    )
    .reduce((sum, r) => sum + r.quantity, 0);
}
