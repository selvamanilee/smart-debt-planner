import "server-only";
import { desc, eq } from "drizzle-orm";
import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { getFinancialState, type FinancialState } from "@/lib/data";
import { simulate, compareStrategies, STRATEGY_LABELS } from "@/lib/finance/simulate";
import { analyzeGoal, applyOverrides, type ScenarioOverrides } from "@/lib/finance/analysis";
import { isValidMonthKey } from "@/lib/finance/dates";
import { annualRatePct, hasKnownRate } from "@/lib/finance/debt";
import { D } from "@/lib/finance/money";
import type { AssistantContext } from "./local";

export function aiConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

export async function buildContext(state: FinancialState): Promise<AssistantContext> {
  const db = getDb();
  const [snap] = await db.select().from(s.financialSnapshots).where(eq(s.financialSnapshots.status, "closed")).orderBy(desc(s.financialSnapshots.month)).limit(1);
  const [plan] = await db.select().from(s.repaymentPlans).orderBy(desc(s.repaymentPlans.createdAt)).limit(1);
  let previous: AssistantContext["previous"] = null;
  if (snap && (!plan || snap.closedAt! >= plan.createdAt)) {
    previous = { label: `Your ${snap.month} monthly review`, debtFreeMonth: snap.projectedDebtFreeMonth, totalInterest: snap.projectedTotalInterest ? Number(snap.projectedTotalInterest) : null };
  } else if (plan) {
    previous = { label: `Saved plan “${plan.name}” (${plan.createdAt.toLocaleDateString("en-IN")})`, debtFreeMonth: plan.debtFreeMonth, totalInterest: Number(plan.totalInterest) };
  }
  const cf = state.cashFlow;
  return {
    input: state.simulationInput,
    totalIncome: cf.totalIncome,
    plannedExpenses: cf.plannedExpenses,
    plannedSavings: cf.plannedSavings,
    mandatory: cf.mandatoryEmis,
    availableForDebt: cf.availableForDebt,
    remainingForExtra: cf.remainingForExtra,
    discretionaryBudget: cf.discretionaryBudget,
    goalMonth: state.goal?.targetMonth ?? null,
    previous,
  };
}

function summarizeResult(r: ReturnType<typeof simulate>) {
  return {
    strategy: STRATEGY_LABELS[r.strategy],
    debtFreeMonth: r.debtFreeMonth,
    monthsToDebtFree: r.monthsToDebtFree,
    totalInterest: r.totalInterest,
    totalPaid: r.totalPaid,
    firstMonthRepaymentPool: r.firstMonthPool,
    firstMonthMandatory: r.firstMonthMandatory,
    extraPaymentOrder: r.order.map((k) => r.debts.find((d) => d.key === k)?.name),
    debts: r.debts.map((d) => ({ key: d.key, name: d.name, closureMonth: d.closureMonth, totalInterest: d.totalInterest, interestRateUnknown: d.interestEstimated })),
    warnings: r.warnings,
    isEstimate: r.isEstimate,
  };
}

const SYSTEM_PROMPT = `You are "Personal Debt Optimizer", a careful personal-finance assistant inside the Smart Debt Planner app (Indian Rupees, ₹).
Rules:
- NEVER calculate interest, balances, EMIs, dates or savings yourself. Always call the provided tools; quote only numbers returned by tools.
- If a tool reports an unknown interest rate or estimate, say so plainly. Never invent a rate, balance or payment.
- You cannot record, confirm or change payments or any financial record. If asked, explain that payments must be recorded by the user on the Loans / Credit Cards pages.
- Use Indian number formatting (e.g. ₹1,27,739).
- Answer in Markdown with exactly these "##" sections in order:
  Current financial status; Problem identified; Suggested action; Monthly financial impact; Estimated interest savings; Debt-free date impact; Risks and assumptions; Recommended next step.
- Keep each section to 1-3 short sentences. A small Markdown table is allowed for schedules.`;

