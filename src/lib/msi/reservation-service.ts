// DB wiring for capacity reservations (docs §6.2). Places/consumes/releases the
// checkout soft-holds that stop two buyers overselling the same slots. Pure
// TTL logic lives in ./reservation; this just persists it.

import { and, eq, lte } from 'drizzle-orm';

import { db } from '@/lib/db';
import { msiCapacityReservationSchema } from '@/models/Schema';

import { reservationExpiry } from './reservation';

export type CreateReservationInput = {
  orgId: string;
  orderId?: string;
  country: string;
  platform: string;
  quantity: number;
  now?: Date;
};

export async function createReservation(input: CreateReservationInput) {
  const [reservation] = await db
    .insert(msiCapacityReservationSchema)
    .values({
      orgId: input.orgId,
      orderId: input.orderId,
      country: input.country,
      platform: input.platform,
      quantity: input.quantity,
      status: 'held',
      expiresAt: reservationExpiry(input.now ?? new Date()),
    })
    .returning();

  if (!reservation) {
    throw new Error('failed to create capacity reservation');
  }
  return reservation;
}

export async function consumeReservation(id: string): Promise<void> {
  await db
    .update(msiCapacityReservationSchema)
    .set({ status: 'consumed' })
    .where(eq(msiCapacityReservationSchema.id, id));
}

export async function releaseReservation(id: string): Promise<void> {
  await db
    .update(msiCapacityReservationSchema)
    .set({ status: 'released' })
    .where(eq(msiCapacityReservationSchema.id, id));
}

/** Expire any held reservation past its TTL (also handled by the worker tick). */
export async function expireStaleReservations(now: Date = new Date()): Promise<void> {
  await db
    .update(msiCapacityReservationSchema)
    .set({ status: 'expired' })
    .where(
      and(
        eq(msiCapacityReservationSchema.status, 'held'),
        lte(msiCapacityReservationSchema.expiresAt, now),
      ),
    );
}
