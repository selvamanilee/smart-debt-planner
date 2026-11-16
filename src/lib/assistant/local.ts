import { addMonths, formatMonth, monthDiff } from "@/lib/finance/dates";
import { simulate, compareStrategies, STRATEGY_LABELS, type SimulationInput, type SimulationResult } from "@/lib/finance/simulate";
import { analyzeGoal, applyOverrides, type ScenarioOverrides } from "@/lib/finance/analysis";
import { effectiveAnnualCost, hasKnownRate } from "@/lib/finance/debt";

export interface AssistantContext {
  input: SimulationInput;
  totalIncome: number;
  plannedExpenses: number;
  plannedSavings: number;
  mandatory: number;
  availableForDebt: number;
  remainingForExtra: number;
  discretionaryBudget: number;
  goalMonth: string | null;
  /** Projection recorded at the last closed month / saved plan, for "why did it change". */
  previous: { label: string; debtFreeMonth: string | null; totalInterest: number | null; totalDebt?: number } | null;
}

export interface Sections {
  status: string;
  problem: string;
  action: string;
  monthlyImpact: string;
  interestSavings: string;
  debtFreeImpact: string;
  risks: string;
  nextStep: string;
  table?: { columns: string[]; rows: string[][] };
}

const inr = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : `₹${Math.round(n).toLocaleString("en-IN")}`;
const m = (k: string | null | undefined) => (k ? formatMonth(k, true) : "not within 30 years");

/** Parse amounts like "₹10,000", "10k", "1.5 lakh", "50000". Returns the first match. */
export function parseAmount(text: string): number | null {
  const re = /(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|l|lakh|lakhs|lac|cr|crore)?\b/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const raw = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(raw)) continue;
    const unit = (match[2] ?? "").toLowerCase();
    const mult = unit === "k" || unit === "thousand" ? 1e3 : unit.startsWith("l") ? 1e5 : unit.startsWith("cr") ? 1e7 : 1;
    const value = raw * mult;
    // Skip bare years / small counts that are clearly not money ("2 years", "2028").
    if (mult === 1 && (value < 100 || (value >= 1900 && value <= 2100 && !/[₹,]|rs/i.test(match[0])))) continue;
    return value;
  }
  return null;
}

function parseHorizon(text: string, start: string): string | null {
  const t = text.toLowerCase();
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const byDate = t.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})/);
  if (byDate) return `${byDate[2]}-${String(months.indexOf(byDate[1]) + 1).padStart(2, "0")}`;
  const byYear = t.match(/\bby\s+(\d{4})\b/);
  if (byYear) return `${byYear[1]}-12`;
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, a: 1 };
  const span = t.match(/(?:within|in)\s+(\d+|one|two|three|four|five|six|a)\s+(year|month)/);
  if (span) {
    const n = Number(span[1]) || words[span[1]] || 1;
    return addMonths(start, (span[2] === "year" ? n * 12 : n) - 1);
  }
  return null;
}

function scheduleTable(r: SimulationResult, n: number) {
  return {
    columns: ["Month", ...r.debts.map((d) => d.name), "Interest", "Closing debt"],
    rows: r.months.slice(0, n).map((mo) => [
      formatMonth(mo.month),
      ...r.debts.map((d) => (mo.debts[d.key] ? inr(mo.debts[d.key].totalPaid) : "closed")),
      inr(mo.interest),
      inr(mo.closingDebt),
    ]),
  };
}

function risksFor(r: SimulationResult, extra = ""): string {
  const parts = [...r.warnings];
  if (r.isEstimate && !parts.length) parts.push("Some values (minimum dues or flat-rate conventions) are estimates.");
  parts.push("Assumes income, expenses and EMIs stay as entered and every payment is made on time.");
  if (extra) parts.push(extra);
  return parts.join(" ");
}

function whatIf(ctx: AssistantContext, o: ScenarioOverrides, label: string): Sections {
  const base = simulate(ctx.input);
  const next = simulate(applyOverrides(ctx.input, o));
  const dm = base.monthsToDebtFree !== null && next.monthsToDebtFree !== null ? base.monthsToDebtFree - next.monthsToDebtFree : null;
  const saved = base.totalInterest - next.totalInterest;
  return {
    status: `Today you are on track to be debt-free in ${m(base.debtFreeMonth)} paying ${inr(base.totalInterest)} in interest.`,
    problem: `You asked: ${label}.`,
    action: next.debtFreeMonth
      ? `Put the full difference toward debt using ${STRATEGY_LABELS[next.strategy]}: next extra payments go to ${next.order.map((k) => next.debts.find((d) => d.key === k)?.name).slice(0, 2).join(", then ")}.`
      : "Even with this change the debts would not be repaid — larger changes are needed.",
    monthlyImpact: `Month-1 repayment pool changes from ${inr(base.firstMonthPool)} to ${inr(next.firstMonthPool)}.`,
    interestSavings: saved >= 0 ? `About ${inr(saved)} less interest overall.` : `About ${inr(-saved)} more interest overall.`,
    debtFreeImpact: `Debt-free date moves from ${m(base.debtFreeMonth)} to ${m(next.debtFreeMonth)}${dm ? ` (${dm > 0 ? `${dm} months earlier` : `${-dm} months later`})` : ""}.`,
    risks: risksFor(next),
    nextStep: "If you want to keep this scenario, open the Repayment Planner, apply the same change and save it as a scenario.",
  };
}

