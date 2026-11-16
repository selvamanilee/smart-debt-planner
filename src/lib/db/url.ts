/** Database URL discovery — no dependencies, safe to import from the auth proxy. */

/** Env names set by Neon / Vercel Postgres integrations, in order of preference. */
const URL_ENV_NAMES = ["DATABASE_URL", "POSTGRES_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_PRISMA_URL", "NEON_DATABASE_URL"] as const;

const clean = (v: string | undefined) => v?.trim().replace(/^["']|["']$/g, "").trim() || undefined;
const isPgUrl = (v: string | undefined) => Boolean(v && /^postgres(ql)?:\/\//i.test(v));

/** Names of environment variables that look database-related (names only, never values). */
export function databaseEnvNames(): string[] {
  return Object.keys(process.env)
    .filter((k) => /DATABASE|POSTGRES|NEON|PG/i.test(k))
    .sort();
}

/**
 * Find the connection string. Checks the standard names first, then any variable whose
 * name ends in DATABASE_URL / POSTGRES_URL (integrations may add a prefix such as
 * STORAGE_DATABASE_URL), then any variable holding a postgres:// URL.
 */
export function resolveDatabaseUrl(): { url: string | undefined; source: string | null } {
  for (const name of URL_ENV_NAMES) {
    const v = clean(process.env[name]);
    if (isPgUrl(v)) return { url: v, source: name };
  }
  const names = Object.keys(process.env).sort();
  const suffixed = names.filter((k) => /(DATABASE_URL|POSTGRES_URL)$/i.test(k) && !/UNPOOLED|NON_POOLING/i.test(k));
  const fallbacks = [...suffixed, ...names.filter((k) => /(DATABASE_URL_UNPOOLED|POSTGRES_URL_NON_POOLING)$/i.test(k)), ...names];
  for (const name of fallbacks) {
    const v = clean(process.env[name]);
    if (isPgUrl(v)) return { url: v, source: name };
  }
  return { url: undefined, source: null };
}

