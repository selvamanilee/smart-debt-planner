"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getFinancialState, getMonthTransactionsTotals, getProfile, getExpensesForMonth } from "@/lib/data";
import { D, round2, sumD, toNum } from "@/lib/finance/money";
import { simulate } from "@/lib/finance/simulate";
import { storePlan } from "@/lib/plans";
import { type ActionState, fail, formToObject, money, monthKeySchema, optionalMoney, optionalText } from "@/lib/validation";

/**
 * Close a month: reconcile balances with statements, record savings, freeze a snapshot
 * (never overwritten) and generate the next repayment schedule.
 */
export async function closeMonthAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const raw = formToObject(fd);
  const month = monthKeySchema.safeParse(raw.month);
  if (!month.success) return fail("Invalid month.");
  const db = getDb();
  const [existing] = await db.select().from(s.financialSnapshots).where(eq(s.financialSnapshots.month, month.data));
  if (existing?.status === "closed") return fail(`${month.data} is already closed. Closed months are kept unchanged for your history.`);

  const errors: Record<string, string> = {};
  const parse = (key: string, schema: typeof money | typeof optionalMoney) => {
    const r = schema.safeParse(raw[key] ?? "");
    if (!r.success) errors[key] = r.error.issues[0].message;
    return r.success ? r.data : null;
  };
  const salaryReceived = parse("salaryReceived", money) ?? "0";
  const otherIncome = parse("otherIncome", optionalMoney) ?? "0";
  const savingsBalance = parse("savingsBalance", money) ?? "0";
  const actualExpensesOverride = parse("actualExpenses", optionalMoney);
  const notes = optionalText(2000).safeParse(raw.notes).data ?? null;

  const before = await getFinancialState(month.data);
  const balances: Record<string, { name: string; opening: number; closing: number }> = {};
  const newBalances: { key: string; value: string }[] = [];
  for (const l of before.loans.filter((x) => x.status === "active")) {
    const key = `loan:${l.id}`;
    const v = parse(`bal_${key}`, money);
    if (v !== null) newBalances.push({ key, value: v });
  }
  for (const c of before.cards.filter((x) => x.status === "active")) {
    const key = `card:${c.id}`;
    const v = parse(`bal_${key}`, money);
    if (v !== null) newBalances.push({ key, value: v });
  }
  if (Object.keys(errors).length) return fail(errors);

  const totals = await getMonthTransactionsTotals(month.data);
  const loanTx = (await db.select().from(s.loanTransactions)).filter((t) => t.date.startsWith(month.data));
  const cardTx = (await db.select().from(s.creditCardTransactions)).filter((t) => t.date.startsWith(month.data));
  const today = new Date().toISOString().slice(0, 10);
  const txDate = today.startsWith(month.data) ? today : `${month.data}-28`;

  // Reconcile each balance with the statement figure.
  for (const nb of newBalances) {
    const [kind, idStr] = nb.key.split(":");
    const id = Number(idStr);
    if (kind === "loan") {
      const loan = before.loans.find((l) => l.id === id)!;
      const firstTx = loanTx.filter((t) => t.loanId === id).sort((a, b) => a.id - b.id)[0];
      const opening = D(firstTx?.balanceBefore ?? loan.outstandingPrincipal);
      if (!D(loan.outstandingPrincipal).eq(nb.value)) {
        await db.insert(s.loanTransactions).values({
          loanId: id,
          date: txDate,
          type: "adjustment",
          amount: nb.value,
          principalComponent: round2(D(loan.outstandingPrincipal).minus(nb.value)).toFixed(2),
          balanceBefore: loan.outstandingPrincipal,
          balanceAfter: nb.value,
          note: `Reconciled in ${month.data} monthly review`,
        });
        await db.update(s.loans).set({ outstandingPrincipal: nb.value, status: D(nb.value).gt(0) ? "active" : "closed" }).where(eq(s.loans.id, id));
      }
      balances[nb.key] = { name: loan.name, opening: toNum(opening), closing: toNum(nb.value) };
    } else {
      const card = before.cards.find((c) => c.id === id)!;
      const firstTx = cardTx.filter((t) => t.cardId === id).sort((a, b) => a.id - b.id)[0];
      const opening = D(firstTx?.balanceBefore ?? card.outstandingBalance);
      if (!D(card.outstandingBalance).eq(nb.value)) {
        await db.insert(s.creditCardTransactions).values({
          cardId: id,
          date: txDate,
          type: "adjustment",
          amount: nb.value,
          balanceBefore: card.outstandingBalance,
          balanceAfter: nb.value,
          note: `Reconciled in ${month.data} monthly review`,
        });
        await db.update(s.creditCards).set({ outstandingBalance: nb.value, status: D(nb.value).gt(0) ? "active" : "closed" }).where(eq(s.creditCards.id, id));
      }
      balances[nb.key] = { name: card.name, opening: toNum(opening), closing: toNum(nb.value) };
    }
  }

  const profile = await getProfile();
  await db.update(s.financialProfiles).set({ currentSavings: savingsBalance }).where(eq(s.financialProfiles.id, profile.id));

  // Projection after reconciliation → next repayment schedule.
  const after = await getFinancialState(month.data);
  const nextStart = (await import("@/lib/finance/dates")).addMonths(month.data, 1);
  const nextInput = { ...after.simulationInput, startMonth: after.settings.planStartMonth && after.settings.planStartMonth > nextStart ? after.settings.planStartMonth : nextStart };
  const projection = simulate(nextInput);
  const planned = simulate({ ...before.simulationInput, startMonth: month.data }).months[0];
  const actualExpenses = actualExpensesOverride ?? toNum(sumD((await getExpensesForMonth(month.data)).map((e) => e.amount))).toFixed(2);

  const openingDebt = sumD(Object.values(balances).map((b) => b.opening));
  const closingDebt = sumD(Object.values(balances).map((b) => b.closing));
  const values = {
    month: month.data,
    salaryReceived,
    otherIncome,
    plannedExpenses: before.cashFlow.plannedExpenses.toFixed(2),
    actualExpenses,
    emiPaid: totals.emiPaid.toFixed(2),
    extraPaid: totals.extraPaid.toFixed(2),
    cardPaid: totals.cardPaid.toFixed(2),
    savingsBalance,
    openingDebt: openingDebt.toFixed(2),
    closingDebt: closingDebt.toFixed(2),
    principalReduction: round2(openingDebt.minus(closingDebt)).toFixed(2),
    interestPaid: totals.interestPaid.toFixed(2),
    plannedPayment: (planned?.totalPaid ?? 0).toFixed(2),
    debtBalances: balances,
    projectedDebtFreeMonth: projection.debtFreeMonth,
    projectedTotalInterest: projection.totalInterest.toFixed(2),
    notes,
    status: "closed",
    closedAt: new Date(),
  };
  if (existing) await db.update(s.financialSnapshots).set(values).where(eq(s.financialSnapshots.id, existing.id));
  else await db.insert(s.financialSnapshots).values(values);

  const planId = await storePlan(`Plan after ${month.data} review`, nextInput, projection, true);
  await audit("snapshot", month.data, "close", { closingDebt: values.closingDebt, projectedDebtFreeMonth: projection.debtFreeMonth, planId });

  for (const p of ["/", "/monthly-review", "/loans", "/credit-cards", "/planner", "/reports", "/profile"]) revalidatePath(p);
  return { ok: true, message: `${month.data} closed. Next schedule generated — projected debt-free ${projection.debtFreeMonth ?? "beyond 30 years"}.` };
}
