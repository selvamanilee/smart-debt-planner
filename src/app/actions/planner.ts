"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getFinancialState, getSettings } from "@/lib/data";
import { applyOverrides, type ScenarioOverrides } from "@/lib/finance/analysis";
import { simulate } from "@/lib/finance/simulate";
import { isValidMonthKey } from "@/lib/finance/dates";
import type { ActionState } from "@/lib/validation";
import { overridesSchema, storePlan, summarize } from "@/lib/plans";

const num = z.number().finite().min(0).max(1e12);

const settingsSchema = z.object({
  strategy: z.enum(["priority", "avalanche", "snowball"]),
  priorityOrder: z.array(z.string().max(40)).max(200),
  plannedSavings: num,
  extraMonthlyPayment: z.number().finite().min(-1e12).max(1e12),
  stopSavingsAtTarget: z.boolean(),
  planStartMonth: z.string().refine(isValidMonthKey).nullable(),
});

/** Persist strategy, priority order and savings/extra settings as the default plan. */
export async function savePlannerSettingsAction(input: z.input<typeof settingsSchema>): Promise<ActionState> {
  await requireUser();
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid planner settings." };
  const settings = await getSettings();
  const d = parsed.data;
  await getDb()
    .update(s.userSettings)
    .set({
      preferredStrategy: d.strategy,
      priorityOrder: d.priorityOrder,
      plannedMonthlySavings: d.plannedSavings.toFixed(2),
      extraMonthlyRepayment: d.extraMonthlyPayment.toFixed(2),
      stopSavingsAtTarget: d.stopSavingsAtTarget,
      planStartMonth: d.planStartMonth,
    })
    .where(eq(s.userSettings.id, settings.id));
  await audit("settings", settings.id, "planner_update", d);
  for (const p of ["/", "/planner", "/goal", "/settings"]) revalidatePath(p);
  return { ok: true, message: "Saved as your default repayment plan." };
}

export async function saveScenarioAction(input: { name: string; description?: string; overrides: unknown }): Promise<ActionState> {
  await requireUser();
  const name = String(input.name ?? "").trim().slice(0, 120);
  if (!name) return { ok: false, message: "Give the scenario a name." };
  const parsed = overridesSchema.safeParse(input.overrides);
  if (!parsed.success) return { ok: false, message: "Scenario data is invalid." };
  const state = await getFinancialState();
  const result = simulate(applyOverrides(state.simulationInput, parsed.data as ScenarioOverrides));
  const [row] = await getDb()
    .insert(s.simulationScenarios)
    .values({ name, description: input.description?.slice(0, 500) ?? null, strategy: result.strategy, overrides: parsed.data, resultSummary: summarize(result) })
    .returning();
  await audit("scenario", row.id, "create", { name });
  revalidatePath("/planner");
  return { ok: true, message: `Scenario “${name}” saved.` };
}

export async function deleteScenarioAction(id: number): Promise<ActionState> {
  await requireUser();
  await getDb().delete(s.simulationScenarios).where(eq(s.simulationScenarios.id, id));
  await audit("scenario", id, "delete");
  revalidatePath("/planner");
  return { ok: true, message: "Scenario deleted." };
}

/** Generate and store a repayment plan (recomputed on the server from saved data + overrides). */
export async function saveRepaymentPlanAction(input: { name: string; overrides: unknown; makeActive?: boolean }): Promise<ActionState> {
  await requireUser();
  const parsed = overridesSchema.safeParse(input.overrides ?? {});
  if (!parsed.success) return { ok: false, message: "Plan data is invalid." };
  const state = await getFinancialState();
  const simInput = applyOverrides(state.simulationInput, parsed.data as ScenarioOverrides);
  const result = simulate(simInput);
  const id = await storePlan(String(input.name || "Repayment plan").slice(0, 120), simInput, result, input.makeActive ?? true);
  revalidatePath("/planner");
  revalidatePath("/reports");
  return { ok: true, message: `Plan #${id} saved with ${result.months.length} months of schedule.` };
}

export async function deletePlanAction(id: number): Promise<ActionState> {
  await requireUser();
  await getDb().delete(s.repaymentPlans).where(eq(s.repaymentPlans.id, id));
  await audit("repayment_plan", id, "delete");
  revalidatePath("/planner");
  return { ok: true, message: "Plan deleted." };
}
