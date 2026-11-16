import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/** Money columns: numeric(14,2) returned as strings to stay decimal-safe. */
const money = (name: string) => numeric(name, { precision: 14, scale: 2 });
/** Interest rate in percent, e.g. 11.5000 */
const rate = (name: string) => numeric(name, { precision: 9, scale: 4 });
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
};

/* ---------------------------- Auth ---------------------------------- */

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  failedLogins: integer("failed_logins").default(0).notNull(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  ...timestamps,
});

export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  /** Debt keys like "loan:3" / "card:1" in the preferred repayment order. */
  priorityOrder: jsonb("priority_order").$type<string[]>().default([]).notNull(),
  preferredStrategy: varchar("preferred_strategy", { length: 20 }).default("priority").notNull(),
  plannedMonthlySavings: money("planned_monthly_savings").default("0").notNull(),
  stopSavingsAtTarget: boolean("stop_savings_at_target").default(true).notNull(),
  extraMonthlyRepayment: money("extra_monthly_repayment").default("0").notNull(),
  /** "YYYY-MM"; null → current month. */
  planStartMonth: varchar("plan_start_month", { length: 7 }),
  aiEnabled: boolean("ai_enabled").default(false).notNull(),
  aiConsent: boolean("ai_consent").default(false).notNull(),
  aiConsentAt: timestamp("ai_consent_at", { withTimezone: true }),
  aiModel: varchar("ai_model", { length: 120 }),
  ...timestamps,
});

/* ---------------------------- Profile & income ----------------------- */

export const financialProfiles = pgTable("financial_profiles", {
  id: serial("id").primaryKey(),
  displayName: varchar("display_name", { length: 120 }).default("My Finances").notNull(),
  monthlySalary: money("monthly_salary").default("0").notNull(),
  salaryCreditDay: integer("salary_credit_day"),
  currentSavings: money("current_savings").default("0").notNull(),
  emergencySavingsTarget: money("emergency_savings_target").default("0").notNull(),
  ...timestamps,
});

export const incomeSources = pgTable(
  "income_sources",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id").references(() => financialProfiles.id, { onDelete: "cascade" }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    /** additional | variable | freelance | other */
    type: varchar("type", { length: 20 }).notNull(),
    amount: money("amount").default("0").notNull(),
    active: boolean("active").default(true).notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("income_sources_profile_idx").on(t.profileId)],
);

/* ---------------------------- Expenses ------------------------------- */

export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 80 }).notNull(),
    /** Default monthly budget used when a month has no specific budget. */
    defaultBudget: money("default_budget").default("0").notNull(),
    isEssential: boolean("is_essential").default(false).notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    archived: boolean("archived").default(false).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("expense_categories_name_uq").on(t.name)],
);

export const monthlyBudgets = pgTable(
  "monthly_budgets",
  {
    id: serial("id").primaryKey(),
    categoryId: integer("category_id").references(() => expenseCategories.id, { onDelete: "cascade" }).notNull(),
    month: varchar("month", { length: 7 }).notNull(),
    amount: money("amount").default("0").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("monthly_budgets_cat_month_uq").on(t.categoryId, t.month), index("monthly_budgets_month_idx").on(t.month)],
);

export const expenseTransactions = pgTable(
  "expense_transactions",
  {
    id: serial("id").primaryKey(),
    categoryId: integer("category_id").references(() => expenseCategories.id, { onDelete: "restrict" }).notNull(),
    date: date("date").notNull(),
    month: varchar("month", { length: 7 }).notNull(),
    amount: money("amount").notNull(),
    description: varchar("description", { length: 255 }),
    /** recurring | one_time */
    kind: varchar("kind", { length: 12 }).default("one_time").notNull(),
    /** manual | csv | recurring */
    source: varchar("source", { length: 12 }).default("manual").notNull(),
    ...timestamps,
  },
  (t) => [index("expense_tx_month_idx").on(t.month), index("expense_tx_category_idx").on(t.categoryId)],
);

/* ---------------------------- Loans ---------------------------------- */

export const loans = pgTable(
  "loans",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    lender: varchar("lender", { length: 120 }),
    loanType: varchar("loan_type", { length: 40 }).default("personal").notNull(),
    originalPrincipal: money("original_principal"),
    outstandingPrincipal: money("outstanding_principal").notNull(),
    interestRate: rate("interest_rate"),
    /** annual | monthly */
    ratePeriod: varchar("rate_period", { length: 10 }).default("annual").notNull(),
    /** reducing | flat */
    interestMethod: varchar("interest_method", { length: 12 }).default("reducing").notNull(),
    /** monthly | daily_365 */
    interestConvention: varchar("interest_convention", { length: 12 }).default("monthly").notNull(),
    emi: money("emi"),
    remainingTenureMonths: integer("remaining_tenure_months"),
    paymentDay: integer("payment_day"),
    startDate: date("start_date"),
    prepaymentAllowed: boolean("prepayment_allowed").default(true).notNull(),
    foreclosureChargePct: rate("foreclosure_charge_pct").default("0").notNull(),
    additionalMonthlyCharges: money("additional_monthly_charges").default("0").notNull(),
    notes: text("notes"),
    /** active | closed */
    status: varchar("status", { length: 10 }).default("active").notNull(),
    ...timestamps,
  },
  (t) => [index("loans_status_idx").on(t.status)],
);

