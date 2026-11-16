import { D, MoneyInput, toNum } from "./money";
import { addMonths, monthDiff } from "./dates";
import { DebtInput } from "./debt";
import { SimEvent, SimulationInput, SimulationResult, Strategy, compareStrategies, simulate } from "./simulate";

/* ------------------------------------------------------------------ */
/* Single-debt schedule & extra payment impact                         */
/* ------------------------------------------------------------------ */

export interface ScheduleOptions {
  startMonth: string;
  extraMonthly?: MoneyInput;
  lumpSums?: { month: string; amount: MoneyInput }[];
  maxMonths?: number;
}

/** Repayment schedule for one debt paying the contractual minimum plus optional extras. */
export function debtSchedule(debt: DebtInput, opts: ScheduleOptions): SimulationResult {
  const extra = D(opts.extraMonthly);
  return simulate({
    startMonth: opts.startMonth,
    debts: [debt],
    // Minimums are funded outside the pool; the pool carries only the extra payment.
    minimumsFunded: true,
    monthlyIncome: 0,
    monthlyExpenses: 0,
    plannedSavings: 0,
    currentSavings: 0,
    extraMonthlyPayment: extra,
    strategy: "priority",
    priorityOrder: [debt.key],
    events: (opts.lumpSums ?? []).map((l) => ({ type: "lump_sum", month: l.month, amount: l.amount, debtKey: debt.key, source: "external" }) as SimEvent),
    maxMonths: opts.maxMonths ?? 600,
  });
}

export interface ExtraPaymentImpact {
  base: { months: number | null; interest: number; closure: string | null; totalPaid: number };
  withExtra: { months: number | null; interest: number; closure: string | null; totalPaid: number };
  interestSaved: number | null;
  monthsSaved: number | null;
}

export function extraPaymentImpact(debt: DebtInput, opts: ScheduleOptions): ExtraPaymentImpact {
  const base = debtSchedule(debt, { startMonth: opts.startMonth, maxMonths: opts.maxMonths });
  const withExtra = debtSchedule(debt, opts);
  const summary = (r: SimulationResult) => ({
    months: r.monthsToDebtFree,
    interest: r.totalInterest + r.totalCharges,
    closure: r.debtFreeMonth,
    totalPaid: r.totalPaid,
  });
  const b = summary(base);
  const w = summary(withExtra);
  return {
    base: b,
    withExtra: w,
    interestSaved: b.months === null ? null : toNum(D(b.interest).minus(w.interest)),
    monthsSaved: b.months === null || w.months === null ? null : b.months - w.months,
  };
}

/* ------------------------------------------------------------------ */
/* Debt-free goal                                                       */
/* ------------------------------------------------------------------ */

export interface GoalAnalysis {
  targetMonth: string;
  achievable: boolean;
  currentDebtFreeMonth: string | null;
  currentMonthsToDebtFree: number | null;
  monthsAvailable: number;
  /** Current monthly cash available for all debt payments (mandatory + extra). */
  currentCapacity: number;
  /** Extra monthly cash needed beyond current capacity to hit the target (0 if achievable). */
  monthlyShortfall: number;
  /** Total monthly debt payment required to hit the target. */
  requiredMonthlyRepayment: number;
  additionalIncomeRequired: number;
  /** Discretionary expense budget that could be cut (non-essential categories). */
  potentialExpenseReduction: number;
  coveredByExpenseCuts: boolean;
  alternatives: { label: string; extraMonthly: number; debtFreeMonth: string | null; months: number | null }[];
  explanation: string[];
  requiredResult: SimulationResult | null;
}

