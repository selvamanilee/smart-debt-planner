import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/layout/page-header";
import { getFinancialState, debtRateLabel } from "@/lib/data";
import { getDb } from "@/lib/db";
import { repaymentPlans, simulationScenarios } from "@/lib/db/schema";
import { D } from "@/lib/finance/money";
import { PlannerClient } from "./planner-client";

export const metadata = { title: "Repayment Planner" };

export default async function PlannerPage() {
  const state = await getFinancialState();
  const db = getDb();
  const [scenarios, plans] = await Promise.all([
    db.select().from(simulationScenarios).orderBy(desc(simulationScenarios.createdAt)),
    db.select({ id: repaymentPlans.id, name: repaymentPlans.name, strategy: repaymentPlans.strategy, debtFreeMonth: repaymentPlans.debtFreeMonth, monthsToDebtFree: repaymentPlans.monthsToDebtFree, totalInterest: repaymentPlans.totalInterest, isActive: repaymentPlans.isActive, createdAt: repaymentPlans.createdAt }).from(repaymentPlans).orderBy(desc(repaymentPlans.createdAt)).limit(20),
  ]);
  return (
    <>
      <PageHeader
        title="Repayment Planner"
        description="Change any amount and every projection recalculates instantly. Contractual EMIs and minimums are always paid first."
      />
      <PlannerClient
        base={JSON.parse(JSON.stringify(state.simulationInput))}
        debts={state.debts.map((d) => ({ key: d.key, name: d.name, kind: d.kind, balance: Number(d.balance), rate: d.rate === null || d.rate === undefined ? null : Number(d.rate), rateLabel: debtRateLabel(d), emi: d.emi ? Number(d.emi) : null, prepay: d.prepaymentAllowed !== false }))}
        settings={{ stopSavingsAtTarget: state.settings.stopSavingsAtTarget, planStartMonth: state.settings.planStartMonth }}
        cashFlow={state.cashFlow}
        savingsTarget={Number(state.profile.emergencySavingsTarget)}
        scenarios={scenarios.map((s) => ({ id: s.id, name: s.name, description: s.description, overrides: s.overrides as object, createdAt: s.createdAt.toISOString() }))}
        plans={plans.map((p) => ({ ...p, totalInterest: D(p.totalInterest).toNumber(), createdAt: p.createdAt.toISOString() }))}
      />
    </>
  );
}
