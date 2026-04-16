/**
 * src/libs/db.ts
 *
 * Re-exports a fully-typed, awaited Drizzle instance backed by node-postgres.
 *
 * WHY THIS EXISTS:
 *   __DB.ts may return either a drizzle-pg or drizzle-pglite instance
 *   depending on whether DATABASE_URL is set. TypeScript infers a union type,
 *   which breaks PG-only methods like .returning() and .onConflictDoUpdate().
 *
 *   This file resolves the promise from __DB.ts and casts the result to the
 *   node-postgres Drizzle type — safe because DATABASE_URL is always set
 *   when running against Supabase (local dev or production).
 *
 * HOW TO USE:
 *   import { db } from '@/libs/db';
 *
 *   // In a Server Component, Route Handler, or Server Action:
 *   const rows = await (await db).select().from(myTable);
 *
 *   // OR use the helper which is cleaner:
 *   import { getDb } from '@/libs/db';
 *   const db = await getDb();
 *   const rows = await db.select().from(myTable);
 *
 * MIGRATIONS:
 *   Migrations are NO LONGER run on every request.
 *   Run them once at deploy time:
 *     npm run db:migrate
 *   See src/libs/migrate.ts for the migration script.
 */

import type { drizzle } from 'drizzle-orm/node-postgres';

import type * as schema from '@/models/Schema';

import { getDb as _getDb } from './__DB';

type PgDb = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Returns the initialized Drizzle pg instance.
 * Await this at the top of any server function that needs the DB.
 *
 * @example
 * const db = await getDb();
 * const orgs = await db.select().from(organizationSchema);
 */
export async function getDb(): Promise<PgDb> {
  const instance = await _getDb();
  return instance as PgDb;
}

/**
 * A Promise that resolves to the Drizzle pg instance.
 * Equivalent to calling getDb() — provided for backwards compatibility
 * with code that previously imported `db` from this file.
 *
 * Prefer using getDb() explicitly for clarity.
 *
 * @example
 * const dbInstance = await db;
 * const rows = await dbInstance.select().from(myTable);
 */
export const db: Promise<PgDb> = getDb();
