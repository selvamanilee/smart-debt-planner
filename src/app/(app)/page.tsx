import Link from "next/link";
import {
  ArrowDownRightIcon,
  BanknoteIcon,
  CalendarClockIcon,
  CoinsIcon,
  LandmarkIcon,
  PercentIcon,
  PiggyBankIcon,
  ReceiptIcon,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/stat-card";
import { Notice } from "@/components/notice";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { CashFlowBar, DebtBalanceBar, DebtReductionChart, DonutChart, InterestPrincipalChart } from "@/components/charts";
import { getFinancialState, getLoanTransactions, getExpensesForMonth } from "@/lib/data";
import { highestCostDebt, projectionFor, strategyComparison, upcomingPayments } from "@/lib/planning";
import { STRATEGY_LABELS } from "@/lib/finance/simulate";
import { monthDiff } from "@/lib/finance/dates";
import { D } from "@/lib/finance/money";
import { formatDate, formatINR, formatMonth, formatPct } from "@/lib/format";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const state = await getFinancialState();
  const { cashFlow: cf } = state;
  const projection = projectionFor(state);
  const comparison = strategyComparison(state);
  const [txs, actualTx] = await Promise.all([getLoanTransactions(), getExpensesForMonth(state.month)]);
  const upcoming = upcomingPayments(state);
  const cost = highestCostDebt(state);

  const debtBars = state.debts.map((d) => ({ name: d.name, balance: Number(d.balance) }));

  // Expense breakdown: actual spending this month if recorded, otherwise budgets.
  const actualByCat = new Map<number, number>();
  for (const t of actualTx) actualByCat.set(t.categoryId, (actualByCat.get(t.categoryId) ?? 0) + Number(t.amount));
  const useActual = actualTx.length > 0;
  const expenseSlices = state.budgets.map((b) => ({ name: b.category.name, value: useActual ? actualByCat.get(b.category.id) ?? 0 : Number(b.budget) }));

  const cashBars = [
    { name: "Income", value: cf.totalIncome },
    { name: "Expenses", value: cf.plannedExpenses },
    { name: "EMIs & minimums", value: cf.mandatoryEmis },
    { name: "Savings", value: cf.plannedSavings },
    { name: "Extra to debt", value: cf.remainingForExtra },
  ];

  const ipData = projection.months.slice(0, 18).map((m) => ({ month: m.month, interest: m.interest, principal: m.principalPaid }));
  const reductionSeries = projection.debts.map((d) => ({ key: d.key, name: d.name }));
  const reduction = projection.months.map((m) => {
    const row: Record<string, number | string> = { month: m.month };
    for (const d of projection.debts) row[d.key] = m.debts[d.key]?.closing ?? 0;
    return row;
  });

  const nextClosure = projection.debts.filter((d) => d.closureMonth).sort((a, b) => (a.closureMonth! < b.closureMonth! ? -1 : 1))[0];
  const firstTarget = projection.order[0] ? state.debts.find((d) => d.key === projection.order[0]) : undefined;
  const savingsTarget = Number(state.profile.emergencySavingsTarget);
  const savingsPct = savingsTarget > 0 ? (Number(state.profile.currentSavings) / savingsTarget) * 100 : 100;

  // Loan closure progress: baseline = original principal, else earliest recorded balance.
  const progress = [
    ...state.loans.map((l) => {
      const earliest = txs.filter((t) => t.loanId === l.id).at(-1);
      const base = Number(l.originalPrincipal ?? earliest?.balanceBefore ?? l.outstandingPrincipal);
      const out = Number(l.outstandingPrincipal);
      const closure = projection.debts.find((d) => d.key === `loan:${l.id}`)?.closureMonth;
      return { name: l.name, pct: base > 0 ? ((base - out) / base) * 100 : 100, out, base, closure, closed: l.status === "closed" || out <= 0, hasOriginal: Boolean(l.originalPrincipal) };
    }),
    ...state.cards.map((c) => ({
      name: c.name,
      pct: 0,
      out: Number(c.outstandingBalance),
      base: Number(c.outstandingBalance),
      closure: projection.debts.find((d) => d.key === `card:${c.id}`)?.closureMonth,
      closed: Number(c.outstandingBalance) <= 0,
      hasOriginal: false,
    })),
  ];

  const goal = state.goal;
  const goalMet = goal && projection.debtFreeMonth ? monthDiff(projection.debtFreeMonth, goal.targetMonth) >= 0 : false;
  const best = comparison.results[comparison.best];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Financial overview for ${formatMonth(state.month, true)} · strategy: ${STRATEGY_LABELS[projection.strategy]}`}
        actions={
          <>
            <Button variant="outline" asChild><Link href="/monthly-review">Monthly review</Link></Button>
            <Button asChild><Link href="/planner">Open planner</Link></Button>
          </>
        }
      />

      {cf.interestUnknownFor.length > 0 ? (
        <Notice tone="warn" className="mb-4" title="Some interest rates are not configured">
          {cf.interestUnknownFor.join(", ")}: interest is excluded from projections until you{" "}
          <Link className="font-medium text-foreground underline" href="/credit-cards">enter the actual rate</Link>. Projections are estimates.
        </Notice>
      ) : null}
      {cf.remainingForExtra < 0 ? (
        <Notice tone="bad" className="mb-4" title="Mandatory payments exceed your available cash">
          You are short by <strong>{formatINR(-cf.remainingForExtra)}</strong> per month after expenses and planned savings.
        </Notice>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total outstanding debt" value={formatINR(state.totalDebt)} sub={`${state.debts.length} active debts`} icon={LandmarkIcon} tone="bad" />
        <StatCard label="Monthly income" value={formatINR(cf.totalIncome)} sub={`Salary ${formatINR(cf.salary)}${cf.otherIncome ? ` + other ${formatINR(cf.otherIncome)}` : ""}`} icon={BanknoteIcon} tone="good" />
        <StatCard label="Monthly expenses" value={formatINR(cf.plannedExpenses)} sub={`Actual this month: ${formatINR(cf.actualExpenses)}`} icon={ReceiptIcon} />
        <StatCard label="Mandatory EMIs" value={formatINR(cf.mandatoryEmis)} sub="EMIs, interest-only & card minimums" icon={CalendarClockIcon} tone="warn" />
        <StatCard label="Est. monthly interest" value={formatINR(cf.estimatedMonthlyInterest)} sub={cf.interestUnknownFor.length ? `Excludes ${cf.interestUnknownFor.join(", ")} (rate unknown)` : "On current balances"} icon={PercentIcon} tone="bad" />
        <StatCard label="Available repayment budget" value={formatINR(cf.remainingForExtra)} sub={`Total for debt: ${formatINR(cf.availableForDebt)}`} icon={ArrowDownRightIcon} tone={cf.remainingForExtra >= 0 ? "good" : "bad"} />
        <StatCard label="Current savings" value={formatINR(state.profile.currentSavings)} sub={`Target ${formatINR(savingsTarget)} · ${Math.min(100, Math.round(savingsPct))}%`} icon={PiggyBankIcon} />
        <StatCard
          label="Projected debt-free"
          value={projection.debtFreeMonth ? formatMonth(projection.debtFreeMonth, true) : "Not within 30 years"}
          sub={projection.monthsToDebtFree ? `${projection.monthsToDebtFree} months · interest ${formatINR(projection.totalInterest)}${projection.isEstimate ? " (est.)" : ""}` : "Increase repayments"}
          icon={CoinsIcon}
          tone={projection.debtFreeMonth ? "good" : "bad"}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Insights</CardTitle>
            <CardDescription>Calculated from your saved data — no AI involved.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Insight label="Highest-interest debt">
              {cost.highest ? `${cost.highest.name} · ${formatPct(cost.highest.rate)} p.a. effective` : "—"}
              {cost.unknown.length ? <span className="block text-xs text-warning">Rate unknown: {cost.unknown.join(", ")}</span> : null}
            </Insight>
            <Insight label="Next EMI / payment due">
              {upcoming[0] ? `${upcoming[0].name} · ${formatDate(upcoming[0].date)}${upcoming[0].amount ? ` · ${formatINR(upcoming[0].amount)}` : ""}` : <span>No payment dates set. <Link href="/loans" className="underline">Add payment days</Link></span>}
            </Insight>
            <Insight label="Interest this month (est.)">{formatINR(projection.months[0]?.interest ?? 0)}</Insight>
            <Insight label="Upcoming closure">{nextClosure ? `${nextClosure.name} · ${formatMonth(nextClosure.closureMonth, true)}` : "—"}</Insight>
            <Insight label="Monthly repayment capacity">{formatINR(cf.availableForDebt)} <span className="text-xs text-muted-foreground">({formatINR(cf.mandatoryEmis)} mandatory)</span></Insight>
            <Insight label="Recommended additional payment">
              {cf.remainingForExtra > 0 && firstTarget ? `${formatINR(cf.remainingForExtra)} → ${firstTarget.name}` : "No surplus this month"}
            </Insight>
            <Insight label="Best strategy for interest">
              {STRATEGY_LABELS[comparison.best]} · {formatINR(best.totalInterest)}
              {comparison.best !== projection.strategy ? (
                <span className="block text-xs text-success">Saves {formatINR(projection.totalInterest - best.totalInterest)} vs your current strategy</span>
              ) : null}
            </Insight>
            <Insight label="Debt-free target">
              {goal ? (
                <>
                  Target {formatMonth(goal.targetMonth, true)} ·{" "}
                  <Badge variant={goalMet ? "success" : "destructive"}>{goalMet ? "On track" : "Behind"}</Badge>
                </>
              ) : (
                <Link href="/goal" className="underline">Set a target date</Link>
              )}
            </Insight>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Loan closure progress</CardTitle>
            <CardDescription>Repaid vs original / first-tracked balance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {progress.map((p) => (
              <div key={p.name} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{p.closed ? "Closed" : p.closure ? `Closes ${formatMonth(p.closure)}` : "No closure in plan"}</span>
                </div>
                <Progress value={p.closed ? 100 : p.pct} />
                <div className="flex justify-between text-xs text-muted-foreground num">
                  <span>{formatINR(p.out)} left</span>
                  <span>{p.closed ? "100%" : `${Math.max(0, p.pct).toFixed(1)}% repaid`}</span>
                </div>
              </div>
            ))}
            {goal && projection.monthsToDebtFree ? (
              <div className="rounded-lg bg-muted p-3 text-sm">
                <div className="mb-1.5 font-medium">Debt-free target progress</div>
                <Progress value={Number(goal.baselineDebt) > 0 ? (1 - state.totalDebt / Number(goal.baselineDebt)) * 100 : 0} indicatorClassName={goalMet ? "bg-success" : "bg-warning"} />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {Number(goal.baselineDebt) > 0 ? `${Math.max(0, (1 - state.totalDebt / Number(goal.baselineDebt)) * 100).toFixed(1)}% of ${formatINR(goal.baselineDebt)} repaid · ` : ""}
                  Projected {formatMonth(projection.debtFreeMonth, true)} vs target {formatMonth(goal.targetMonth, true)}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Loan-wise outstanding balance">
          <DebtBalanceBar data={debtBars} />
        </ChartCard>
        <ChartCard title="Monthly expense breakdown" description={useActual ? "Actual spending this month" : "Budgeted (no actual expenses recorded yet)"}>
          <DonutChart data={expenseSlices} />
        </ChartCard>
        <ChartCard title="Income vs expenses" description="Where this month's income goes">
          <CashFlowBar data={cashBars} />
        </ChartCard>
        <ChartCard title="Interest vs principal" description="Projected, next 18 months">
          <InterestPrincipalChart data={ipData} />
        </ChartCard>
        <ChartCard title="Debt reduction over time" description="Projected balance by debt" className="lg:col-span-2">
          <DebtReductionChart data={reduction} series={reductionSeries} height={300} />
        </ChartCard>
      </div>

      {projection.warnings.length > 0 ? (
        <div className="mt-6 space-y-2">
          {projection.warnings.map((w) => (
            <Notice key={w} tone="warn">{w}</Notice>
          ))}
        </div>
      ) : null}
      <p className="mt-4 text-xs text-muted-foreground">
        Planned monthly savings {formatINR(cf.plannedSavings)} · Remaining after all commitments {formatINR(D(cf.remainingForExtra).toNumber())}
      </p>
    </>
  );
}

function Insight({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-background/50 p-3">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-1 text-sm font-medium">{children}</div>
    </div>
  );
}

function ChartCard({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
