import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { createBlankProfile, seedInitialData } from "@/lib/db/seed";
import { D, ZERO, round2, toNum, sumD, maxD } from "@/lib/finance/money";
import { addMonths, monthKey } from "@/lib/finance/dates";
import { DebtInput, annualRatePct, contractualMinimum, hasKnownRate, monthlyInterest } from "@/lib/finance/debt";
import type { SimulationInput, Strategy } from "@/lib/finance/simulate";

export function loanKey(id: number) {
  return `loan:${id}`;
}
export function cardKey(id: number) {
  return `card:${id}`;
}

export function loanToDebt(l: s.Loan): DebtInput {
  return {
    key: loanKey(l.id),
    kind: "loan",
    name: l.name,
    balance: l.outstandingPrincipal,
    rate: l.interestRate,
    ratePeriod: l.ratePeriod as DebtInput["ratePeriod"],
    method: l.interestMethod as DebtInput["method"],
    convention: l.interestConvention as DebtInput["convention"],
    emi: l.emi,
    originalPrincipal: l.originalPrincipal,
    remainingTenure: l.remainingTenureMonths,
    prepaymentAllowed: l.prepaymentAllowed,
    prepaymentChargePct: l.foreclosureChargePct,
    monthlyCharges: l.additionalMonthlyCharges,
    paymentDay: l.paymentDay,
  };
}

export function cardToDebt(c: s.CreditCard): DebtInput {
  return {
    key: cardKey(c.id),
    kind: "card",
    name: c.name,
    balance: c.outstandingBalance,
    rate: c.interestRate,
    ratePeriod: c.ratePeriod as DebtInput["ratePeriod"],
    method: "reducing",
    minimumPayment: c.minimumDue,
    prepaymentAllowed: true,
    monthlyCharges: c.otherFees,
    paymentDay: c.dueDay,
  };
}

export async function ensureSeeded() {
  const db = getDb();
  await seedInitialData(db);
}

export async function getSettings() {
  const db = getDb();
  const [row] = await db.select().from(s.userSettings).limit(1);
  if (row) return row;
  const [created] = await db.insert(s.userSettings).values({}).returning();
  return created;
}

export async function getProfile() {
  const db = getDb();
  let [row] = await db.select().from(s.financialProfiles).limit(1);
  if (!row) {
    await createBlankProfile(db);
    [row] = await db.select().from(s.financialProfiles).limit(1);
  }
  return row;
}

export async function getIncomeSources(profileId: number) {
  return getDb().select().from(s.incomeSources).where(eq(s.incomeSources.profileId, profileId)).orderBy(asc(s.incomeSources.id));
}

export async function getLoans(includeClosed = true) {
  const db = getDb();
  const q = db.select().from(s.loans).orderBy(asc(s.loans.id));
  const rows = await q;
  return includeClosed ? rows : rows.filter((l) => l.status === "active");
}

export async function getCards(includeClosed = true) {
  const rows = await getDb().select().from(s.creditCards).orderBy(asc(s.creditCards.id));
  return includeClosed ? rows : rows.filter((c) => c.status === "active");
}

export async function getCategories(includeArchived = false) {
  const rows = await getDb().select().from(s.expenseCategories).orderBy(asc(s.expenseCategories.sortOrder), asc(s.expenseCategories.id));
  return includeArchived ? rows : rows.filter((c) => !c.archived);
}

/** Category budgets for a month: month-specific budget overrides the category default. */
export async function getBudgetsForMonth(month: string) {
  const db = getDb();
  const cats = await getCategories();
  const overrides = await db.select().from(s.monthlyBudgets).where(eq(s.monthlyBudgets.month, month));
  const byCat = new Map(overrides.map((o) => [o.categoryId, o.amount]));
  return cats.map((c) => ({
    category: c,
    budget: byCat.get(c.id) ?? c.defaultBudget,
    hasOverride: byCat.has(c.id),
  }));
}

export async function getExpensesForMonth(month: string) {
  return getDb()
    .select()
    .from(s.expenseTransactions)
    .where(eq(s.expenseTransactions.month, month))
    .orderBy(desc(s.expenseTransactions.date), desc(s.expenseTransactions.id));
}

export async function getActiveGoal() {
  const [g] = await getDb().select().from(s.debtFreeGoals).where(eq(s.debtFreeGoals.active, true)).orderBy(desc(s.debtFreeGoals.id)).limit(1);
  return g ?? null;
}

