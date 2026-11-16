import "dotenv/config";
import path from "node:path";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { migrate as migrateNeon } from "drizzle-orm/neon-serverless/migrator";
import { createDb, isNeonUrl } from "../src/lib/db/client";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("[migrate] DATABASE_URL not set — skipping migrations.");
    return;
  }
  const db = createDb(url);
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  if (isNeonUrl(url)) await migrateNeon(db as never, { migrationsFolder });
  else await migratePg(db, { migrationsFolder });
  console.log("[migrate] Database is up to date.");
  await (db.$client as { end?: () => Promise<void> }).end?.();
}

main().catch((err) => {
  console.error("[migrate] Failed:", err);
  process.exit(1);
});
