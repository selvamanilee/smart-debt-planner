import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Notice } from "@/components/notice";
import { StatCard } from "@/components/stat-card";
import { DebtReductionChart } from "@/components/charts";
import { getFinancialState } from "@/lib/data";
import { analyzeGoal } from "@/lib/finance/analysis";
import { addMonths, isValidMonthKey } from "@/lib/finance/dates";
import { formatINR, formatMonth } from "@/lib/format";
import { GoalForm } from "./goal-form";

export const metadata = { title: "Debt-Free Goal" };

export default async function GoalPage({ searchParams }: { searchParams: Promise<{ target?: string }> }) {
  const sp = await searchParams;
  const state = await getFinancialState();
  const goal = state.goal;
  const target = isValidMonthKey(sp.target) ? sp.target : goal?.targetMonth ?? "2028-12";
  const a = analyzeGoal(state.simulationInput, target, state.cashFlow.discretionaryBudget);
  const status = a.achievable ? "achievable" : Number.isNaN(a.monthlyShortfall) ? "impossible" : "shortfall";
  const progressPct = goal && Number(goal.baselineDebt) > 0 ? Math.max(0, (1 - state.totalDebt / Number(goal.baselineDebt)) * 100) : null;

  const chart = (a.requiredResult ?? null)?.months.map((m) => ({ month: m.month, required: m.closingDebt })) ?? [];
  const currentRows = new Map((await import("@/lib/planning")).projectionFor(state).months.map((m) => [m.month, m.closingDebt]));
  const merged = [...new Set([...chart.map((c) => c.month), ...currentRows.keys()])].sort().map((month) => ({
    month,
    current: currentRows.get(month) ?? 0,
    required: chart.find((c) => c.month === month)?.required ?? 0,
  }));

  return (
    <>
      <PageHeader title="Debt-Free Goal" description="Set a target date and see exactly what it takes to reach it." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Your target</CardTitle>
            <CardDescription>{goal ? `Active target: ${formatMonth(goal.targetMonth, true)}` : "No target saved yet — showing December 2028 as an example."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <GoalForm targetMonth={target} description={goal?.description ?? ""} hasGoal={Boolean(goal)} />
            {progressPct !== null ? (
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm"><span>Progress since target set</span><span className="num">{progressPct.toFixed(1)}%</span></div>
                <Progress value={progressPct} />
                <p className="text-xs text-muted-foreground">{formatINR(Number(goal!.baselineDebt) - state.totalDebt)} repaid of {formatINR(goal!.baselineDebt)}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
        <div className="space-y-4 lg:col-span-2">
          {status === "achievable" ? (
            <Notice tone="good" title={`On track: debt-free by ${formatMonth(a.currentDebtFreeMonth, true)}`}>{a.explanation.join(" ")}</Notice>
          ) : status === "shortfall" ? (
            <Notice tone="bad" title={`Target ${formatMonth(target, true)} is not achievable at current capacity`}>{a.explanation.join(" ")}</Notice>
          ) : (
            <Notice tone="bad" title="Target is not reachable">{a.explanation.join(" ")}</Notice>
          )}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
            <StatCard label="Months available" value={Math.max(0, a.monthsAvailable)} sub={`${formatMonth(state.simulationInput.startMonth)} → ${formatMonth(target)}`} />
            <StatCard label="Current repayment capacity" value={formatINR(a.currentCapacity)} sub="Cash for all debt payments / month" />
            <StatCard label="Required monthly repayment" value={a.requiredMonthlyRepayment ? formatINR(a.requiredMonthlyRepayment) : "—"} sub="Average debt payment to hit target" />
            <StatCard label="Monthly shortfall" value={Number.isNaN(a.monthlyShortfall) ? "—" : formatINR(a.monthlyShortfall)} tone={a.monthlyShortfall > 0 ? "bad" : "good"} />
            <StatCard label="Additional income required" value={Number.isNaN(a.additionalIncomeRequired) ? "—" : formatINR(a.additionalIncomeRequired)} sub="Per month, if expenses stay the same" />
            <StatCard label="Possible expense reduction" value={formatINR(a.potentialExpenseReduction)} sub={<Link className="underline" href="/expenses">Discretionary budgets</Link>} tone={a.coveredByExpenseCuts ? "good" : "warn"} />
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Realistic alternative dates</CardTitle>
            <CardDescription>What different monthly commitments achieve with your current strategy.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Plan</TableHead><TableHead>Debt-free</TableHead><TableHead className="text-right">Months</TableHead><TableHead>Meets target?</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {a.alternatives.map((alt) => (
                  <TableRow key={alt.label}>
                    <TableCell className="font-medium">{alt.label}</TableCell>
                    <TableCell>{formatMonth(alt.debtFreeMonth, true)}</TableCell>
                    <TableCell className="text-right num">{alt.months ?? "—"}</TableCell>
                    <TableCell>{alt.debtFreeMonth && alt.debtFreeMonth <= target ? <Badge variant="success">Yes</Badge> : <Badge variant="secondary">No</Badge>}</TableCell>
                  </TableRow>
                ))}
                {status === "shortfall" ? (
                  <TableRow>
                    <TableCell className="font-medium">+{formatINR(a.monthlyShortfall)}/month (required)</TableCell>
                    <TableCell>{formatMonth(a.requiredResult?.debtFreeMonth, true)}</TableCell>
                    <TableCell className="text-right num">{a.requiredResult?.monthsToDebtFree}</TableCell>
                    <TableCell><Badge variant="success">Yes</Badge></TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              Try another target:
              {[12, 24, 36, 48].map((n) => {
                const m = addMonths(state.simulationInput.startMonth, n - 1);
                return <Link key={n} href={`/goal?target=${m}`} className="rounded-md border px-2 py-0.5 hover:bg-muted">{formatMonth(m)}</Link>;
              })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Current plan vs required path</CardTitle>
            <CardDescription>Total remaining debt each month.</CardDescription>
          </CardHeader>
          <CardContent>
            <DebtReductionChart data={merged} stacked={false} series={[{ key: "current", name: "Current plan" }, ...(status === "shortfall" ? [{ key: "required", name: "Required for target" }] : [])]} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