export const loanTransactions = pgTable(
  "loan_transactions",
  {
    id: serial("id").primaryKey(),
    loanId: integer("loan_id").references(() => loans.id, { onDelete: "cascade" }).notNull(),
    date: date("date").notNull(),
    /** emi | extra_principal | interest_only | charge | adjustment | disbursement */
    type: varchar("type", { length: 20 }).notNull(),
    amount: money("amount").notNull(),
    principalComponent: money("principal_component").default("0").notNull(),
    interestComponent: money("interest_component").default("0").notNull(),
    chargesComponent: money("charges_component").default("0").notNull(),
    balanceBefore: money("balance_before").notNull(),
    balanceAfter: money("balance_after").notNull(),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("loan_tx_loan_idx").on(t.loanId), index("loan_tx_date_idx").on(t.date)],
);

/* ---------------------------- Credit cards --------------------------- */

export const creditCards = pgTable("credit_cards", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  bank: varchar("bank", { length: 120 }),
  outstandingBalance: money("outstanding_balance").notNull(),
  creditLimit: money("credit_limit"),
  interestRate: rate("interest_rate"),
  /** annual | monthly */
  ratePeriod: varchar("rate_period", { length: 10 }).default("monthly").notNull(),
  minimumDue: money("minimum_due"),
  billingDay: integer("billing_day"),
  dueDay: integer("due_day"),
  lateCharges: money("late_charges"),
  otherFees: money("other_fees").default("0").notNull(),
  notes: text("notes"),
  status: varchar("status", { length: 10 }).default("active").notNull(),
  ...timestamps,
});

export const creditCardTransactions = pgTable(
  "credit_card_transactions",
  {
    id: serial("id").primaryKey(),
    cardId: integer("card_id").references(() => creditCards.id, { onDelete: "cascade" }).notNull(),
    date: date("date").notNull(),
    /** payment | purchase | interest | fee | adjustment */
    type: varchar("type", { length: 20 }).notNull(),
    amount: money("amount").notNull(),
    balanceBefore: money("balance_before").notNull(),
    balanceAfter: money("balance_after").notNull(),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("card_tx_card_idx").on(t.cardId)],
);

/* ---------------------------- Planning ------------------------------- */

export const repaymentPlans = pgTable(
  "repayment_plans",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    strategy: varchar("strategy", { length: 20 }).notNull(),
    startMonth: varchar("start_month", { length: 7 }).notNull(),
    monthlyBudget: money("monthly_budget").notNull(),
    totalInterest: money("total_interest").notNull(),
    debtFreeMonth: varchar("debt_free_month", { length: 7 }),
    monthsToDebtFree: integer("months_to_debt_free"),
    isActive: boolean("is_active").default(false).notNull(),
    inputs: jsonb("inputs").notNull(),
    summary: jsonb("summary").notNull(),
    ...timestamps,
  },
  (t) => [index("repayment_plans_created_idx").on(t.createdAt)],
);

export const repaymentPlanItems = pgTable(
  "repayment_plan_items",
  {
    id: serial("id").primaryKey(),
    planId: integer("plan_id").references(() => repaymentPlans.id, { onDelete: "cascade" }).notNull(),
    monthIndex: integer("month_index").notNull(),
    month: varchar("month", { length: 7 }).notNull(),
    debtKey: varchar("debt_key", { length: 40 }).notNull(),
    debtName: varchar("debt_name", { length: 120 }).notNull(),
    opening: money("opening").notNull(),
    interest: money("interest").notNull(),
    charges: money("charges").default("0").notNull(),
    payment: money("payment").notNull(),
    principal: money("principal").notNull(),
    closing: money("closing").notNull(),
  },
  (t) => [index("plan_items_plan_idx").on(t.planId, t.monthIndex)],
);

