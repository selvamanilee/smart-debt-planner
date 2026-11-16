import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { resolveDatabaseUrl } from "./url";

export { resolveDatabaseUrl, databaseEnvNames } from "./url";

export type Db = ReturnType<typeof drizzlePg<typeof schema>>;

export function isNeonUrl(url: string): boolean {
  return /neon\.tech|neon\.build/i.test(url);
}

/**
 * Neon URLs use Neon's HTTP driver (plain fetch — works on every Vercel runtime,
 * no WebSockets); any other PostgreSQL URL (e.g. local development) uses node-postgres.
 * The app never relies on interactive transactions, so both drivers behave the same.
 */
export function createDb(url = resolveDatabaseUrl().url): Db {
  if (!url) {
    throw new Error("DATABASE_URL is not set. Add your Neon connection string as DATABASE_URL in the Vercel project's Environment Variables, then redeploy.");
  }
  if (isNeonUrl(url)) {
    return drizzleNeon({ client: neon(url), schema }) as unknown as Db;
  }
  const pool = new pg.Pool({ connectionString: url, max: 5 });
  return drizzlePg({ client: pool, schema });
}
