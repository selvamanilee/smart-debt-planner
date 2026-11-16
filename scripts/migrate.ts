import "dotenv/config";
import { createDb, resolveDatabaseUrl } from "../src/lib/db/client";
import { runMigrations } from "../src/lib/db/migrate";

async function main() {
  const { url, source } = resolveDatabaseUrl();
  if (!url) {
    console.warn("[migrate] No DATABASE_URL — skipping. Tables will be created automatically on first request.");
    return;
  }
  try {
    const db = createDb(url);
    await runMigrations(db, url);
    console.log(`[migrate] Database is up to date (using ${source}).`);
    await (db.$client as { end?: () => Promise<void> }).end?.();
  } catch (err) {
    // Don't fail the deployment: the app retries migrations at runtime and shows a clear error.
    console.error("[migrate] Migration failed during build — will retry at runtime:", err);
  }
}

main();
