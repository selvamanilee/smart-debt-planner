import { eq } from "drizzle-orm";
import type { Db } from "./client";
import * as s from "./schema";

export const DEFAULT_CATEGORIES: { name: string; essential: boolean; budget?: string }[] = [
  { name: "Rent", essential: true },
  { name: "Food", essential: true },
  { name: "Electricity", essential: true },
  { name: "Water", essential: true },
  { name: "Internet", essential: true },
  { name: "Mobile", essential: true },
  { name: "Transport", essential: true },
  { name: "Petrol", essential: true },
  { name: "Medical", essential: true },
  { name: "Family", essential: true },
  { name: "Shopping", essential: false },
  { name: "Education", essential: true },
  { name: "Entertainment", essential: false },
  { name: "Subscriptions", essential: false },
  // The initial ₹10,000 living-expense figure is recorded here until split across categories.
  { name: "Other expenses", essential: true, budget: "10000" },
];

/** Seeds the initial financial data. Idempotent: does nothing if a profile already exists. */
export async function seedInitialData(db: Db): Promise<boolean> {
  const existing = await db.select({ id: s.financialProfiles.id }).from(s.financialProfiles).limit(1);
  if (existing.length > 0) return false;

  const [profile] = await db
    .insert(s.financialProfiles)
    .values({ displayName: "My Finances", monthlySalary: "86000", currentSavings: "0", emergencySavingsTarget: "10000" })
    .returning();

  await db.insert(s.expenseCategories).values(
    DEFAULT_CATEGORIES.map((c, i) => ({ name: c.name, isEssential: c.essential, isDefault: true, sortOrder: i, defaultBudget: c.budget ?? "0" })),
  );

  const [card] = await db
    .insert(s.creditCards)
    .values({ name: "Credit Card", outstandingBalance: "55000", interestRate: null, minimumDue: null, ratePeriod: "monthly", notes: "Interest rate, minimum due and payment date not yet provided." })
    .returning();

  const [loanA, loanB, friend] = await db
    .insert(s.loans)
    .values([
      { name: "Loan A", loanType: "personal", outstandingPrincipal: "1327739", interestRate: "11.5", ratePeriod: "annual", interestMethod: "reducing", emi: "30300", remainingTenureMonths: 56, prepaymentAllowed: true },
      { name: "Loan B", loanType: "personal", outstandingPrincipal: "236843", interestRate: "25", ratePeriod: "annual", interestMethod: "reducing", emi: "21349", remainingTenureMonths: 13, prepaymentAllowed: true },
      {
        name: "Friend Loan",
        lender: "Friend",
        loanType: "private",
        originalPrincipal: "400000",
        outstandingPrincipal: "400000",
        interestRate: "3",
        ratePeriod: "monthly",
        interestMethod: "reducing",
        emi: null,
        prepaymentAllowed: true,
        notes: "3% per month on remaining principal. No fixed EMI; principal prepayment allowed.",
      },
    ])
    .returning();

  await db.insert(s.userSettings).values({
    priorityOrder: [`card:${card.id}`, `loan:${loanB.id}`, `loan:${friend.id}`, `loan:${loanA.id}`],
    preferredStrategy: "priority",
    plannedMonthlySavings: "2000",
    stopSavingsAtTarget: true,
    extraMonthlyRepayment: "0",
  });

  await db.insert(s.auditLog).values({ entity: "system", action: "seed", changes: { profileId: profile.id } });
  return true;
}

/** Empty profile with default categories (used after the user deletes all data). */
export async function createBlankProfile(db: Db) {
  const existing = await db.select({ id: s.financialProfiles.id }).from(s.financialProfiles).limit(1);
  if (existing.length > 0) return;
  await db.insert(s.financialProfiles).values({ displayName: "My Finances" });
  const cats = await db.select({ id: s.expenseCategories.id }).from(s.expenseCategories).limit(1);
  if (!cats.length) {
    await db.insert(s.expenseCategories).values(DEFAULT_CATEGORIES.map((c, i) => ({ name: c.name, isEssential: c.essential, isDefault: true, sortOrder: i })));
  }
}

/** Removes every financial record (keeps the user account). */
export async function wipeFinancialData(db: Db) {
  await db.delete(s.repaymentPlanItems);
  await db.delete(s.repaymentPlans);
  await db.delete(s.loanTransactions);
  await db.delete(s.creditCardTransactions);
  await db.delete(s.expenseTransactions);
  await db.delete(s.monthlyBudgets);
  await db.delete(s.expenseCategories);
  await db.delete(s.incomeSources);
  await db.delete(s.loans);
  await db.delete(s.creditCards);
  await db.delete(s.financialSnapshots);
  await db.delete(s.debtFreeGoals);
  await db.delete(s.simulationScenarios);
  await db.delete(s.aiRecommendations);
  await db.delete(s.userSettings);
  await db.delete(s.financialProfiles).where(eq(s.financialProfiles.id, s.financialProfiles.id));
}
