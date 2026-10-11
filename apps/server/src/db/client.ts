import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { SERVER_ROOT } from "../config";
import * as schema from "./schema";

/** The Drizzle database type every module uses. Works for both node-postgres and PGlite. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Db;
  driver: "pg" | "pglite";
  migrate(): Promise<void>;
  close(): Promise<void>;
}

export const MIGRATIONS_FOLDER = resolve(SERVER_ROOT, "drizzle");

/**
 * postgres:// or postgresql:// -> node-postgres pool.
 * pglite://<dir> -> PGlite on disk (relative paths resolve from apps/server).
 * memory:// -> in-memory PGlite.
 */
export async function createDb(url: string): Promise<DbHandle> {
  if (/^postgres(ql)?:\/\//.test(url)) {
    const pool = new pg.Pool({ connectionString: url, max: 10 });
    const db = drizzlePg(pool, { schema });
    return {
      db: db as unknown as Db,
      driver: "pg",
      migrate: () => migratePg(db, { migrationsFolder: MIGRATIONS_FOLDER }),
      close: () => pool.end(),
    };
  }
  let client: PGlite;
  if (url === "memory://" || url === "pglite://memory") {
    client = new PGlite();
  } else if (url.startsWith("pglite://")) {
    const dir = resolve(SERVER_ROOT, url.slice("pglite://".length));
    mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
  } else {
    throw new Error(`Unsupported DATABASE_URL: ${url}`);
  }
  await client.waitReady;
  const db = drizzlePglite(client, { schema });
  return {
    db: db as unknown as Db,
    driver: "pglite",
    migrate: () => migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    close: () => client.close(),
  };
}

/** Drops every table, type, and the migration journal. Run migrate() afterwards. */
export async function wipeDb(db: Db): Promise<void> {
  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
}
