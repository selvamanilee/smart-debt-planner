import path from "node:path";
import fs from "node:fs";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { migrate as migrateNeon } from "drizzle-orm/neon-http/migrator";
import type { Db } from "./client";
import { isNeonUrl, resolveDatabaseUrl } from "./client";

export function migrationsFolder(): string | null {
  const candidates = [path.join(process.cwd(), "drizzle"), path.join(process.cwd(), "..", "drizzle")];
  return candidates.find((p) => fs.existsSync(path.join(p, "meta", "_journal.json"))) ?? null;
}

/** Apply pending Drizzle migrations (idempotent). */
export async function runMigrations(db: Db, url = resolveDatabaseUrl().url): Promise<void> {
  const folder = migrationsFolder();
  if (!folder) throw new Error("Migration files (drizzle/) were not found in the deployment.");
  if (url && isNeonUrl(url)) await migrateNeon(db as never, { migrationsFolder: folder });
  else await migratePg(db, { migrationsFolder: folder });
}
