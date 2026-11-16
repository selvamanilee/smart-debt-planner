import "server-only";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "./client";
import { runMigrations } from "./migrate";

const globalForDb = globalThis as unknown as { __db?: Db; __schemaReady?: Promise<void> };

/** Lazily created singleton so builds without DATABASE_URL don't fail at import time. */
export function getDb(): Db {
  if (!globalForDb.__db) globalForDb.__db = createDb();
  return globalForDb.__db;
}

/**
 * Make sure the tables exist. Migrations normally run during the Vercel build, but if
 * the database URL was only available at runtime (or migrations were skipped) this
 * applies them on first use. Runs at most once per server instance.
 */
export function ensureSchema(): Promise<void> {
  if (!globalForDb.__schemaReady) {
    globalForDb.__schemaReady = (async () => {
      const db = getDb();
      const res = await db.execute(sql`select to_regclass('public.user_settings') as t`);
      const rows = (Array.isArray(res) ? res : (res as unknown as { rows: { t: string | null }[] }).rows) as { t: string | null }[];
      if (!rows[0]?.t) {
        console.log("[db] tables missing — applying migrations");
        await runMigrations(db);
      }
    })().catch((err) => {
      globalForDb.__schemaReady = undefined;
      throw err;
    });
  }
  return globalForDb.__schemaReady;
}

export * as schema from "./schema";
