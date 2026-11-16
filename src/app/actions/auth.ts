"use server";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { ensureSchema, getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { clearSessionCookie, setSessionCookie } from "@/lib/auth";
import { seedInitialData } from "@/lib/db/seed";
import { audit } from "@/lib/audit";
import { type ActionState, fail, formToObject, zodErrors } from "@/lib/validation";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function hasUser(): Promise<boolean> {
  await ensureSchema();
  const [row] = await getDb().select({ c: sql<number>`count(*)::int` }).from(users);
  return (row?.c ?? 0) > 0;
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const data = formToObject(formData);
  const username = (data.username ?? "").trim().toLowerCase();
  const password = data.password ?? "";
  if (!username || !password) return fail("Enter your username and password.");

  const db = getDb();
  await ensureSchema();
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!user) return fail("Incorrect username or password.");
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return fail(`Too many attempts. Try again after ${user.lockedUntil.toLocaleTimeString("en-IN")}.`);
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLogins + 1;
    await db
      .update(users)
      .set({ failedLogins: failed >= MAX_FAILED ? 0 : failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null })
      .where(eq(users.id, user.id));
    await audit("auth", user.id, "login_failed");
    return fail("Incorrect username or password.");
  }
  await db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id));
  await setSessionCookie(user.id, user.username);
  await audit("auth", user.id, "login");
  redirect(safeNext(data.next));
}

const setupSchema = z
  .object({
    username: z.string().trim().toLowerCase().min(3, "At least 3 characters").max(64).regex(/^[a-z0-9._-]+$/, "Letters, numbers, dot, dash or underscore"),
    password: z.string().min(10, "Use at least 10 characters").max(200),
    confirm: z.string(),
    setupCode: z.string().optional(),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords do not match" });

export async function setupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (await hasUser()) return fail("The account already exists. Please sign in.");
  const parsed = setupSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fail(zodErrors(parsed.error));

  // Optional protection: when SETUP_CODE is configured, the first account requires it.
  const expected = process.env.SETUP_CODE?.trim();
  if (expected && parsed.data.setupCode?.trim() !== expected) return fail({ setupCode: "Setup code is incorrect" });

  const db = getDb();
  const [user] = await db.insert(users).values({ username: parsed.data.username, passwordHash: await hashPassword(parsed.data.password) }).returning();
  await seedInitialData(db);
  await audit("auth", user.id, "account_created");
  await setSessionCookie(user.id, user.username);
  redirect("/");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}

const changePwSchema = z
  .object({ current: z.string().min(1, "Required"), password: z.string().min(10, "Use at least 10 characters").max(200), confirm: z.string() })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords do not match" });

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { requireUser } = await import("@/lib/auth");
  const session = await requireUser();
  const parsed = changePwSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fail(zodErrors(parsed.error));
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user || !(await verifyPassword(parsed.data.current, user.passwordHash))) return fail({ current: "Current password is incorrect" });
  await db.update(users).set({ passwordHash: await hashPassword(parsed.data.password) }).where(eq(users.id, user.id));
  await audit("auth", user.id, "password_changed");
  return { ok: true, message: "Password updated." };
}
