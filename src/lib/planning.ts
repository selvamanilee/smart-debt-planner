import "server-only";
import { compareStrategies, simulate, type Strategy } from "@/lib/finance/simulate";
import { effectiveAnnualCost, hasKnownRate } from "@/lib/finance/debt";
import { D } from "@/lib/finance/money";
import type { FinancialState } from "@/lib/data";

export function projectionFor(state: FinancialState, strategy?: Strategy) {
  return simulate({ ...state.simulationInput, strategy: strategy ?? state.simulationInput.strategy });
}

export function strategyComparison(state: FinancialState) {
  return compareStrategies(state.simulationInput);
}

/** Next calendar date for each configured payment day. */
export function upcomingPayments(state: FinancialState, today = new Date()) {
  const items: { name: string; date: Date; amount: number | null; kind: "loan" | "card" }[] = [];
  const nextDate = (day: number) => {
    const y = today.getFullYear();
    const m = today.getMonth();
    const clamp = (yy: number, mm: number) => Math.min(day, new Date(yy, mm + 1, 0).getDate());
    let d = new Date(y, m, clamp(y, m));
    if (d < new Date(y, m, today.getDate())) d = new Date(y, m + 1, clamp(y, m + 1));
    return d;
  };
  for (const l of state.loans.filter((x) => x.status === "active" && D(x.outstandingPrincipal).gt(0))) {
    if (l.paymentDay) {
      const m = state.cashFlow.mandatoryBreakdown.find((b) => b.key === `loan:${l.id}`);
      items.push({ name: l.name, date: nextDate(l.paymentDay), amount: m?.amount ?? null, kind: "loan" });
    }
  }
  for (const c of state.cards.filter((x) => x.status === "active" && D(x.outstandingBalance).gt(0))) {
    if (c.dueDay) {
      const m = state.cashFlow.mandatoryBreakdown.find((b) => b.key === `card:${c.id}`);
      items.push({ name: c.name, date: nextDate(c.dueDay), amount: m?.amount ?? null, kind: "card" });
    }
  }
  return items.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function highestCostDebt(state: FinancialState) {
  const known = state.debts.filter(hasKnownRate);
  const unknown = state.debts.filter((d) => !hasKnownRate(d));
  const best = known.reduce<{ name: string; rate: number } | null>((acc, d) => {
    const r = effectiveAnnualCost(d)!.toNumber();
    return !acc || r > acc.rate ? { name: d.name, rate: r } : acc;
  }, null);
  return { highest: best, unknown: unknown.map((d) => d.name) };
}
