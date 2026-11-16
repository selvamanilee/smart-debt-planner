import { describe, expect, it } from "vitest";
import { D, round2, toNum } from "./money";
import { addMonths, monthDiff, daysInMonth } from "./dates";
import {
  DebtInput,
  calculateEmi,
  calculateFlatEmi,
  contractualMinimum,
  effectiveAnnualCost,
  monthlyInterest,
  monthsToRepay,
} from "./debt";
import { compareStrategies, orderDebts, simulate, SimulationInput } from "./simulate";
import { analyzeGoal, extraPaymentImpact, debtSchedule } from "./analysis";

const loanA: DebtInput = { key: "loan:a", kind: "loan", name: "Loan A", balance: 1327739, rate: 11.5, ratePeriod: "annual", method: "reducing", emi: 30300, prepaymentAllowed: true };
const loanB: DebtInput = { key: "loan:b", kind: "loan", name: "Loan B", balance: 236843, rate: 25, ratePeriod: "annual", method: "reducing", emi: 21349, prepaymentAllowed: true };
const friend: DebtInput = { key: "loan:f", kind: "loan", name: "Friend Loan", balance: 400000, rate: 3, ratePeriod: "monthly", method: "reducing", emi: null, prepaymentAllowed: true };
const card: DebtInput = { key: "card:1", kind: "card", name: "Credit Card", balance: 55000, rate: null, ratePeriod: "annual", method: "reducing", minimumPayment: null, prepaymentAllowed: true };

const baseInput: SimulationInput = {
  startMonth: "2026-11",
  debts: [card, loanB, friend, loanA],
  monthlyIncome: 86000,
  monthlyExpenses: 10000,
  plannedSavings: 2000,
  currentSavings: 0,
  savingsTarget: 10000,
  stopSavingsAtTarget: true,
  strategy: "priority",
  priorityOrder: ["card:1", "loan:b", "loan:f", "loan:a"],
};

describe("money", () => {
  it("avoids floating point errors", () => {
    expect(toNum(D("0.1").plus("0.2"))).toBe(0.3);
    expect(round2("2.345").toString()).toBe("2.35");
    expect(round2("-2.345").toString()).toBe("-2.35");
  });
});

