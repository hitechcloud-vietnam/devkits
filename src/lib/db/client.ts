// Postgres access. Production: Neon over HTTP (DATABASE_URL). Development and tests:
// PGlite (Postgres compiled to WASM) in .data/pglite or in memory. Same SQL on both.
import { MIGRATIONS } from "./schema.ts";

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

async function migrate(db: Db): Promise<void> {
  await db.query(`create table if not exists schema_migrations (id integer primary key, name text not null, applied_at timestamptz not null default now())`);
  const done = new Set((await db.query<{ id: number }>("select id from schema_migrations")).map((r) => Number(r.id)));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    // Each statement separately: the Neon HTTP driver runs one statement per call.
    for (const statement of m.sql.split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean)) {
      await db.query(statement);
    }
    await db.query("insert into schema_migrations (id, name) values ($1, $2)", [m.id, m.name]);
  }
}

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
    return { query: async (text, params = []) => (await sql.query(text, params)) as never };
  }
  if (process.env.VERCEL) {
    throw new Error("DATABASE_URL is not set. Add a Postgres database (for example Neon) to the Vercel project.");
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.DEVKITS_PGLITE_DIR ?? ".data/pglite";
  const pg = new PGlite(dir === "memory" ? undefined : dir);
  return { query: async (text, params = []) => (await pg.query(text, params)).rows as never };
}

const globalForDb = globalThis as unknown as { __devkitsDb?: Promise<Db> };

/** Connected, migrated database (one per process). */
export function getDb(): Promise<Db> {
  globalForDb.__devkitsDb ??= connect().then(async (db) => {
    await migrate(db);
    return db;
  });
  globalForDb.__devkitsDb.catch(() => {
    globalForDb.__devkitsDb = undefined;
  });
  return globalForDb.__devkitsDb;
}

/** Test helper: a fresh in-memory database. */
export async function createMemoryDb(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite();
  const db: Db = { query: async (text, params = []) => (await pg.query(text, params)).rows as never };
  await migrate(db);
  return db;
}