export const financialSnapshots = pgTable(
  "financial_snapshots",
  {
    id: serial("id").primaryKey(),
    month: varchar("month", { length: 7 }).notNull(),
    salaryReceived: money("salary_received").default("0").notNull(),
    otherIncome: money("other_income").default("0").notNull(),
    plannedExpenses: money("planned_expenses").default("0").notNull(),
    actualExpenses: money("actual_expenses").default("0").notNull(),
    emiPaid: money("emi_paid").default("0").notNull(),
    extraPaid: money("extra_paid").default("0").notNull(),
    cardPaid: money("card_paid").default("0").notNull(),
    savingsBalance: money("savings_balance").default("0").notNull(),
    openingDebt: money("opening_debt").default("0").notNull(),
    closingDebt: money("closing_debt").default("0").notNull(),
    principalReduction: money("principal_reduction").default("0").notNull(),
    interestPaid: money("interest_paid").default("0").notNull(),
    plannedPayment: money("planned_payment").default("0").notNull(),
    debtBalances: jsonb("debt_balances").$type<Record<string, { name: string; opening: number; closing: number }>>().default({}).notNull(),
    projectedDebtFreeMonth: varchar("projected_debt_free_month", { length: 7 }),
    projectedTotalInterest: money("projected_total_interest"),
    notes: text("notes"),
    /** open | closed — closed months are immutable */
    status: varchar("status", { length: 10 }).default("open").notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("snapshots_month_uq").on(t.month)],
);

export const debtFreeGoals = pgTable("debt_free_goals", {
  id: serial("id").primaryKey(),
  targetMonth: varchar("target_month", { length: 7 }).notNull(),
  description: text("description"),
  /** Total debt when the goal was set — baseline for progress. */
  baselineDebt: money("baseline_debt").default("0").notNull(),
  active: boolean("active").default(true).notNull(),
  ...timestamps,
});

export const simulationScenarios = pgTable("simulation_scenarios", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  strategy: varchar("strategy", { length: 20 }).notNull(),
  overrides: jsonb("overrides").notNull(),
  resultSummary: jsonb("result_summary").notNull(),
  ...timestamps,
});

export const aiRecommendations = pgTable(
  "ai_recommendations",
  {
    id: serial("id").primaryKey(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    /** local | ai */
    source: varchar("source", { length: 10 }).notNull(),
    model: varchar("model", { length: 120 }),
    context: jsonb("context"),
    ...timestamps,
  },
  (t) => [index("ai_rec_created_idx").on(t.createdAt)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    entity: varchar("entity", { length: 40 }).notNull(),
    entityId: varchar("entity_id", { length: 40 }),
    action: varchar("action", { length: 40 }).notNull(),
    changes: jsonb("changes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("audit_entity_idx").on(t.entity, t.entityId), index("audit_created_idx").on(t.createdAt)],
);

/* ---------------------------- Relations ------------------------------ */

export const financialProfilesRelations = relations(financialProfiles, ({ many }) => ({ incomeSources: many(incomeSources) }));
export const incomeSourcesRelations = relations(incomeSources, ({ one }) => ({
  profile: one(financialProfiles, { fields: [incomeSources.profileId], references: [financialProfiles.id] }),
}));
export const expenseCategoriesRelations = relations(expenseCategories, ({ many }) => ({
  budgets: many(monthlyBudgets),
  transactions: many(expenseTransactions),
}));
export const monthlyBudgetsRelations = relations(monthlyBudgets, ({ one }) => ({
  category: one(expenseCategories, { fields: [monthlyBudgets.categoryId], references: [expenseCategories.id] }),
}));
export const expenseTransactionsRelations = relations(expenseTransactions, ({ one }) => ({
  category: one(expenseCategories, { fields: [expenseTransactions.categoryId], references: [expenseCategories.id] }),
}));
export const loansRelations = relations(loans, ({ many }) => ({ transactions: many(loanTransactions) }));
export const loanTransactionsRelations = relations(loanTransactions, ({ one }) => ({
  loan: one(loans, { fields: [loanTransactions.loanId], references: [loans.id] }),
}));
export const creditCardsRelations = relations(creditCards, ({ many }) => ({ transactions: many(creditCardTransactions) }));
export const creditCardTransactionsRelations = relations(creditCardTransactions, ({ one }) => ({
  card: one(creditCards, { fields: [creditCardTransactions.cardId], references: [creditCards.id] }),
}));
export const repaymentPlansRelations = relations(repaymentPlans, ({ many }) => ({ items: many(repaymentPlanItems) }));
export const repaymentPlanItemsRelations = relations(repaymentPlanItems, ({ one }) => ({
  plan: one(repaymentPlans, { fields: [repaymentPlanItems.planId], references: [repaymentPlans.id] }),
}));

export type Loan = typeof loans.$inferSelect;
export type CreditCard = typeof creditCards.$inferSelect;
export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type IncomeSource = typeof incomeSources.$inferSelect;
export type FinancialProfile = typeof financialProfiles.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
export type FinancialSnapshot = typeof financialSnapshots.$inferSelect;
