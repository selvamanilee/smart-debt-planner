import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { ensureSchema, getDb } from "@/lib/db";
import { databaseEnvNames, resolveDatabaseUrl } from "@/lib/db/client";
import { migrationsFolder } from "@/lib/db/migrate";

export const dynamic = "force-dynamic";

/**
 * Deployment diagnostics. Reports which configuration is present (never the values)
 * and whether the database is reachable and migrated. Contains no financial data.
 */
export async function GET() {
  const { url, source } = resolveDatabaseUrl();
  const config = {
    databaseUrl: source ?? "missing",
    databaseHost: url ? safeHost(url) : null,
    authSecret: (process.env.AUTH_SECRET?.trim().length ?? 0) >= 16 ? "set" : "missing (derived from database URL)",
    setupCode: process.env.SETUP_CODE?.trim() ? "set" : "not set (optional)",
    aiGateway: process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN ? "configured" : "not configured (optional)",
    migrationsBundled: Boolean(migrationsFolder()),
    nodeVersion: process.version,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    deployedCommit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    deploymentUrl: process.env.VERCEL_URL ?? null,
    projectProductionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? null,
    /** Count of non-system environment variables the deployment received (names/values not shown). */
    customEnvVarCount: Object.keys(process.env).filter((k) => !/^(VERCEL|NEXT_|NODE_|AWS_|LAMBDA_|_|PATH|PWD|HOME|LANG|TZ|SHLVL|HOSTNAME|LD_|NX_|TURBO|CI$|NOW_)/.test(k)).length,
    databaseEnvVarNames: databaseEnvNames(),
  };
  if (!url) return NextResponse.json({ ok: false, error: "No database URL found. Add DATABASE_URL (Neon connection string) in Vercel → Settings → Environment Variables for the Production environment, then Redeploy. databaseEnvVarNames lists the database-related variables this deployment can see.", config }, { status: 503 });
  try {
    await ensureSchema();
    const res = await getDb().execute(sql`select count(*)::int as users from users`);
    const rows = (Array.isArray(res) ? res : (res as unknown as { rows: { users: number }[] }).rows) as { users: number }[];
    return NextResponse.json({ ok: true, database: "connected", schema: "ready", accountCreated: (rows[0]?.users ?? 0) > 0, config });
  } catch (err) {
    return NextResponse.json({ ok: false, database: "error", error: err instanceof Error ? err.message.slice(0, 300) : "Unknown error", config }, { status: 503 });
  }
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return "unparseable URL";
  }
}