/**
 * Deterministic, rule-based assistant. Every number comes from the calculation engine;
 * nothing is invented. Used when AI is disabled, unconfigured, or not consented.
 */
export function answerLocally(question: string, ctx: AssistantContext): Sections {
  const q = question.toLowerCase();
  const amount = parseAmount(question);
  const start = ctx.input.startMonth;
  const base = simulate(ctx.input);
  const statusLine = `Income ${inr(ctx.totalIncome)}, expenses ${inr(ctx.plannedExpenses)}, mandatory EMIs/minimums ${inr(ctx.mandatory)}, planned savings ${inr(ctx.plannedSavings)}. Total debt ${inr(base.startDebt)}; projected debt-free ${m(base.debtFreeMonth)}.`;

  // What-if: salary / income increase
  if (/(salary|income|hike|raise|increment)/.test(q) && /(increase|raise|hike|more|up|grow|extra|rise)/.test(q) && !/how much|need|required/.test(q)) {
    const inc = amount ?? 10000;
    return whatIf(ctx, { monthlyIncome: ctx.totalIncome + inc, extraMonthlyPayment: Number(ctx.input.extraMonthlyPayment ?? 0) }, `income increases by ${inr(inc)} per month`);
  }
  // What-if: reduce expenses
  if (/(reduce|cut|lower|decrease|save)/.test(q) && /(expense|spend|cost)/.test(q)) {
    const cut = amount ?? 2000;
    return whatIf(ctx, { monthlyExpenses: Math.max(0, ctx.plannedExpenses - cut) }, `expenses fall by ${inr(cut)} per month`);
  }
  // What-if: bonus / lump sum
  if (/(bonus|windfall|lump|one[- ]time|gift|arrear)/.test(q)) {
    const b = amount ?? 50000;
    const month = addMonths(start, 1);
    const s = whatIf(ctx, { events: [{ type: "bonus", month, amount: b }] }, `a one-time ${inr(b)} in ${formatMonth(month, true)} goes to debt`);
    const target = base.order[0] ? base.debts.find((d) => d.key === base.order[0])?.name : null;
    s.action = `Apply the full ${inr(b)} to ${target ?? "your highest-priority debt"} (first in your current order) as soon as it arrives.`;
    return s;
  }
  // Goal / timeline / extra income required
  const horizon = parseHorizon(q, start) ?? (/(extra income|additional income|more income|need to earn)/.test(q) ? ctx.goalMonth ?? addMonths(start, 23) : null);
  if (horizon || /(close all|debt[- ]free by|achievable|possible|can i close)/.test(q)) {
    const target = horizon ?? ctx.goalMonth ?? addMonths(start, 23);
    const g = analyzeGoal(ctx.input, target, ctx.discretionaryBudget);
    const impossible = Number.isNaN(g.monthlyShortfall);
    return {
      status: statusLine,
      problem: g.achievable ? `Target ${m(target)} is achievable — current plan finishes ${m(g.currentDebtFreeMonth)}.` : `Target ${m(target)} is ${impossible ? "not reachable" : "not achievable"} at your current capacity of ${inr(g.currentCapacity)} per month for debt.`,
      action: g.achievable
        ? "Keep the current plan. Any extra amount will only bring the date further forward."
        : impossible
          ? "Choose a later target; see the alternatives below."
          : `Find ${inr(g.monthlyShortfall)} more per month for debt — ${g.coveredByExpenseCuts ? `this could come from cutting discretionary spending (${inr(g.potentialExpenseReduction)} budgeted)` : `cutting all discretionary spending (${inr(g.potentialExpenseReduction)}) is not enough, so extra income is needed`}.`,
      monthlyImpact: g.achievable ? "No change needed." : impossible ? "—" : `Required average debt payment ${inr(g.requiredMonthlyRepayment)} per month; additional income required ${inr(g.additionalIncomeRequired)}.`,
      interestSavings: g.requiredResult && !g.achievable ? `Hitting the target would cost ${inr(g.requiredResult.totalInterest)} interest vs ${inr(base.totalInterest)} on the current plan (saves ${inr(base.totalInterest - g.requiredResult.totalInterest)}).` : `Current plan interest: ${inr(base.totalInterest)}.`,
      debtFreeImpact: g.alternatives.map((a) => `${a.label}: ${m(a.debtFreeMonth)}`).join(" · "),
      risks: risksFor(base, g.explanation.join(" ")),
      nextStep: "Save this target on the Debt-Free Goal page to track progress every month.",
    };
  }
  // Next N months schedule
  const nm = q.match(/next\s+(\d+|six|three|twelve|twelve)\s+months|schedule|upcoming payments/);
  if (nm) {
    const words: Record<string, number> = { six: 6, three: 3, twelve: 12 };
    const n = Math.min(24, Number(nm[1]) || words[nm[1] as string] || 6);
    return {
      status: statusLine,
      problem: `Here are the next ${n} months of repayments under ${STRATEGY_LABELS[base.strategy]}.`,
      action: `Pay all EMIs and minimums first, then send the surplus as shown (first to ${base.debts.find((d) => d.key === base.order[0])?.name ?? "the top-priority debt"}).`,
      monthlyImpact: `Total debt payments over ${n} months: ${inr(base.months.slice(0, n).reduce((a, x) => a + x.totalPaid, 0))}.`,
      interestSavings: `Interest over these ${n} months: ${inr(base.months.slice(0, n).reduce((a, x) => a + x.interest, 0))}.`,
      debtFreeImpact: `Projected debt-free ${m(base.debtFreeMonth)}.`,
      risks: risksFor(base),
      nextStep: "Record each payment on My Loans / Credit Cards once it is actually made.",
      table: scheduleTable(base, n),
    };
  }
  // Why has the date changed?
  if (/(why|reason).*(chang|move|shift|later|earlier)|date changed/.test(q)) {
    const prev = ctx.previous;
    if (!prev) {
      return {
        status: statusLine,
        problem: "There is no earlier saved projection to compare against yet.",
        action: "Close a month in Monthly Review or save a repayment plan — future answers can then explain changes.",
        monthlyImpact: "—",
        interestSavings: "—",
        debtFreeImpact: `Current projection: ${m(base.debtFreeMonth)}.`,
        risks: risksFor(base),
        nextStep: "Use Monthly Review at the start of each month.",
      };
    }
    const diff = prev.debtFreeMonth && base.debtFreeMonth ? monthDiff(prev.debtFreeMonth, base.debtFreeMonth) : null;
    return {
      status: statusLine,
      problem: `${prev.label} projected ${m(prev.debtFreeMonth)}${prev.totalInterest !== null ? ` with ${inr(prev.totalInterest)} interest` : ""}; now it is ${m(base.debtFreeMonth)} with ${inr(base.totalInterest)}.`,
      action:
        diff === null || diff === 0
          ? "The date is unchanged."
          : diff > 0
            ? "The date moved later. Typical causes: lower income or higher expenses entered, a missed or smaller payment, a higher balance after reconciliation, a higher rate, or a strategy change. Compare Monthly Review planned vs actual to find which."
            : "The date moved earlier — you paid more than planned, reduced expenses, increased income, or a balance was lower after reconciliation.",
      monthlyImpact: `Current repayment pool ${inr(base.firstMonthPool)} per month.`,
      interestSavings: prev.totalInterest !== null ? `Projected interest changed by ${inr(base.totalInterest - prev.totalInterest)}.` : "—",
      debtFreeImpact: diff === null ? "—" : diff === 0 ? "No change." : `${Math.abs(diff)} months ${diff > 0 ? "later" : "earlier"}.`,
      risks: risksFor(base),
      nextStep: "Review the latest month in Monthly Review and the audit history in Settings.",
    };
  }
  // Strategy / which loan first
  if (/(which|what).*(loan|debt|card).*(first|close|pay)|strategy|avalanche|snowball|save.*most|priority|order/.test(q)) {
    const c = compareStrategies(ctx.input);
    const best = c.results[c.best];
    const mine = c.results.priority;
    const ranked = [...ctx.input.debts].sort((a, b) => (effectiveAnnualCost(b)?.toNumber() ?? 1e9) - (effectiveAnnualCost(a)?.toNumber() ?? 1e9));
    const unknown = ctx.input.debts.filter((d) => !hasKnownRate(d)).map((d) => d.name);
    return {
      status: statusLine,
      problem: `Your priority order costs ${inr(mine.totalInterest)} in interest; ${STRATEGY_LABELS[c.best]} costs ${inr(best.totalInterest)}.`,
      action: `Pay extra to: ${best.order.map((k, i) => `${i + 1}. ${best.debts.find((d) => d.key === k)?.name}`).join(", ")}. Highest effective cost first: ${ranked.map((d) => `${d.name} (${effectiveAnnualCost(d) ? `${effectiveAnnualCost(d)!.toFixed(1)}%` : "rate unknown"})`).join(", ")}.`,
      monthlyImpact: "Same monthly budget — only the order changes.",
      interestSavings: `${STRATEGY_LABELS[c.best]} saves ${inr(mine.totalInterest - best.totalInterest)} vs your priority order and ${inr(c.results.snowball.totalInterest - best.totalInterest)} vs snowball.`,
      debtFreeImpact: `My Priority: ${m(mine.debtFreeMonth)} · Avalanche: ${m(c.results.avalanche.debtFreeMonth)} · Snowball: ${m(c.results.snowball.debtFreeMonth)}.`,
      risks: risksFor(best, unknown.length ? `${unknown.join(", ")} has no configured rate, so it is ranked first as a precaution — enter the real rate for an accurate ranking.` : ""),
      nextStep: "Switch strategy or reorder priorities in the Repayment Planner and save as default.",
    };
  }
  // Interest
  if (/interest/.test(q)) {
    const first = base.months[0];
    const rows = base.debts.map((d) => [d.name, inr(first?.debts[d.key]?.interest ?? 0), inr(d.totalInterest), d.interestEstimated ? "rate unknown" : "ok"]);
    return {
      status: statusLine,
      problem: `You pay about ${inr(first?.interest ?? 0)} interest this month and ${inr(base.totalInterest)} in total under the current plan.`,
      action: "Target the most expensive debt with any extra cash (see strategy comparison).",
      monthlyImpact: `Interest is ${ctx.totalIncome ? Math.round(((first?.interest ?? 0) / ctx.totalIncome) * 100) : 0}% of your monthly income.`,
      interestSavings: `Use the planner to test extra payments; every rupee of principal repaid on the friend loan saves 3% per month.`,
      debtFreeImpact: `Projected debt-free ${m(base.debtFreeMonth)}.`,
      risks: risksFor(base),
      nextStep: "Enter any missing interest rates so the totals are complete.",
      table: { columns: ["Debt", "This month", "Total (plan)", "Note"], rows },
    };
  }
  // How much can I pay this month (default)
  return {
    status: statusLine,
    problem:
      ctx.remainingForExtra < 0
        ? `Mandatory payments exceed available cash by ${inr(-ctx.remainingForExtra)} this month.`
        : `After expenses, savings and all EMIs you have ${inr(ctx.remainingForExtra)} left for extra repayment.`,
    action:
      ctx.remainingForExtra > 0
        ? `Pay ${inr(ctx.availableForDebt)} toward debt this month: ${inr(ctx.mandatory)} in EMIs/minimums and ${inr(ctx.remainingForExtra)} extra to ${base.debts.find((d) => d.key === base.order[0])?.name ?? "your top-priority debt"}.`
        : "Cover the mandatory payments first; reduce discretionary spending or pause savings to close the gap.",
    monthlyImpact: `Total available for debt: ${inr(ctx.availableForDebt)}.`,
    interestSavings: `Following the plan costs ${inr(base.totalInterest)} interest in total.`,
    debtFreeImpact: `Projected debt-free ${m(base.debtFreeMonth)}.`,
    risks: risksFor(base),
    nextStep: "Record the payments once made, then check the dashboard.",
    table: scheduleTable(base, 1),
  };
}

export function sectionsToMarkdown(s: Sections): string {
  const parts = [
    `## Current financial status\n${s.status}`,
    `## Problem identified\n${s.problem}`,
    `## Suggested action\n${s.action}`,
    `## Monthly financial impact\n${s.monthlyImpact}`,
    `## Estimated interest savings\n${s.interestSavings}`,
    `## Debt-free date impact\n${s.debtFreeImpact}`,
    `## Risks and assumptions\n${s.risks}`,
    `## Recommended next step\n${s.nextStep}`,
  ];
  if (s.table) {
    const t = s.table;
    parts.splice(3, 0, [`| ${t.columns.join(" | ")} |`, `| ${t.columns.map(() => "---").join(" | ")} |`, ...t.rows.map((r) => `| ${r.join(" | ")} |`)].join("\n"));
  }
  return parts.join("\n\n");
}
