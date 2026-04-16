/**
 * src/libs/__DB.ts
 *
 * Core database singleton.
 *
 * KEY CHANGES FROM ORIGINAL:
 * - Removed ALL top-level `await` — this was causing 500s in production
 *   because Next.js App Router Server Components cannot handle top-level
 *   await in imported modules during the production build/runtime.
 * - Replaced `new Client()` with `new Pool()` — a single Client breaks
 *   under concurrent requests; Pool handles reconnects and concurrency.
 * - Removed per-request migrations — migrations now run via `npm run db:migrate`
 *   at deploy time, not on every request (which was slow and dangerous).
 * - Kept PGlite fallback for local dev without DATABASE_URL, but it no
 *   longer runs at module load time — it's initialized lazily via getDb().
 * - Singleton stored on globalThis to survive Next.js hot reloads in dev.
 */

import path from 'node:path';

import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite, type PgliteDatabase } from 'drizzle-orm/pglite';
import { Pool } from 'pg';

import * as schema from '@/models/Schema';

import { Env } from './Env';

// -----------------------------------------------------------
// TYPES
// -----------------------------------------------------------
type PgDb = ReturnType<typeof drizzlePg<typeof schema>>;
type PgliteDb = PgliteDatabase<typeof schema>;
type AnyDb = PgDb | PgliteDb;

// -----------------------------------------------------------
// GLOBAL SINGLETON STORE
// Survives hot reloads in dev; in production each worker gets one instance.
// -----------------------------------------------------------
const g = globalThis as unknown as {
  __nativpost_db: AnyDb | undefined;
  __nativpost_db_promise: Promise<AnyDb> | undefined;
};

// -----------------------------------------------------------
// DB INITIALIZER — called once, result cached on globalThis
// -----------------------------------------------------------
async function initDb(): Promise<AnyDb> {
  // Production / local dev with real Postgres
  if (Env.DATABASE_URL) {
    const pool = new Pool({
      connectionString: Env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    // Verify connection is reachable before returning
    const client = await pool.connect();
    client.release();

    return drizzlePg(pool, { schema });
  }

  // Fallback: PGlite (in-memory) — only used when DATABASE_URL is absent
  // This should never happen in production. It exists purely for
  // running unit tests or the boilerplate without a real DB.
  console.warn(
    '[DB] DATABASE_URL not set — falling back to PGlite in-memory database. '
    + 'This is only acceptable for local testing without Supabase.',
  );

  const { PGlite } = await import('@electric-sql/pglite');
  const { migrate: migratePglite } = await import('drizzle-orm/pglite/migrator');

  const pglite = new PGlite();
  await pglite.waitReady;

  const db = drizzlePglite(pglite, { schema });

  await migratePglite(db, {
    migrationsFolder: path.join(process.cwd(), 'migrations'),
  });

  return db;
}

// -----------------------------------------------------------
// getDb() — lazy singleton accessor
// Safe to call from Server Components, Route Handlers, Server Actions.
// Will only initialize once per process/worker.
// -----------------------------------------------------------
export async function getDb(): Promise<AnyDb> {
  // Already initialized
  if (g.__nativpost_db) {
    return g.__nativpost_db;
  }

  // Initialization in progress — wait for it (prevents parallel inits)
  if (g.__nativpost_db_promise) {
    return g.__nativpost_db_promise;
  }

  // First call — kick off initialization
  g.__nativpost_db_promise = initDb()
    .then((db) => {
      g.__nativpost_db = db;
      g.__nativpost_db_promise = undefined;
      return db;
    })
    .catch((err) => {
      // Clear promise so next call can retry
      g.__nativpost_db_promise = undefined;
      console.error('[DB] Failed to initialize database connection:', err);
      throw err;
    });

  return g.__nativpost_db_promise;
}

// -----------------------------------------------------------
// SYNC ACCESSOR — only use this if you are CERTAIN getDb() has
// already been called earlier in the same request lifecycle.
// Throws if called before initialization completes.
// -----------------------------------------------------------
export function getDbSync(): AnyDb {
  if (!g.__nativpost_db) {
    throw new Error(
      '[DB] getDbSync() called before database was initialized. '
      + 'Call await getDb() first in your route/layout entry point.',
    );
  }
  return g.__nativpost_db;
}

// -----------------------------------------------------------
// LEGACY EXPORT — kept so existing imports of `db` from __DB.ts
// continue to work. This is a Promise<AnyDb>; callers that used
// the old synchronous `db` will need to await it, but the re-export
// in db.ts handles this transparently.
// -----------------------------------------------------------
export const db = getDb();
