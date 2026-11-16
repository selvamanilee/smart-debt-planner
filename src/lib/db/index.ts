import "server-only";
import { createDb, type Db } from "./client";

const globalForDb = globalThis as unknown as { __db?: Db };

/** Lazily created singleton so builds without DATABASE_URL don't fail at import time. */
export function getDb(): Db {
  if (!globalForDb.__db) globalForDb.__db = createDb();
  return globalForDb.__db;
}

export * as schema from "./schema";