export interface CashFlow {
  month: string;
  salary: number;
  otherIncome: number;
  totalIncome: number;
  plannedExpenses: number;
  actualExpenses: number;
  discretionaryBudget: number;
  mandatoryEmis: number;
  mandatoryBreakdown: { key: string; name: string; amount: number; estimated: boolean; type: "emi" | "interest" | "card_min" }[];
  plannedSavings: number;
  extraCommitted: number;
  /** income − expenses − savings (+ extra commitment): all cash available for debt */
  availableForDebt: number;
  /** availableForDebt − mandatory payments */
  remainingForExtra: number;
  estimatedMonthlyInterest: number;
  interestUnknownFor: string[];
}

export interface FinancialState {
  month: string;
  profile: s.FinancialProfile;
  settings: s.UserSettings;
  incomeSources: s.IncomeSource[];
  loans: s.Loan[];
  cards: s.CreditCard[];
  debts: DebtInput[];
  budgets: Awaited<ReturnType<typeof getBudgetsForMonth>>;
  cashFlow: CashFlow;
  simulationInput: SimulationInput;
  totalDebt: number;
  goal: Awaited<ReturnType<typeof getActiveGoal>>;
}

/** Load everything needed for planning and compute the current cash-flow picture. */
export async function getFinancialState(month = monthKey()): Promise<FinancialState> {
  const profile = await getProfile();
  const [settings, incomeSources, loans, cards, budgets, actual, goal] = await Promise.all([
    getSettings(),
    getIncomeSources(profile.id),
    getLoans(),
    getCards(),
    getBudgetsForMonth(month),
    getExpensesForMonth(month),
    getActiveGoal(),
  ]);

  const activeLoans = loans.filter((l) => l.status === "active" && D(l.outstandingPrincipal).gt(0));
  const activeCards = cards.filter((c) => c.status === "active" && D(c.outstandingBalance).gt(0));
  const debts = [...activeCards.map(cardToDebt), ...activeLoans.map(loanToDebt)];

  const salary = D(profile.monthlySalary);
  const otherIncome = sumD(incomeSources.filter((i) => i.active).map((i) => i.amount));
  const totalIncome = salary.plus(otherIncome);
  const plannedExpenses = sumD(budgets.map((b) => b.budget));
  const discretionary = sumD(budgets.filter((b) => !b.category.isEssential).map((b) => b.budget));
  const actualExpenses = sumD(actual.map((a) => a.amount));

  const mandatoryBreakdown: CashFlow["mandatoryBreakdown"] = [];
  let interestTotal = ZERO;
  const interestUnknownFor: string[] = [];
  for (const d of debts) {
    const interest = monthlyInterest(d, d.balance, month);
    if (interest === null) interestUnknownFor.push(d.name);
    const i = interest ?? ZERO;
    interestTotal = interestTotal.plus(i);
    const charges = D(d.monthlyCharges);
    const min = contractualMinimum(d, i, charges, D(d.balance).plus(i).plus(charges));
    mandatoryBreakdown.push({
      key: d.key,
      name: d.name,
      amount: toNum(min.amount),
      estimated: min.estimated,
      type: d.kind === "card" ? "card_min" : d.emi && D(d.emi).gt(0) ? "emi" : "interest",
    });
  }
  const mandatory = sumD(mandatoryBreakdown.map((m) => m.amount));

  const savingsTarget = D(profile.emergencySavingsTarget);
  const currentSavings = D(profile.currentSavings);
  let plannedSavings = D(settings.plannedMonthlySavings);
  if (settings.stopSavingsAtTarget && savingsTarget.gt(0)) {
    plannedSavings = maxD(ZERO, plannedSavings.lt(savingsTarget.minus(currentSavings)) ? plannedSavings : savingsTarget.minus(currentSavings));
  }
  const extra = D(settings.extraMonthlyRepayment);
  const available = totalIncome.minus(plannedExpenses).minus(plannedSavings).plus(extra);

  // Once a month is closed in the monthly review, its payments are already reflected in
  // balances — projections then start from the following month.
  const [lastClosed] = await getDb()
    .select({ month: s.financialSnapshots.month })
    .from(s.financialSnapshots)
    .where(eq(s.financialSnapshots.status, "closed"))
    .orderBy(desc(s.financialSnapshots.month))
    .limit(1);
  const afterClosed = lastClosed ? addMonths(lastClosed.month, 1) : null;
  const preferred = settings.planStartMonth ?? monthKey();
  const startMonth = afterClosed && afterClosed > preferred ? afterClosed : preferred;
  const simulationInput: SimulationInput = {
    startMonth,
    debts,
    monthlyIncome: toNum(totalIncome),
    monthlyExpenses: toNum(plannedExpenses),
    plannedSavings: settings.plannedMonthlySavings,
    currentSavings: profile.currentSavings,
    savingsTarget: profile.emergencySavingsTarget,
    stopSavingsAtTarget: settings.stopSavingsAtTarget,
    extraMonthlyPayment: settings.extraMonthlyRepayment,
    strategy: (settings.preferredStrategy as Strategy) ?? "priority",
    priorityOrder: normalisePriority(settings.priorityOrder, debts),
  };

  return {
    month,
    profile,
    settings,
    incomeSources,
    loans,
    cards,
    debts,
    budgets,
    goal,
    totalDebt: toNum(sumD(debts.map((d) => d.balance))),
    simulationInput,
    cashFlow: {
      month,
      salary: toNum(salary),
      otherIncome: toNum(otherIncome),
      totalIncome: toNum(totalIncome),
      plannedExpenses: toNum(plannedExpenses),
      actualExpenses: toNum(actualExpenses),
      discretionaryBudget: toNum(discretionary),
      mandatoryEmis: toNum(mandatory),
      mandatoryBreakdown,
      plannedSavings: toNum(plannedSavings),
      extraCommitted: toNum(extra),
      availableForDebt: toNum(available),
      remainingForExtra: toNum(round2(available.minus(mandatory))),
      estimatedMonthlyInterest: toNum(interestTotal),
      interestUnknownFor,
    },
  };
}

