import { D, Money, MoneyInput, ZERO, round2, minD, maxD, toNum, isEffectivelyZero } from "./money";
import { addMonths } from "./dates";
import {
  DebtInput,
  contractualMinimum,
  effectiveAnnualCost,
  hasKnownRate,
  monthlyInterest,
} from "./debt";

export type Strategy = "priority" | "avalanche" | "snowball";

export const STRATEGY_LABELS: Record<Strategy, string> = {
  priority: "My Priority",
  avalanche: "Debt Avalanche",
  snowball: "Debt Snowball",
};

export type SimEvent =
  /** New monthly income from this month onwards. */
  | { type: "income_change"; month: string; amount: MoneyInput }
  /** New monthly expenses from this month onwards. */
  | { type: "expense_change"; month: string; amount: MoneyInput }
  /** One-time cash added to this month's repayment pool (bonus etc.). */
  | { type: "bonus"; month: string; amount: MoneyInput }
  /** One-time payment earmarked for a specific debt. */
  | { type: "lump_sum"; month: string; amount: MoneyInput; debtKey: string; source?: "external" | "savings" }
  /** Pay off a debt entirely this month. */
  | { type: "settle"; month: string; debtKey: string; source?: "external" | "savings" }
  /** Interest rate changes from this month onwards. */
  | { type: "rate_change"; month: string; debtKey: string; rate: MoneyInput };

export interface SimulationInput {
  startMonth: string;
  debts: DebtInput[];
  monthlyIncome: MoneyInput;
  monthlyExpenses: MoneyInput;
  /** Planned monthly savings contribution. */
  plannedSavings: MoneyInput;
  currentSavings: MoneyInput;
  savingsTarget?: MoneyInput | null;
  /** If true, savings contributions stop (and flow to debt) once the target is reached. */
  stopSavingsAtTarget?: boolean;
  /** Additional monthly repayment committed on top of the computed surplus (may be negative to hold back cash). */
  extraMonthlyPayment?: MoneyInput;
  strategy: Strategy;
  priorityOrder?: string[];
  events?: SimEvent[];
  maxMonths?: number;
  /** Single-debt schedules: minimum payments are assumed funded; the pool only carries extras. */
  minimumsFunded?: boolean;
}

export interface DebtMonth {
  key: string;
  opening: number;
  interest: number;
  charges: number;
  minimumPaid: number;
  extraPaid: number;
  prepaymentCharges: number;
  totalPaid: number;
  principalPaid: number;
  closing: number;
  closedThisMonth: boolean;
}

export interface SimMonth {
  index: number;
  month: string;
  income: number;
  expenses: number;
  savingsContribution: number;
  savingsBalance: number;
  bonus: number;
  /** Total cash available for debt this month (before payments). */
  repaymentPool: number;
  mandatoryPaid: number;
  extraPaid: number;
  totalPaid: number;
  interest: number;
  charges: number;
  principalPaid: number;
  surplusToSavings: number;
  drawnFromSavings: number;
  shortfall: number;
  openingDebt: number;
  closingDebt: number;
  debts: Record<string, DebtMonth>;
}

export interface DebtSummary {
  key: string;
  name: string;
  kind: DebtInput["kind"];
  startBalance: number;
  totalInterest: number;
  totalCharges: number;
  totalPaid: number;
  closureMonth: string | null;
  monthsToClose: number | null;
  interestEstimated: boolean;
}

export interface SimulationResult {
  strategy: Strategy;
  order: string[];
  months: SimMonth[];
  debts: DebtSummary[];
  totalInterest: number;
  totalCharges: number;
  totalPaid: number;
  startDebt: number;
  debtFreeMonth: string | null;
  monthsToDebtFree: number | null;
  finalSavings: number;
  totalShortfall: number;
  firstMonthPool: number;
  firstMonthMandatory: number;
  warnings: string[];
  assumptions: string[];
  isEstimate: boolean;
}

