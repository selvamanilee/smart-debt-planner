import "dotenv/config";
import { createDb } from "../src/lib/db/client";
import { seedInitialData } from "../src/lib/db/seed";

async function main() {
  const db = createDb();
  const seeded = await seedInitialData(db);
  console.log(seeded ? "[seed] Initial financial data inserted." : "[seed] Data already present — nothing to do.");
  await (db.$client as { end?: () => Promise<void> }).end?.();
}

main().catch((err) => {
  console.error("[seed] Failed:", err);
  process.exit(1);
});
