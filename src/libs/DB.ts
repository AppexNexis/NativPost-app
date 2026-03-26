// src/libs/db.ts
//
// Re-exports the db instance from DB.ts with the correct Drizzle type
// so that .returning(), .onConflictDoUpdate(), and other PG-only methods
// are available without TypeScript errors.
//
// Why this exists:
//   DB.ts returns either a drizzle-pg instance OR a drizzle-pglite instance
//   depending on whether DATABASE_URL is set. TypeScript infers the union type,
//   which means PG-only methods like .returning() cause TS2554 errors.
//
//   Since we always have DATABASE_URL set in production (Supabase) and in dev
//   (.env.local), we can safely cast to the PG type here.

import type { drizzle } from 'drizzle-orm/node-postgres';

// Import the actual runtime instance from DB.ts
import { db as _db } from '@/libs/__DB';
import type * as schema from '@/models/Schema';

// Cast to the node-postgres drizzle type — safe because DATABASE_URL is
// always set when running against Supabase (local dev or production).
export const db = _db as ReturnType<typeof drizzle<typeof schema>>;