describe("dates", () => {
  it("adds months across years", () => {
    expect(addMonths("2026-11", 2)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(monthDiff("2026-11", "2028-12")).toBe(25);
    expect(daysInMonth("2028-02")).toBe(29);
  });
});

describe("EMI and interest", () => {
  it("computes a standard reducing-balance EMI", () => {
    // ₹10,00,000 at 10% for 120 months → ₹13,215.07
    expect(calculateEmi(1000000, 10, 120).toString()).toBe("13215.07");
    expect(calculateEmi(12000, 0, 12).toString()).toBe("1000");
  });

  it("computes a flat-rate EMI", () => {
    // ₹1,00,000 at 12% flat for 12 months → (100000 + 12000)/12
    expect(calculateFlatEmi(100000, 12, 12).toString()).toBe("9333.33");
  });

  it("computes reducing monthly interest for annual and monthly rates", () => {
    expect(monthlyInterest(loanA, 1327739)!.toString()).toBe("12724.17");
    expect(monthlyInterest(friend, 400000)!.toString()).toBe("12000");
    expect(monthlyInterest(friend, 350000)!.toString()).toBe("10500");
  });

  it("computes daily interest with actual days / 365", () => {
    const d: DebtInput = { ...loanA, convention: "daily_365" };
    // 100000 × 12% / 365 × 31
    expect(monthlyInterest({ ...d, rate: 12 }, 100000, "2026-12")!.toString()).toBe("1019.18");
  });

  it("returns null interest for an unknown rate", () => {
    expect(monthlyInterest(card, 55000)).toBeNull();
  });

  it("computes flat interest on the original principal", () => {
    const flat: DebtInput = { key: "x", kind: "loan", name: "Flat", balance: 50000, rate: 12, ratePeriod: "annual", method: "flat", originalPrincipal: 100000, emi: 9333.33, remainingTenure: 6 };
    expect(monthlyInterest(flat, 50000)!.toString()).toBe("1000");
    // Effective cost of a flat loan is much higher than the flat rate
    expect(effectiveAnnualCost(flat)!.toNumber()).toBeGreaterThan(20);
  });

  it("computes months to repay and detects never-ending loans", () => {
    expect(monthsToRepay(1000000, D(10).div(1200), 13215.07)).toBe(120);
    expect(monthsToRepay(400000, "0.03", 12000)).toBeNull();
  });

  it("uses interest as the minimum for loans without EMI", () => {
    const min = contractualMinimum(friend, D(12000), D(0), D(412000));
    expect(min.amount.toString()).toBe("12000");
    const cardMin = contractualMinimum(card, D(0), D(0), D(55000));
    expect(cardMin.estimated).toBe(true);
    expect(cardMin.amount.toString()).toBe("2750");
  });
});

describe("simulation", () => {
  it("satisfies opening + interest + charges − payments = closing for every debt and month", () => {
    const r = simulate(baseInput);
    for (const m of r.months) {
      for (const d of Object.values(m.debts)) {
        const lhs = D(d.opening).plus(d.interest).plus(d.charges).minus(d.totalPaid);
        expect(toNum(lhs)).toBeCloseTo(d.closing, 2);
      }
    }
  });

  it("pays off all debts and reports a debt-free date", () => {
    const r = simulate(baseInput);
    expect(r.debtFreeMonth).not.toBeNull();
    expect(r.months.at(-1)!.closingDebt).toBe(0);
    // Unknown card rate → estimate flagged
    expect(r.isEstimate).toBe(true);
    expect(r.warnings.some((w) => w.includes("Credit Card"))).toBe(true);
  });

  it("follows the user's priority order for extra payments", () => {
    const r = simulate(baseInput);
    const m0 = r.months[0];
    // Card gets the extra first; Loan A only gets its EMI.
    expect(m0.debts["card:1"].extraPaid).toBeGreaterThan(0);
    expect(m0.debts["loan:a"].extraPaid).toBe(0);
    // Month 1 cash: 86000 − 10000 − 2000 savings = 74000 pool
    expect(m0.repaymentPool).toBe(74000);
    expect(m0.totalPaid + m0.surplusToSavings).toBeCloseTo(74000, 2);
  });

  it("stops savings contributions once the emergency target is reached", () => {
    const r = simulate(baseInput);
    expect(r.months[4].savingsBalance).toBeGreaterThanOrEqual(10000);
    expect(r.months[5].savingsContribution).toBe(0);
  });

  it("closes a loan's final month exactly without overpaying", () => {
    const r = simulate(baseInput);
    const b = r.debts.find((d) => d.key === "loan:b")!;
    expect(b.closureMonth).not.toBeNull();
    const lastRow = r.months.find((m) => m.month === b.closureMonth)!.debts["loan:b"];
    expect(lastRow.closing).toBe(0);
  });

  it("orders avalanche by effective cost (unknown rate first) and snowball by balance", () => {
    const av = orderDebts([loanA, loanB, friend, card], "avalanche").map((d) => d.key);
    expect(av).toEqual(["card:1", "loan:f", "loan:b", "loan:a"]);
    const sb = orderDebts([loanA, loanB, friend, card], "snowball").map((d) => d.key);
    expect(sb).toEqual(["card:1", "loan:b", "loan:f", "loan:a"]);
  });

  it("avalanche never costs more interest than snowball here", () => {
    const cmp = compareStrategies(baseInput);
    expect(cmp.results.avalanche.totalInterest).toBeLessThanOrEqual(cmp.results.snowball.totalInterest);
    expect(cmp.results.avalanche.totalInterest).toBeLessThanOrEqual(cmp.results.priority.totalInterest);
  });

  it("a bonus brings the debt-free date forward and reduces interest", () => {
    const base = simulate(baseInput);
    const withBonus = simulate({ ...baseInput, events: [{ type: "bonus", month: "2027-01", amount: 50000 }] });
    expect(withBonus.totalInterest).toBeLessThan(base.totalInterest);
    expect(withBonus.monthsToDebtFree!).toBeLessThanOrEqual(base.monthsToDebtFree!);
  });

  it("an earmarked friend-loan prepayment reduces next month's friend interest", () => {
    const r = simulate({ ...baseInput, events: [{ type: "lump_sum", month: "2026-11", amount: 50000, debtKey: "loan:f" }] });
    expect(r.months[0].debts["loan:f"].closing).toBe(350000);
    expect(r.months[1].debts["loan:f"].interest).toBe(10500);
  });

  it("records a shortfall when mandatory payments exceed income", () => {
    const r = simulate({ ...baseInput, monthlyIncome: 50000, maxMonths: 3 });
    expect(r.months[0].shortfall).toBeGreaterThan(0);
    expect(r.totalShortfall).toBeGreaterThan(0);
  });

  it("applies prepayment charges on extra principal", () => {
    const d: DebtInput = { ...loanB, prepaymentChargePct: 2 };
    const r = simulate({ ...baseInput, debts: [d], priorityOrder: [d.key], maxMonths: 2 });
    const row = r.months[0].debts[d.key];
    expect(row.prepaymentCharges).toBeGreaterThan(0);
    expect(toNum(D(row.opening).plus(row.interest).plus(row.charges).minus(row.totalPaid))).toBeCloseTo(row.closing, 2);
  });
});

describe("single-debt analysis", () => {
  it("Loan A at its EMI closes and extra payments save interest", () => {
    const s = debtSchedule(loanA, { startMonth: "2026-11" });
    expect(s.monthsToDebtFree).toBeGreaterThan(56);
    const impact = extraPaymentImpact(loanA, { startMonth: "2026-11", extraMonthly: 5000 });
    expect(impact.interestSaved!).toBeGreaterThan(0);
    expect(impact.monthsSaved!).toBeGreaterThan(0);
  });

  it("friend loan never closes with interest-only payments", () => {
    const s = debtSchedule(friend, { startMonth: "2026-11", maxMonths: 24 });
    expect(s.debtFreeMonth).toBeNull();
    expect(s.months[0].debts["loan:f"].interest).toBe(12000);
  });
});

describe("debt-free goal", () => {
  it("finds the extra monthly amount needed for an aggressive target", () => {
    const g = analyzeGoal(baseInput, "2027-12", 5000);
    expect(g.achievable).toBe(false);
    expect(g.monthlyShortfall).toBeGreaterThan(0);
    expect(simulate({ ...baseInput, extraMonthlyPayment: g.monthlyShortfall }).debtFreeMonth! <= "2027-12").toBe(true);
  });

  it("reports an easily reachable target as achievable", () => {
    const g = analyzeGoal(baseInput, "2035-12");
    expect(g.achievable).toBe(true);
    expect(g.monthlyShortfall).toBe(0);
  });
});

import { z } from "zod";
import { checkbox, optionalMoney, optionalText, optionalRate, optionalDay, money as moneySchema } from "@/lib/validation";

describe("form validation", () => {
  const s = z.object({ a: checkbox, b: optionalMoney, c: optionalText(5), d: optionalRate, e: optionalDay });
  it("treats missing optional fields and unchecked checkboxes as empty", () => {
    expect(s.safeParse({}).data).toEqual({ a: false, b: null, c: null, d: null, e: null });
  });
  it("parses Indian-formatted amounts and rejects bad input", () => {
    expect(moneySchema.safeParse("1,27,739.50").data).toBe("127739.50");
    expect(moneySchema.safeParse("-5").success).toBe(false);
    expect(moneySchema.safeParse("12.345").success).toBe(false);
    expect(s.safeParse({ a: "on", b: "₹1,200", d: "3", e: "32" }).success).toBe(false);
  });
});
