import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Full export of every record the user owns (excluding the password hash). */
export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const [profiles, income, categories, budgets, expenses, loans, loanTx, cards, cardTx, plans, planItems, snapshots, goals, scenarios, ai, settings, auditRows, users] = await Promise.all([
    db.select().from(s.financialProfiles),
    db.select().from(s.incomeSources),
    db.select().from(s.expenseCategories),
    db.select().from(s.monthlyBudgets),
    db.select().from(s.expenseTransactions),
    db.select().from(s.loans),
    db.select().from(s.loanTransactions),
    db.select().from(s.creditCards),
    db.select().from(s.creditCardTransactions),
    db.select().from(s.repaymentPlans),
    db.select().from(s.repaymentPlanItems),
    db.select().from(s.financialSnapshots),
    db.select().from(s.debtFreeGoals),
    db.select().from(s.simulationScenarios),
    db.select().from(s.aiRecommendations),
    db.select().from(s.userSettings),
    db.select().from(s.auditLog),
    db.select({ id: s.users.id, username: s.users.username, createdAt: s.users.createdAt }).from(s.users),
  ]);
  await audit("export", "all", "json");
  const body = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      app: "smart-debt-planner",
      version: 1,
      users,
      financialProfiles: profiles,
      incomeSources: income,
      expenseCategories: categories,
      monthlyBudgets: budgets,
      expenseTransactions: expenses,
      loans,
      loanTransactions: loanTx,
      creditCards: cards,
      creditCardTransactions: cardTx,
      repaymentPlans: plans,
      repaymentPlanItems: planItems,
      financialSnapshots: snapshots,
      debtFreeGoals: goals,
      simulationScenarios: scenarios,
      aiRecommendations: ai,
      userSettings: settings,
      auditLog: auditRows,
    },
    null,
    2,
  );
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="smart-debt-planner-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
