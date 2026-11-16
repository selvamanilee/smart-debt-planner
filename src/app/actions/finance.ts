"use server";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import Papa from "papaparse";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getProfile } from "@/lib/data";
import {
  type ActionState,
  checkbox,
  dateSchema,
  fail,
  formToObject,
  money,
  monthKeySchema,
  optionalDay,
  optionalText,
  text,
  zodErrors,
} from "@/lib/validation";

function done(message: string, ...paths: string[]): ActionState {
  for (const p of ["/", ...paths]) revalidatePath(p);
  return { ok: true, message };
}

/* ---------------------------- Profile -------------------------------- */

const profileSchema = z.object({
  displayName: text(120).min(1, "Required"),
  monthlySalary: money,
  salaryCreditDay: optionalDay,
  currentSavings: money,
  emergencySavingsTarget: money,
});

export async function updateProfileAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = profileSchema.safeParse(formToObject(fd));
  if (!parsed.success) return fail(zodErrors(parsed.error));
  const profile = await getProfile();
  await getDb().update(s.financialProfiles).set(parsed.data).where(eq(s.financialProfiles.id, profile.id));
  await audit("profile", profile.id, "update", { before: { salary: profile.monthlySalary, savings: profile.currentSavings }, after: parsed.data });
  return done("Financial profile saved.", "/profile", "/income", "/planner");
}

/* ---------------------------- Income --------------------------------- */

const incomeSchema = z.object({
  id: z.coerce.number().int().optional(),
  name: text(120).min(1, "Required"),
  type: z.enum(["additional", "variable", "freelance", "other"]),
  amount: money,
  active: checkbox,
  notes: optionalText(500),
});

export async function saveIncomeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const raw = formToObject(fd);
  const parsed = incomeSchema.safeParse({ ...raw, id: raw.id || undefined });
  if (!parsed.success) return fail(zodErrors(parsed.error));
  const { id, ...values } = parsed.data;
  const db = getDb();
  if (id) {
    await db.update(s.incomeSources).set(values).where(eq(s.incomeSources.id, id));
    await audit("income", id, "update", values);
  } else {
    const profile = await getProfile();
    const [row] = await db.insert(s.incomeSources).values({ ...values, profileId: profile.id }).returning();
    await audit("income", row.id, "create", values);
  }
  return done("Income source saved.", "/income");
}

export async function deleteIncomeAction(id: number): Promise<ActionState> {
  await requireUser();
  await getDb().delete(s.incomeSources).where(eq(s.incomeSources.id, id));
  await audit("income", id, "delete");
  return done("Income source deleted.", "/income");
}

/* ---------------------------- Expense categories ----------------------- */

const categorySchema = z.object({
  id: z.coerce.number().int().optional(),
  name: text(80).min(1, "Required"),
  defaultBudget: money,
  isEssential: checkbox,
});