export function analyzeGoal(input: SimulationInput, targetMonth: string, discretionaryBudget: MoneyInput = 0): GoalAnalysis {
  const current = simulate(input);
  const monthsAvailable = monthDiff(input.startMonth, targetMonth) + 1;
  const currentCapacity = current.firstMonthPool;
  const baseExtra = D(input.extraMonthlyPayment);
  const explanation: string[] = [];

  const meetsTarget = (r: SimulationResult) => r.debtFreeMonth !== null && monthDiff(r.debtFreeMonth, targetMonth) >= 0;
  const withExtra = (x: number) => simulate({ ...input, extraMonthlyPayment: baseExtra.plus(x) });

  let requiredExtra = 0;
  let requiredResult: SimulationResult | null = current;
  let possible = true;

  if (monthsAvailable <= 0) {
    possible = false;
    requiredResult = null;
    explanation.push("The target month is before the planning start month.");
  } else if (!meetsTarget(current)) {
    // Upper bound: enough to clear everything in month 1.
    let hi = Math.max(1000, Math.ceil(current.startDebt * 1.5));
    if (!meetsTarget(withExtra(hi))) {
      possible = false;
      requiredResult = null;
    } else {
      let lo = 0;
      while (hi - lo > 100) {
        const mid = Math.floor((lo + hi) / 2);
        if (meetsTarget(withExtra(mid))) hi = mid;
        else lo = mid;
      }
      requiredExtra = Math.ceil(hi / 100) * 100;
      requiredResult = withExtra(requiredExtra);
    }
  }

  const avgPayment = (r: SimulationResult | null) => {
    if (!r || r.months.length === 0) return 0;
    const months = r.months.slice(0, Math.max(1, monthsAvailable));
    return toNum(months.reduce((a, m) => a.plus(m.totalPaid), D(0)).div(months.length));
  };

  const discretionary = toNum(discretionaryBudget);
  const achievableNow = meetsTarget(current);

  if (achievableNow) {
    explanation.push(`At your current repayment capacity you become debt-free in ${current.debtFreeMonth}, which meets the target.`);
  } else if (possible) {
    explanation.push(`Your current plan finishes ${current.debtFreeMonth ?? "beyond the 30-year horizon"}, which misses the target.`);
    explanation.push(`You need about ₹${requiredExtra.toLocaleString("en-IN")} more per month for debt repayment to finish by the target.`);
    if (discretionary >= requiredExtra) explanation.push("This gap could be closed by cutting discretionary (non-essential) expenses.");
    else explanation.push(`Cutting all discretionary spending (₹${discretionary.toLocaleString("en-IN")}/month) would not be enough on its own — extra income is also needed.`);
  } else if (monthsAvailable > 0) {
    explanation.push("The target cannot be reached even with a very large increase in monthly payments (e.g. a debt cannot be prepaid, or the target is too close).");
  }

  const alternatives = [0, 5000, 10000, 20000].map((x) => {
    const r = x === 0 ? current : withExtra(x);
    return { label: x === 0 ? "Current plan" : `+₹${x.toLocaleString("en-IN")}/month`, extraMonthly: x, debtFreeMonth: r.debtFreeMonth, months: r.monthsToDebtFree };
  });

  return {
    targetMonth,
    achievable: achievableNow,
    currentDebtFreeMonth: current.debtFreeMonth,
    currentMonthsToDebtFree: current.monthsToDebtFree,
    monthsAvailable,
    currentCapacity,
    monthlyShortfall: achievableNow ? 0 : possible ? requiredExtra : Number.NaN,
    requiredMonthlyRepayment: avgPayment(requiredResult),
    additionalIncomeRequired: achievableNow ? 0 : possible ? requiredExtra : Number.NaN,
    potentialExpenseReduction: discretionary,
    coveredByExpenseCuts: achievableNow || (possible && discretionary >= requiredExtra),
    alternatives,
    explanation,
    requiredResult,
  };
}

/* ------------------------------------------------------------------ */
/* Scenario presets                                                     */
/* ------------------------------------------------------------------ */

export interface ScenarioOverrides {
  monthlyIncome?: number;
  monthlyExpenses?: number;
  plannedSavings?: number;
  extraMonthlyPayment?: number;
  strategy?: Strategy;
  priorityOrder?: string[];
  events?: SimEvent[];
  /** Per-debt overrides keyed by debt key. */
  debtOverrides?: Record<string, { balance?: number; rate?: number | null; emi?: number | null }>;
}

export function applyOverrides(input: SimulationInput, o: ScenarioOverrides): SimulationInput {
  return {
    ...input,
    monthlyIncome: o.monthlyIncome ?? input.monthlyIncome,
    monthlyExpenses: o.monthlyExpenses ?? input.monthlyExpenses,
    plannedSavings: o.plannedSavings ?? input.plannedSavings,
    extraMonthlyPayment: o.extraMonthlyPayment ?? input.extraMonthlyPayment,
    strategy: o.strategy ?? input.strategy,
    priorityOrder: o.priorityOrder ?? input.priorityOrder,
    events: [...(input.events ?? []), ...(o.events ?? [])],
    debts: input.debts.map((d) => {
      const x = o.debtOverrides?.[d.key];
      if (!x) return d;
      return {
        ...d,
        balance: x.balance ?? d.balance,
        rate: x.rate === undefined ? d.rate : x.rate,
        emi: x.emi === undefined ? d.emi : x.emi,
      };
    }),
  };
}

export interface PresetScenario {
  id: "current" | "recommended" | "aggressive" | "conservative";
  name: string;
  description: string;
  overrides: ScenarioOverrides;
}

/** The four standard comparison scenarios, derived from the current inputs. */
export function presetScenarios(input: SimulationInput): PresetScenario[] {
  const cmp = compareStrategies(input);
  const best = cmp.best;
  const exp = D(input.monthlyExpenses);
  const savings = D(input.plannedSavings);
  return [
    { id: "current", name: "Current Plan", description: `Your saved settings using ${input.strategy === "priority" ? "your priority order" : input.strategy}.`, overrides: {} },
    { id: "recommended", name: "Recommended Plan", description: `Same budget, using the lowest-interest strategy (${best}).`, overrides: { strategy: best } },
    {
      id: "aggressive",
      name: "Aggressive Repayment",
      description: "Lowest-interest strategy, expenses cut 10%, savings contribution halved, everything else to debt.",
      overrides: { strategy: best, monthlyExpenses: toNum(exp.mul("0.9")), plannedSavings: toNum(savings.div(2)) },
    },
    {
      id: "conservative",
      name: "Conservative Repayment",
      description: "Your priority order with a 10% expense buffer and double savings contribution.",
      overrides: { strategy: "priority", monthlyExpenses: toNum(exp.mul("1.1")), plannedSavings: toNum(savings.mul(2)) },
    },
  ];
}

export function nextMonths(result: SimulationResult, n: number) {
  return result.months.slice(0, n);
}

export { addMonths };