interface DebtState {
  debt: DebtInput;
  balance: Money;
  closed: boolean;
  totalInterest: Money;
  totalCharges: Money;
  totalPaid: Money;
  closureIndex: number | null;
  interestEstimated: boolean;
}

/** Order debts for extra-payment allocation according to the strategy. */
export function orderDebts(debts: DebtInput[], strategy: Strategy, priorityOrder: string[] = [], balances?: Record<string, Money>): DebtInput[] {
  const bal = (d: DebtInput) => (balances?.[d.key] ?? D(d.balance));
  const list = [...debts];
  if (strategy === "priority") {
    const pos = (k: string) => {
      const i = priorityOrder.indexOf(k);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return list.sort((a, b) => pos(a.key) - pos(b.key) || bal(a).cmp(bal(b)));
  }
  if (strategy === "snowball") {
    return list.sort((a, b) => bal(a).cmp(bal(b)) || a.name.localeCompare(b.name));
  }
  // Avalanche: highest effective cost first. Unknown rates rank first (flagged) —
  // an unconfigured rate is treated as potentially the most expensive debt.
  return list.sort((a, b) => {
    const ca = effectiveAnnualCost(a);
    const cb = effectiveAnnualCost(b);
    if (ca === null && cb === null) return bal(a).cmp(bal(b));
    if (ca === null) return -1;
    if (cb === null) return 1;
    return cb.cmp(ca) || bal(a).cmp(bal(b));
  });
}

export function simulate(input: SimulationInput): SimulationResult {
  const maxMonths = input.maxMonths ?? 360;
  const warnings = new Set<string>();
  const assumptions = new Set<string>([
    "Interest is accrued on the opening balance each month and payments are applied at month end (interest first, then principal).",
    "Amounts are rounded to the nearest paisa (half-up) every month.",
  ]);
  let isEstimate = false;

  const states: DebtState[] = input.debts
    .filter((d) => D(d.balance).gt(0))
    .map((d) => ({
      debt: { ...d },
      balance: round2(d.balance),
      closed: false,
      totalInterest: ZERO,
      totalCharges: ZERO,
      totalPaid: ZERO,
      closureIndex: null,
      interestEstimated: false,
    }));

  for (const s of states) {
    if (!hasKnownRate(s.debt)) {
      isEstimate = true;
      warnings.add(`${s.debt.name}: interest rate not configured — interest is excluded, so projections for this debt are an estimate.`);
    }
    if (s.debt.method === "flat") {
      assumptions.add(`${s.debt.name}: flat-rate interest is charged on the original principal every month until closure; confirm the lender's prepayment rebate rules.`);
      isEstimate = true;
    }
    if (s.debt.kind === "card" && (s.debt.minimumPayment === null || s.debt.minimumPayment === undefined || s.debt.minimumPayment === "")) {
      assumptions.add(`${s.debt.name}: minimum due not configured — estimated at 5% of dues (minimum ₹200).`);
    }
    if (s.debt.kind === "loan" && (!s.debt.emi || D(s.debt.emi).lte(0))) {
      assumptions.add(`${s.debt.name}: no fixed EMI — the monthly interest is treated as the mandatory payment; principal is reduced only by extra payments.`);
    }
    if (s.debt.convention === "daily_365") {
      assumptions.add(`${s.debt.name}: daily interest uses actual days in month / 365.`);
    }
  }

  const events = input.events ?? [];
  let income = D(input.monthlyIncome);
  let expenses = D(input.monthlyExpenses);
  const plannedSavings = maxD(D(input.plannedSavings), ZERO);
  const target = input.savingsTarget !== null && input.savingsTarget !== undefined ? D(input.savingsTarget) : null;
  const extraMonthly = D(input.extraMonthlyPayment);
  let savings = D(input.currentSavings);
  const startDebt = states.reduce((a, s) => a.plus(s.balance), ZERO);

  const months: SimMonth[] = [];
  let debtFreeIndex: number | null = states.length === 0 ? -1 : null;
  let totalShortfall = ZERO;
  let firstOrder: string[] = [];

  for (let i = 0; i < maxMonths && debtFreeIndex === null; i++) {
    const month = addMonths(input.startMonth, i);
    const monthEvents = events.filter((e) => e.month === month);

    for (const e of monthEvents) {
      if (e.type === "income_change") income = D(e.amount);
      if (e.type === "expense_change") expenses = D(e.amount);
      if (e.type === "rate_change") {
        const s = states.find((x) => x.debt.key === e.debtKey);
        if (s) s.debt.rate = e.rate;
      }
    }

    // Savings contribution
    let contribution = plannedSavings;
    if (input.stopSavingsAtTarget && target !== null) {
      contribution = minD(contribution, maxD(target.minus(savings), ZERO));
    }
    contribution = round2(contribution);
    savings = savings.plus(contribution);

    const bonus = monthEvents
      .filter((e): e is Extract<SimEvent, { type: "bonus" }> => e.type === "bonus")
      .reduce((a, e) => a.plus(D(e.amount)), ZERO);

    let pool = round2(income.minus(expenses).minus(contribution).plus(extraMonthly).plus(bonus));
    const repaymentPool = pool;
    let drawnFromSavings = ZERO;
    let shortfall = ZERO;

    const active = states.filter((s) => !s.closed);
    const openingDebt = active.reduce((a, s) => a.plus(s.balance), ZERO);

    // 1. Accrue interest and charges
    const rows = new Map<string, { opening: Money; interest: Money; charges: Money; due: Money; minPaid: Money; extraPaid: Money; prepayCharges: Money; balancePaid: Money }>();
    for (const s of active) {
      const opening = s.balance;
      const interestRaw = monthlyInterest(s.debt, opening, month);
      if (interestRaw === null) s.interestEstimated = true;
      const interest = interestRaw ?? ZERO;
      const charges = round2(D(s.debt.monthlyCharges));
      rows.set(s.debt.key, {
        opening,
        interest,
        charges,
        due: opening.plus(interest).plus(charges),
        minPaid: ZERO,
        extraPaid: ZERO,
        prepayCharges: ZERO,
        balancePaid: ZERO,
      });
      if (s.debt.kind === "loan" && s.debt.emi && D(s.debt.emi).gt(0) && D(s.debt.emi).lt(interest)) {
        warnings.add(`${s.debt.name}: EMI is lower than the monthly interest — the balance grows (negative amortisation).`);
      }
    }

    // 2. Mandatory minimum payments
    let totalMin = ZERO;
    for (const s of active) {
      const r = rows.get(s.debt.key)!;
      const min = contractualMinimum(s.debt, r.interest, r.charges, r.due);
      if (min.estimated) isEstimate = true;
      r.minPaid = min.amount;
      r.balancePaid = min.amount;
      totalMin = totalMin.plus(min.amount);
    }
    if (input.minimumsFunded) {
      // minimums paid from outside the pool
    } else if (pool.gte(totalMin)) {
      pool = pool.minus(totalMin);
    } else {
      const deficit = totalMin.minus(pool);
      drawnFromSavings = minD(maxD(savings, ZERO), deficit);
      savings = savings.minus(drawnFromSavings);
      shortfall = deficit.minus(drawnFromSavings);
      totalShortfall = totalShortfall.plus(shortfall);
      pool = ZERO;
      if (shortfall.gt(0)) warnings.add(`Mandatory payments exceed available cash in ${month} — shortfall of ₹${toNum(shortfall).toLocaleString("en-IN")}.`);
    }

    const payExtra = (s: DebtState, amount: Money): Money => {
      const r = rows.get(s.debt.key)!;
      const remaining = r.due.minus(r.balancePaid);
      if (remaining.lte(0) || amount.lte(0)) return ZERO;
      const pct = D(s.debt.prepaymentChargePct).div(100);
      const costToClear = round2(remaining.mul(pct.plus(1)));
      const spend = minD(amount, costToClear);
      const toBalance = spend.gte(costToClear) ? remaining : round2(spend.div(pct.plus(1)));
      const charge = round2(spend.minus(toBalance));
      r.extraPaid = r.extraPaid.plus(spend);
      r.prepayCharges = r.prepayCharges.plus(charge);
      r.balancePaid = r.balancePaid.plus(toBalance);
      return spend;
    };

    // 3. Earmarked lump sums and settlements
    for (const e of monthEvents) {
      if (e.type !== "lump_sum" && e.type !== "settle") continue;
      const s = active.find((x) => x.debt.key === e.debtKey);
      if (!s) continue;
      const r = rows.get(s.debt.key)!;
      const pct = D(s.debt.prepaymentChargePct).div(100);
      const want = e.type === "settle" ? round2(r.due.minus(r.balancePaid).mul(pct.plus(1))) : D(e.amount);
      if (want.lte(0)) continue;
      let funded = want;
      if (e.source === "savings") {
        funded = minD(want, maxD(savings, ZERO));
        savings = savings.minus(funded);
        if (funded.lt(want)) warnings.add(`${month}: savings were insufficient for the planned payment to ${s.debt.name}.`);
      }
      const spent = payExtra(s, funded);
      const unused = funded.minus(spent);
      if (unused.gt(0)) {
        if (e.source === "savings") savings = savings.plus(unused);
        else pool = pool.plus(unused); // leftover external cash joins the pool
      }
    }

    // 4. Allocate extra cash by strategy
    const balancesNow: Record<string, Money> = {};
    for (const s of active) balancesNow[s.debt.key] = s.balance;
    const order = orderDebts(active.map((s) => s.debt), input.strategy, input.priorityOrder, balancesNow);
    if (i === 0) firstOrder = order.map((d) => d.key);
    for (const d of order) {
      if (pool.lte(0)) break;
      const s = active.find((x) => x.debt.key === d.key)!;
      if (s.debt.prepaymentAllowed === false) continue;
      pool = pool.minus(payExtra(s, pool));
    }

    const surplus = pool.gt(0) ? pool : ZERO;
    savings = savings.plus(surplus);

    // 5. Close the month: opening + interest + charges − payments = closing
    const debtRows: Record<string, DebtMonth> = {};
    let mInterest = ZERO;
    let mCharges = ZERO;
    let mMandatory = ZERO;
    let mExtra = ZERO;
    let mPrincipal = ZERO;
    for (const s of active) {
      const r = rows.get(s.debt.key)!;
      let closing = round2(r.due.minus(r.balancePaid));
      if (isEffectivelyZero(closing) || closing.lt(0)) closing = ZERO;
      const allCharges = r.charges.plus(r.prepayCharges);
      const paid = r.minPaid.plus(r.extraPaid);
      const principalPaid = round2(r.opening.minus(closing));
      s.balance = closing;
      s.totalInterest = s.totalInterest.plus(r.interest);
      s.totalCharges = s.totalCharges.plus(allCharges);
      s.totalPaid = s.totalPaid.plus(paid);
      const closedNow = closing.isZero();
      if (closedNow) {
        s.closed = true;
        s.closureIndex = i;
      }
      mInterest = mInterest.plus(r.interest);
      mCharges = mCharges.plus(allCharges);
      mMandatory = mMandatory.plus(r.minPaid);
      mExtra = mExtra.plus(r.extraPaid);
      mPrincipal = mPrincipal.plus(principalPaid);
      debtRows[s.debt.key] = {
        key: s.debt.key,
        opening: toNum(r.opening),
        interest: toNum(r.interest),
        charges: toNum(allCharges),
        minimumPaid: toNum(r.minPaid),
        extraPaid: toNum(r.extraPaid),
        prepaymentCharges: toNum(r.prepayCharges),
        totalPaid: toNum(paid),
        principalPaid: toNum(principalPaid),
        closing: toNum(closing),
        closedThisMonth: closedNow,
      };
    }
    const closingDebt = states.reduce((a, s) => a.plus(s.closed ? ZERO : s.balance), ZERO);

    months.push({
      index: i,
      month,
      income: toNum(income),
      expenses: toNum(expenses),
      savingsContribution: toNum(contribution),
      savingsBalance: toNum(savings),
      bonus: toNum(bonus),
      repaymentPool: toNum(repaymentPool),
      mandatoryPaid: toNum(mMandatory),
      extraPaid: toNum(mExtra),
      totalPaid: toNum(mMandatory.plus(mExtra)),
      interest: toNum(mInterest),
      charges: toNum(mCharges),
      principalPaid: toNum(mPrincipal),
      surplusToSavings: toNum(surplus),
      drawnFromSavings: toNum(drawnFromSavings),
      shortfall: toNum(shortfall),
      openingDebt: toNum(openingDebt),
      closingDebt: toNum(closingDebt),
      debts: debtRows,
    });

    if (states.every((s) => s.closed)) debtFreeIndex = i;
  }

  if (debtFreeIndex === null) {
    warnings.add(`Debts are not fully repaid within ${maxMonths} months at the current repayment capacity.`);
  }

  const totalInterest = states.reduce((a, s) => a.plus(s.totalInterest), ZERO);
  const totalCharges = states.reduce((a, s) => a.plus(s.totalCharges), ZERO);
  const totalPaid = states.reduce((a, s) => a.plus(s.totalPaid), ZERO);

  return {
    strategy: input.strategy,
    order: firstOrder,
    months,
    debts: states.map((s) => ({
      key: s.debt.key,
      name: s.debt.name,
      kind: s.debt.kind,
      startBalance: toNum(input.debts.find((d) => d.key === s.debt.key)!.balance),
      totalInterest: toNum(s.totalInterest),
      totalCharges: toNum(s.totalCharges),
      totalPaid: toNum(s.totalPaid),
      closureMonth: s.closureIndex === null ? null : addMonths(input.startMonth, s.closureIndex),
      monthsToClose: s.closureIndex === null ? null : s.closureIndex + 1,
      interestEstimated: s.interestEstimated,
    })),
    totalInterest: toNum(totalInterest),
    totalCharges: toNum(totalCharges),
    totalPaid: toNum(totalPaid),
    startDebt: toNum(startDebt),
    debtFreeMonth: debtFreeIndex === null ? null : debtFreeIndex < 0 ? input.startMonth : addMonths(input.startMonth, debtFreeIndex),
    monthsToDebtFree: debtFreeIndex === null ? null : debtFreeIndex + 1,
    finalSavings: toNum(savings),
    totalShortfall: toNum(totalShortfall),
    firstMonthPool: months[0]?.repaymentPool ?? 0,
    firstMonthMandatory: months[0]?.mandatoryPaid ?? 0,
    warnings: [...warnings],
    assumptions: [...assumptions],
    isEstimate,
  };
}

export interface StrategyComparison {
  results: Record<Strategy, SimulationResult>;
  best: Strategy;
  fastest: Strategy;
}

/** Run all three strategies on identical inputs. */
export function compareStrategies(input: Omit<SimulationInput, "strategy">): StrategyComparison {
  const results = {
    priority: simulate({ ...input, strategy: "priority" }),
    avalanche: simulate({ ...input, strategy: "avalanche" }),
    snowball: simulate({ ...input, strategy: "snowball" }),
  } satisfies Record<Strategy, SimulationResult>;
  const keys = Object.keys(results) as Strategy[];
  const months = (s: Strategy) => results[s].monthsToDebtFree ?? Number.MAX_SAFE_INTEGER;
  const best = keys.reduce((a, b) => (results[b].totalInterest + results[b].totalCharges < results[a].totalInterest + results[a].totalCharges - 0.005 ? b : a));
  const fastest = keys.reduce((a, b) => (months(b) < months(a) ? b : a));
  return { results, best, fastest };
}
