import { Suspense } from "react";
import { like } from "drizzle-orm";
import { PageHeader } from "@/components/layout/page-header";
import { MonthPicker } from "@/components/shared/month-picker";
import { StatCard } from "@/components/stat-card";
import { Notice } from "@/components/notice";
import { getBudgetsForMonth, getCategories, getExpensesForMonth, getFinancialState } from "@/lib/data";
import { getDb } from "@/lib/db";
import { expenseTransactions } from "@/lib/db/schema";
import { isValidMonthKey, monthKey, formatMonth } from "@/lib/finance/dates";
import { formatINR } from "@/lib/format";
import { ExpensesTabs } from "./expenses-tabs";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const month = isValidMonthKey(sp.month) ? sp.month : monthKey();
  const year = month.slice(0, 4);
  const [state, budgets, txs, allCats, yearTx] = await Promise.all([
    getFinancialState(month),
    getBudgetsForMonth(month),
    getExpensesForMonth(month),
    getCategories(true),
    getDb().select().from(expenseTransactions).where(like(expenseTransactions.month, `${year}-%`)),
  ]);

  const actualByCat: Record<number, number> = {};
  for (const t of txs) actualByCat[t.categoryId] = (actualByCat[t.categoryId] ?? 0) + Number(t.amount);
  const totalBudget = budgets.reduce((a, b) => a + Number(b.budget), 0);
  const totalActual = txs.reduce((a, t) => a + Number(t.amount), 0);
  const over = budgets.filter((b) => (actualByCat[b.category.id] ?? 0) > Number(b.budget));

  const yearly: Record<string, Record<string, number>> = {};
  for (const t of yearTx) {
    yearly[t.month] ??= {};
    const name = allCats.find((c) => c.id === t.categoryId)?.name ?? "Unknown";
    yearly[t.month][name] = (yearly[t.month][name] ?? 0) + Number(t.amount);
  }

  const cf = state.cashFlow;
  return (
    <>
      <PageHeader
        title="Expenses"
        description="Budgets drive the repayment plan; actual expenses track how the month really went."
        actions={
          <Suspense>
            <MonthPicker month={month} />
          </Suspense>
        }
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Total income" value={formatINR(cf.totalIncome)} />
        <StatCard label={`Budget · ${formatMonth(month)}`} value={formatINR(totalBudget)} />
        <StatCard label="Actual spent" value={formatINR(totalActual)} tone={totalActual > totalBudget ? "bad" : "good"} sub={totalBudget ? `${Math.round((totalActual / totalBudget) * 100)}% of budget` : undefined} />
        <StatCard label="Mandatory EMIs" value={formatINR(cf.mandatoryEmis)} sub={`Planned savings ${formatINR(cf.plannedSavings)}`} />
        <StatCard label="Left for extra repayment" value={formatINR(cf.remainingForExtra)} tone={cf.remainingForExtra >= 0 ? "good" : "bad"} className="col-span-2 lg:col-span-1" />
      </div>
      {over.length ? (
        <Notice tone="warn" className="mt-4" title="Overspending detected">
          {over.map((b) => `${b.category.name} (${formatINR((actualByCat[b.category.id] ?? 0) - Number(b.budget))} over)`).join(", ")}
        </Notice>
      ) : null}
      <div className="mt-6">
        <ExpensesTabs
          month={month}
          budgets={budgets.map((b) => ({ id: b.category.id, name: b.category.name, budget: b.budget, defaultBudget: b.category.defaultBudget, hasOverride: b.hasOverride, essential: b.category.isEssential, actual: actualByCat[b.category.id] ?? 0 }))}
          transactions={txs.map((t) => ({ id: t.id, categoryId: t.categoryId, category: allCats.find((c) => c.id === t.categoryId)?.name ?? "—", date: t.date, amount: t.amount, description: t.description ?? "", kind: t.kind, source: t.source }))}
          categories={allCats.map((c) => ({ id: c.id, name: c.name, defaultBudget: c.defaultBudget, essential: c.isEssential, archived: c.archived, isDefault: c.isDefault }))}
          yearly={yearly}
          year={year}
        />
      </div>
    </>
  );
}