export async function saveCategoryAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const raw = formToObject(fd);
  const parsed = categorySchema.safeParse({ ...raw, id: raw.id || undefined });
  if (!parsed.success) return fail(zodErrors(parsed.error));
  const { id, ...values } = parsed.data;
  const db = getDb();
  const clash = await db.select({ id: s.expenseCategories.id }).from(s.expenseCategories).where(sql`lower(${s.expenseCategories.name}) = lower(${values.name})`);
  if (clash.some((c) => c.id !== id)) return fail({ name: "A category with this name already exists" });
  if (id) {
    await db.update(s.expenseCategories).set({ ...values, archived: false }).where(eq(s.expenseCategories.id, id));
    await audit("expense_category", id, "update", values);
  } else {
    const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${s.expenseCategories.sortOrder}), 0)::int` }).from(s.expenseCategories);
    const [row] = await db.insert(s.expenseCategories).values({ ...values, sortOrder: max + 1 }).returning();
    await audit("expense_category", row.id, "create", values);
  }
  return done("Category saved.", "/expenses");
}

/** Deletes a category with no transactions; otherwise archives it to preserve history. */
export async function deleteCategoryAction(id: number): Promise<ActionState> {
  await requireUser();
  const db = getDb();
  const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(s.expenseTransactions).where(eq(s.expenseTransactions.categoryId, id));
  if (c > 0) {
    await db.update(s.expenseCategories).set({ archived: true }).where(eq(s.expenseCategories.id, id));
    await audit("expense_category", id, "archive");
    return done("Category has recorded expenses, so it was archived instead of deleted.", "/expenses");
  }
  await db.delete(s.expenseCategories).where(eq(s.expenseCategories.id, id));
  await audit("expense_category", id, "delete");
  return done("Category deleted.", "/expenses");
}

/** Save month-specific budgets for many categories at once (budget_<categoryId> fields). */
export async function saveMonthBudgetsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const raw = formToObject(fd);
  const month = monthKeySchema.safeParse(raw.month);
  if (!month.success) return fail("Invalid month.");
  const applyDefault = raw.applyAsDefault === "on";
  const db = getDb();
  const errors: Record<string, string> = {};
  const updates: { categoryId: number; amount: string }[] = [];
  for (const [k, v] of Object.entries(raw)) {
    if (!k.startsWith("budget_")) continue;
    const r = money.safeParse(v === "" ? "0" : v);
    if (!r.success) errors[k] = r.error.issues[0].message;
    else updates.push({ categoryId: Number(k.slice(7)), amount: r.data });
  }
  if (Object.keys(errors).length) return fail(errors);
  for (const u of updates) {
    if (applyDefault) {
      await db.update(s.expenseCategories).set({ defaultBudget: u.amount }).where(eq(s.expenseCategories.id, u.categoryId));
      await db.delete(s.monthlyBudgets).where(and(eq(s.monthlyBudgets.categoryId, u.categoryId), eq(s.monthlyBudgets.month, month.data)));
    } else {
      await db
        .insert(s.monthlyBudgets)
        .values({ categoryId: u.categoryId, month: month.data, amount: u.amount })
        .onConflictDoUpdate({ target: [s.monthlyBudgets.categoryId, s.monthlyBudgets.month], set: { amount: u.amount, updatedAt: new Date() } });
    }
  }
  await audit("monthly_budget", month.data, applyDefault ? "update_defaults" : "update", updates);
  return done(applyDefault ? "Default budgets updated for all months." : "Budgets saved for this month.", "/expenses", "/planner");
}

/* ---------------------------- Expense transactions --------------------- */

const expenseSchema = z.object({
  id: z.coerce.number().int().optional(),
  categoryId: z.coerce.number().int().positive("Choose a category"),
  date: dateSchema,
  amount: money.refine((v) => Number(v) > 0, "Amount must be more than 0"),
  description: optionalText(255),
  kind: z.enum(["recurring", "one_time"]),
});

export async function saveExpenseAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const raw = formToObject(fd);
  const parsed = expenseSchema.safeParse({ ...raw, id: raw.id || undefined });
  if (!parsed.success) return fail(zodErrors(parsed.error));
  const { id, ...v } = parsed.data;
  const values = { ...v, month: v.date.slice(0, 7) };
  const db = getDb();
  if (id) {
    await db.update(s.expenseTransactions).set(values).where(eq(s.expenseTransactions.id, id));
    await audit("expense", id, "update", values);
  } else {
    const [row] = await db.insert(s.expenseTransactions).values({ ...values, source: "manual" }).returning();
    await audit("expense", row.id, "create", values);
  }
  return done("Expense saved.", "/expenses", "/monthly-review");
}

export async function deleteExpenseAction(id: number): Promise<ActionState> {
  await requireUser();
  await getDb().delete(s.expenseTransactions).where(eq(s.expenseTransactions.id, id));
  await audit("expense", id, "delete");
  return done("Expense deleted.", "/expenses", "/monthly-review");
}

/** Copy last month's recurring expenses into the target month (skips ones already present). */
export async function applyRecurringAction(month: string): Promise<ActionState> {
  await requireUser();
  const m = monthKeySchema.safeParse(month);
  if (!m.success) return fail("Invalid month.");
  const db = getDb();
  const all = await db.select().from(s.expenseTransactions).where(eq(s.expenseTransactions.kind, "recurring"));
  const previousMonths = [...new Set(all.map((t) => t.month).filter((x) => x < m.data))].sort();
  const source = previousMonths.at(-1);
  if (!source) return fail("No recurring expenses found in earlier months.");
  const existing = all.filter((t) => t.month === m.data);
  const toCopy = all.filter((t) => t.month === source && !existing.some((e) => e.categoryId === t.categoryId && e.description === t.description));
  if (!toCopy.length) return { ok: true, message: "Recurring expenses are already present for this month." };
  await db.insert(s.expenseTransactions).values(
    toCopy.map((t) => {
      const day = t.date.slice(8, 10);
      const [y, mo] = m.data.split("-").map(Number);
      const maxDay = new Date(y, mo, 0).getDate();
      return { categoryId: t.categoryId, amount: t.amount, description: t.description, kind: "recurring", source: "recurring", month: m.data, date: `${m.data}-${String(Math.min(Number(day), maxDay)).padStart(2, "0")}` };
    }),
  );
  await audit("expense", null, "apply_recurring", { from: source, to: m.data, count: toCopy.length });
  return done(`Copied ${toCopy.length} recurring expense(s) from ${source}.`, "/expenses", "/monthly-review");
}

/**
 * CSV import. Columns (header row required): date, category, amount, description(optional), type(optional: recurring|one_time).
 * Unknown categories are created automatically.
 */
export async function importExpensesCsvAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a CSV file.");
  if (file.size > 2 * 1024 * 1024) return fail("CSV file must be under 2 MB.");
  const textContent = await file.text();
  const parsed = Papa.parse<Record<string, string>>(textContent, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
  if (parsed.errors.length && !parsed.data.length) return fail(`Could not read CSV: ${parsed.errors[0].message}`);
  const db = getDb();
  const cats = await db.select().from(s.expenseCategories);
  const byName = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));
  const rows: (typeof s.expenseTransactions.$inferInsert)[] = [];
  const problems: string[] = [];
  for (const [i, r] of parsed.data.entries()) {
    const line = i + 2;
    let date = (r.date ?? "").trim();
    const dmy = date.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) date = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    const amt = money.safeParse(r.amount ?? "");
    const catName = (r.category ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
      problems.push(`Line ${line}: invalid date "${r.date ?? ""}"`);
      continue;
    }
    if (!amt.success || Number(amt.data) <= 0) {
      problems.push(`Line ${line}: invalid amount "${r.amount ?? ""}"`);
      continue;
    }
    if (!catName) {
      problems.push(`Line ${line}: missing category`);
      continue;
    }
    let catId = byName.get(catName.toLowerCase());
    if (!catId) {
      const [c] = await db.insert(s.expenseCategories).values({ name: catName.slice(0, 80), sortOrder: 999 }).returning();
      catId = c.id;
      byName.set(catName.toLowerCase(), catId);
    }
    const kind = (r.type ?? r.kind ?? "").toLowerCase().includes("recur") ? "recurring" : "one_time";
    rows.push({ categoryId: catId, date, month: date.slice(0, 7), amount: amt.data, description: (r.description ?? "").slice(0, 255) || null, kind, source: "csv" });
  }
  if (rows.length) await db.insert(s.expenseTransactions).values(rows);
  await audit("expense", null, "csv_import", { imported: rows.length, skipped: problems.length });
  revalidatePath("/expenses");
  revalidatePath("/");
  return {
    ok: rows.length > 0,
    message: `Imported ${rows.length} expense(s).${problems.length ? ` Skipped ${problems.length}: ${problems.slice(0, 3).join("; ")}${problems.length > 3 ? "…" : ""}` : ""}`,
  };
}
