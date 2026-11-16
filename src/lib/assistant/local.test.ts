import { describe, expect, it } from "vitest";
import { answerLocally, parseAmount, sectionsToMarkdown, type AssistantContext } from "./local";

const ctx: AssistantContext = {
  input: {
    startMonth: "2026-11",
    debts: [
      { key: "card:1", kind: "card", name: "Credit Card", balance: 55000, rate: null, ratePeriod: "monthly", method: "reducing", minimumPayment: null, prepaymentAllowed: true },
      { key: "loan:2", kind: "loan", name: "Loan B", balance: 236843, rate: 25, ratePeriod: "annual", method: "reducing", emi: 21349, prepaymentAllowed: true },
      { key: "loan:3", kind: "loan", name: "Friend Loan", balance: 400000, rate: 3, ratePeriod: "monthly", method: "reducing", emi: null, prepaymentAllowed: true },
      { key: "loan:1", kind: "loan", name: "Loan A", balance: 1327739, rate: 11.5, ratePeriod: "annual", method: "reducing", emi: 30300, prepaymentAllowed: true },
    ],
    monthlyIncome: 86000,
    monthlyExpenses: 10000,
    plannedSavings: 2000,
    currentSavings: 0,
    savingsTarget: 10000,
    stopSavingsAtTarget: true,
    strategy: "priority",
    priorityOrder: ["card:1", "loan:2", "loan:3", "loan:1"],
  },
  totalIncome: 86000,
  plannedExpenses: 10000,
  plannedSavings: 2000,
  mandatory: 66399,
  availableForDebt: 74000,
  remainingForExtra: 7601,
  discretionaryBudget: 0,
  goalMonth: null,
  previous: null,
};

describe("parseAmount", () => {
  it("understands Indian formats and units", () => {
    expect(parseAmount("salary increases by ₹10,000")).toBe(10000);
    expect(parseAmount("a 50k bonus")).toBe(50000);
    expect(parseAmount("1.5 lakh")).toBe(150000);
    expect(parseAmount("close loans by 2028")).toBeNull();
    expect(parseAmount("within two years")).toBeNull();
  });
});

describe("answerLocally", () => {
  it("salary what-if brings the debt-free date forward", () => {
    const s = answerLocally("What if my salary increases by ₹10,000?", ctx);
    expect(s.debtFreeImpact).toMatch(/earlier/);
    expect(s.interestSavings).toMatch(/less interest/);
  });

  it("always returns all eight sections", () => {
    for (const q of ["How much can I pay this month?", "Which loan should I close first?", "How much interest am I paying?", "Can I close all loans within two years?", "Show the next six months of repayments", "Why has my debt-free date changed?", "What if I receive a ₹50,000 bonus?"]) {
      const md = sectionsToMarkdown(answerLocally(q, ctx));
      for (const h of ["Current financial status", "Problem identified", "Suggested action", "Monthly financial impact", "Estimated interest savings", "Debt-free date impact", "Risks and assumptions", "Recommended next step"]) {
        expect(md).toContain(`## ${h}`);
      }
    }
  });

  it("two-year goal reports a shortfall", () => {
    const s = answerLocally("Can I close all loans within two years?", ctx);
    expect(s.problem).toMatch(/not achievable/);
  });

  it("schedule question returns a table of 6 months", () => {
    const s = answerLocally("Show the next six months of repayments", ctx);
    expect(s.table?.rows).toHaveLength(6);
  });
});
