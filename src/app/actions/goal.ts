"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getFinancialState } from "@/lib/data";
import { type ActionState, fail, formToObject, monthKeySchema, optionalText, zodErrors } from "@/lib/validation";

const goalSchema = z.object({ targetMonth: monthKeySchema, description: optionalText(500) });

export async function saveGoalAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = goalSchema.safeParse(formToObject(fd));
  if (!parsed.success) return fail(zodErrors(parsed.error));
  const state = await getFinancialState();
  const db = getDb();
  await db.update(s.debtFreeGoals).set({ active: false }).where(eq(s.debtFreeGoals.active, true));
  const [row] = await db
    .insert(s.debtFreeGoals)
    .values({ targetMonth: parsed.data.targetMonth, description: parsed.data.description, active: true, baselineDebt: state.totalDebt.toFixed(2) })
    .returning();
  await audit("goal", row.id, "create", parsed.data);
  revalidatePath("/goal");
  revalidatePath("/");
  return { ok: true, message: "Debt-free target saved." };
}

export async function clearGoalAction(): Promise<ActionState> {
  await requireUser();
  await getDb().update(s.debtFreeGoals).set({ active: false }).where(eq(s.debtFreeGoals.active, true));
  await audit("goal", null, "clear");
  revalidatePath("/goal");
  revalidatePath("/");
  return { ok: true, message: "Target removed." };
}
