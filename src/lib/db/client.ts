import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzlePg<typeof schema>>;

export function isNeonUrl(url: string): boolean {
  return /neon\.tech|neon\.build/i.test(url);
}

/**
 * Neon URLs use the Neon serverless driver (WebSockets, works on Vercel);
 * any other PostgreSQL URL (e.g. local development) uses node-postgres.
 * Both expose the same Drizzle query API including transactions.
 */
export function createDb(url = process.env.DATABASE_URL): Db {
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and configure your Neon connection string.");
  }
  if (isNeonUrl(url)) {
    if (typeof WebSocket !== "undefined") neonConfig.webSocketConstructor = WebSocket;
    const pool = new NeonPool({ connectionString: url });
    return drizzleNeon({ client: pool, schema }) as unknown as Db;
  }
  const pool = new pg.Pool({ connectionString: url, max: 5 });
  return drizzlePg({ client: pool, schema });
}
