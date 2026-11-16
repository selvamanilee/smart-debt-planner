import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "sdp_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

let cached: { source: string; key: Uint8Array } | null = null;

/**
 * Signing key for session cookies. Uses AUTH_SECRET when set; otherwise derives a key
 * from the database URL (which is itself secret) so a missing variable never takes the
 * whole site down. Setting AUTH_SECRET is still recommended.
 */
async function secretKey(): Promise<Uint8Array> {
  const explicit = process.env.AUTH_SECRET?.trim();
  const source =
    explicit && explicit.length >= 16
      ? `auth:${explicit}`
      : `db:${process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.DATABASE_URL_UNPOOLED ?? "dev-only-insecure-secret"}`;
  if (cached?.source === source) return cached.key;
  let key: Uint8Array;
  if (source.startsWith("auth:")) {
    key = new TextEncoder().encode(explicit);
  } else {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`smart-debt-planner-session|${source}`));
    key = new Uint8Array(digest);
  }
  cached = { source, key };
  return key;
}

export async function createSessionToken(userId: number, username: string): Promise<string> {
  return new SignJWT({ sub: String(userId), name: username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(await secretKey());
}

export async function verifySessionToken(token: string | undefined): Promise<{ userId: number; username: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await secretKey(), { algorithms: ["HS256"] });
    return { userId: Number(payload.sub), username: String(payload.name ?? "") };
  } catch {
    return null;
  }
}
