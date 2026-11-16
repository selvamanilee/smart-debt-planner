import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { audit } from "@/lib/audit";
import { simulate } from "@/lib/finance/simulate";
import { isValidMonthKey } from "@/lib/finance/dates";

const num = z.number().finite().min(0).max(1e12);
const eventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("income_change"), month: z.string().refine(isValidMonthKey), amount: num }),
  z.object({ type: z.literal("expense_change"), month: z.string().refine(isValidMonthKey), amount: num }),
  z.object({ type: z.literal("bonus"), month: z.string().refine(isValidMonthKey), amount: num }),
  z.object({ type: z.literal("lump_sum"), month: z.string().refine(isValidMonthKey), amount: num, debtKey: z.string().max(40), source: z.enum(["external", "savings"]).optional() }),
  z.object({ type: z.literal("settle"), month: z.string().refine(isValidMonthKey), debtKey: z.string().max(40), source: z.enum(["external", "savings"]).optional() }),
  z.object({ type: z.literal("rate_change"), month: z.string().refine(isValidMonthKey), debtKey: z.string().max(40), rate: z.number().min(0).max(1000) }),
]);

export const overridesSchema = z.object({
  monthlyIncome: num.optional(),
  monthlyExpenses: num.optional(),
  plannedSavings: num.optional(),
  extraMonthlyPayment: z.number().finite().min(-1e12).max(1e12).optional(),
  strategy: z.enum(["priority", "avalanche", "snowball"]).optional(),
  priorityOrder: z.array(z.string().max(40)).max(200).optional(),
  events: z.array(eventSchema).max(100).optional(),
  debtOverrides: z
    .record(z.string(), z.object({ balance: num.optional(), rate: z.number().min(0).max(1000).nullable().optional(), emi: num.nullable().optional() }))
    .optional(),
});

export function summarize(r: ReturnType<typeof simulate>) {
  return {
    totalInterest: r.totalInterest,
    totalCharges: r.totalCharges,
    totalPaid: r.totalPaid,
    debtFreeMonth: r.debtFreeMonth,
    monthsToDebtFree: r.monthsToDebtFree,
    isEstimate: r.isEstimate,
    debts: r.debts.map((d) => ({ key: d.key, name: d.name, closureMonth: d.closureMonth, totalInterest: d.totalInterest })),
  };
}


export async function storePlan(name: string, simInput: unknown, result: ReturnType<typeof simulate>, makeActive: boolean) {
  const db = getDb();
  if (makeActive) await db.update(s.repaymentPlans).set({ isActive: false }).where(eq(s.repaymentPlans.isActive, true));
  const [plan] = await db
    .insert(s.repaymentPlans)
    .values({
      name,
      strategy: result.strategy,
      startMonth: result.months[0]?.month ?? "",
      monthlyBudget: result.firstMonthPool.toFixed(2),
      totalInterest: result.totalInterest.toFixed(2),
      debtFreeMonth: result.debtFreeMonth,
      monthsToDebtFree: result.monthsToDebtFree,
      isActive: makeActive,
      inputs: simInput as object,
      summary: summarize(result),
    })
    .returning();
  const items = result.months.flatMap((m) =>
    Object.values(m.debts).map((d) => ({
      planId: plan.id,
      monthIndex: m.index,
      month: m.month,
      debtKey: d.key,
      debtName: result.debts.find((x) => x.key === d.key)?.name ?? d.key,
      opening: d.opening.toFixed(2),
      interest: d.interest.toFixed(2),
      charges: d.charges.toFixed(2),
      payment: d.totalPaid.toFixed(2),
      principal: d.principalPaid.toFixed(2),
      closing: d.closing.toFixed(2),
    })),
  );
  for (let i = 0; i < items.length; i += 500) await db.insert(s.repaymentPlanItems).values(items.slice(i, i + 500));
  await audit("repayment_plan", plan.id, "create", { name, strategy: result.strategy });
  return plan.id;
}