/** Keep the saved order, dropping closed debts and appending new ones at the end. */
export function normalisePriority(order: string[] | null | undefined, debts: DebtInput[]): string[] {
  const keys = debts.map((d) => d.key);
  const kept = (order ?? []).filter((k) => keys.includes(k));
  return [...kept, ...keys.filter((k) => !kept.includes(k))];
}

export function debtRateLabel(d: DebtInput): string {
  if (!hasKnownRate(d)) return "Not configured";
  const a = annualRatePct(d)!;
  return d.ratePeriod === "monthly" ? `${D(d.rate).toString()}% / month (${a.toString()}% p.a.)` : `${a.toString()}% p.a.`;
}

export async function getSnapshots() {
  return getDb().select().from(s.financialSnapshots).orderBy(desc(s.financialSnapshots.month));
}

export async function getLoanTransactions(loanIds?: number[]) {
  const db = getDb();
  if (loanIds && loanIds.length) {
    return db.select().from(s.loanTransactions).where(inArray(s.loanTransactions.loanId, loanIds)).orderBy(desc(s.loanTransactions.date), desc(s.loanTransactions.id));
  }
  return db.select().from(s.loanTransactions).orderBy(desc(s.loanTransactions.date), desc(s.loanTransactions.id));
}

export async function getCardTransactions() {
  return getDb().select().from(s.creditCardTransactions).orderBy(desc(s.creditCardTransactions.date), desc(s.creditCardTransactions.id));
}

export async function getMonthTransactionsTotals(month: string) {
  const db = getDb();
  const start = `${month}-01`;
  const all = await db.select().from(s.loanTransactions);
  const inMonth = all.filter((t) => t.date.startsWith(month));
  const cardTx = (await db.select().from(s.creditCardTransactions)).filter((t) => t.date.startsWith(month));
  return {
    start,
    emiPaid: toNum(sumD(inMonth.filter((t) => t.type === "emi" || t.type === "interest_only").map((t) => t.amount))),
    extraPaid: toNum(sumD(inMonth.filter((t) => t.type === "extra_principal").map((t) => t.amount))),
    interestPaid: toNum(sumD(inMonth.map((t) => t.interestComponent))),
    principalPaid: toNum(sumD(inMonth.map((t) => t.principalComponent))),
    cardPaid: toNum(sumD(cardTx.filter((t) => t.type === "payment").map((t) => t.amount))),
  };
}

export { and, eq };