export async function answerWithAI(question: string, history: { role: "user" | "assistant"; content: string }[], state: FinancialState, model: string) {
  const ctx = await buildContext(state);
  const base = state.simulationInput;
  const tools = {
    getFinancialSnapshot: tool({
      description: "Current saved financial data: income, expenses, EMIs, savings, debts and the current projection.",
      inputSchema: z.object({}),
      execute: async () => ({
        month: state.month,
        cashFlow: state.cashFlow,
        currentSavings: Number(state.profile.currentSavings),
        emergencySavingsTarget: Number(state.profile.emergencySavingsTarget),
        debts: state.debts.map((d) => ({
          key: d.key,
          name: d.name,
          kind: d.kind,
          balance: Number(d.balance),
          annualRatePercent: hasKnownRate(d) ? annualRatePct(d)!.toNumber() : null,
          ratePeriod: d.ratePeriod,
          emiOrMinimum: d.emi ? Number(d.emi) : d.minimumPayment ? Number(d.minimumPayment) : null,
        })),
        debtFreeGoal: state.goal?.targetMonth ?? null,
        previousProjection: ctx.previous,
        projection: summarizeResult(simulate(base)),
      }),
    }),
    runWhatIf: tool({
      description: "Simulate a what-if scenario with the deterministic engine. Amounts are monthly rupees; months are YYYY-MM.",
      inputSchema: z.object({
        monthlyIncome: z.number().min(0).optional().describe("New total monthly income"),
        monthlyExpenses: z.number().min(0).optional().describe("New total monthly expenses"),
        plannedSavings: z.number().min(0).optional(),
        extraMonthlyPayment: z.number().optional().describe("Additional monthly repayment on top of surplus"),
        strategy: z.enum(["priority", "avalanche", "snowball"]).optional(),
        bonus: z.object({ month: z.string(), amount: z.number().min(0) }).optional(),
        lumpSum: z.object({ month: z.string(), amount: z.number().min(0), debtKey: z.string() }).optional(),
      }),
      execute: async (a) => {
        const events: ScenarioOverrides["events"] = [];
        if (a.bonus && isValidMonthKey(a.bonus.month)) events.push({ type: "bonus", month: a.bonus.month, amount: a.bonus.amount });
        if (a.lumpSum && isValidMonthKey(a.lumpSum.month)) events.push({ type: "lump_sum", month: a.lumpSum.month, amount: a.lumpSum.amount, debtKey: a.lumpSum.debtKey });
        const before = simulate(base);
        const after = simulate(applyOverrides(base, { ...a, events }));
        return { before: summarizeResult(before), after: summarizeResult(after), interestSaved: Number(D(before.totalInterest).minus(after.totalInterest).toFixed(2)) };
      },
    }),
    compareStrategies: tool({
      description: "Compare My Priority, Debt Avalanche and Debt Snowball on current data.",
      inputSchema: z.object({}),
      execute: async () => {
        const c = compareStrategies(base);
        return { lowestInterest: STRATEGY_LABELS[c.best], priority: summarizeResult(c.results.priority), avalanche: summarizeResult(c.results.avalanche), snowball: summarizeResult(c.results.snowball) };
      },
    }),
    repaymentSchedule: tool({
      description: "Month-by-month repayment schedule for the next N months (max 24).",
      inputSchema: z.object({ months: z.number().int().min(1).max(24) }),
      execute: async ({ months }) =>
        simulate(base).months.slice(0, months).map((m) => ({
          month: m.month,
          income: m.income,
          expenses: m.expenses,
          savings: m.savingsContribution,
          totalDebtPayment: m.totalPaid,
          interest: m.interest,
          closingDebt: m.closingDebt,
          perDebt: Object.values(m.debts).map((d) => ({ key: d.key, payment: d.totalPaid, interest: d.interest, closing: d.closing })),
        })),
    }),
    debtFreeGoal: tool({
      description: "Analyse whether all debts can be repaid by a target month (YYYY-MM) and what extra monthly amount is needed.",
      inputSchema: z.object({ targetMonth: z.string() }),
      execute: async ({ targetMonth }) => {
        if (!isValidMonthKey(targetMonth)) return { error: "targetMonth must be YYYY-MM" };
        const g = analyzeGoal(base, targetMonth, state.cashFlow.discretionaryBudget);
        const { requiredResult, ...rest } = g;
        return { ...rest, requiredDebtFreeMonth: requiredResult?.debtFreeMonth ?? null, monthlyShortfall: Number.isNaN(g.monthlyShortfall) ? null : g.monthlyShortfall, additionalIncomeRequired: Number.isNaN(g.additionalIncomeRequired) ? null : g.additionalIncomeRequired };
      },
    }),
  };

  const result = await generateText({
    model,
    system: `${SYSTEM_PROMPT}\nToday's planning month is ${state.simulationInput.startMonth}.`,
    messages: [...history.slice(-8), { role: "user", content: question }],
    tools,
    stopWhen: isStepCount(6),
    maxOutputTokens: 1500,
  });
  return result.text;
}

export { getFinancialState };
