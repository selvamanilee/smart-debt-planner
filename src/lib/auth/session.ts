import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "sdp_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set (min 16 chars) in production.");
    return new TextEncoder().encode("dev-only-insecure-secret-change-me");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(userId: number, username: string): Promise<string> {
  return new SignJWT({ sub: String(userId), name: username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string | undefined): Promise<{ userId: number; username: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return { userId: Number(payload.sub), username: String(payload.name ?? "") };
  } catch {
    return null;
  }
}
