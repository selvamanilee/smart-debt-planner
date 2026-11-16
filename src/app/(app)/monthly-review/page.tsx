import { Suspense } from "react";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/layout/page-header";
import { MonthPicker } from "@/components/shared/month-picker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/notice";
import { GroupedBarChart, MultiLineChart } from "@/components/charts";
import { getDb } from "@/lib/db";
import { financialSnapshots } from "@/lib/db/schema";
import { getExpensesForMonth, getFinancialState, getMonthTransactionsTotals, getSnapshots } from "@/lib/data";
import { isValidMonthKey, monthKey } from "@/lib/finance/dates";
import { simulate } from "@/lib/finance/simulate";
import { formatINR, formatMonth } from "@/lib/format";
import { CloseMonthForm } from "./close-month-form";

export const metadata = { title: "Monthly Review" };

export default async function MonthlyReviewPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const month = isValidMonthKey(sp.month) ? sp.month : monthKey();
  const [state, totals, expenses, snapshots, [snapshot]] = await Promise.all([
    getFinancialState(month),
    getMonthTransactionsTotals(month),
    getExpensesForMonth(month),
    getSnapshots(),
    getDb().select().from(financialSnapshots).where(eq(financialSnapshots.month, month)),
  ]);
  const actualExpenses = expenses.reduce((a, e) => a + Number(e.amount), 0);
  const planned = simulate({ ...state.simulationInput, startMonth: month }).months[0];
  const closed = snapshot?.status === "closed";
  const history = [...snapshots].reverse();

  const actualPaid = totals.emiPaid + totals.extraPaid + totals.cardPaid;
  const compareRows: [string, number, number][] = [
    ["Income", state.cashFlow.totalIncome, closed ? Number(snapshot.salaryReceived) + Number(snapshot.otherIncome) : state.cashFlow.totalIncome],
    ["Expenses", state.cashFlow.plannedExpenses, closed ? Number(snapshot.actualExpenses) : actualExpenses],
    ["Debt payments", planned?.totalPaid ?? 0, closed ? Number(snapshot.emiPaid) + Number(snapshot.extraPaid) + Number(snapshot.cardPaid) : actualPaid],
    ["Interest", planned?.interest ?? 0, closed ? Number(snapshot.interestPaid) : totals.interestPaid],
  ];

  return (
    <>
      <PageHeader
        title="Monthly Review"
        description="Update what actually happened, reconcile balances with statements and lock the month. Closed months are never overwritten."
        actions={<Suspense><MonthPicker month={month} /></Suspense>}
      />

      <div className="grid gap-4 xl:grid-cols-5">
        <div className="space-y-4 xl:col-span-3">
          {closed ? (
            <Notice tone="good" title={`${formatMonth(month, true)} is closed`}>
              Closed on {snapshot.closedAt?.toLocaleDateString("en-IN")}. Debt went from {formatINR(snapshot.openingDebt)} to {formatINR(snapshot.closingDebt)} (principal reduced by {formatINR(snapshot.principalReduction)}). Projected debt-free: {formatMonth(snapshot.projectedDebtFreeMonth, true)}.
            </Notice>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Update {formatMonth(month, true)}</CardTitle>
                <CardDescription>
                  Payments recorded this month: EMIs/interest {formatINR(totals.emiPaid)}, extra {formatINR(totals.extraPaid)}, card {formatINR(totals.cardPaid)}.{" "}
                  Record missing payments on <Link className="underline" href="/loans">My Loans</Link> or <Link className="underline" href="/credit-cards">Credit Cards</Link> first, then enter statement balances below.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CloseMonthForm
                  month={month}
                  defaults={{
                    salaryReceived: state.profile.monthlySalary,
                    otherIncome: String(state.cashFlow.otherIncome),
                    savingsBalance: state.profile.currentSavings,
                    actualExpenses: actualExpenses.toFixed(2),
                  }}
                  debts={[
                    ...state.cards.filter((c) => c.status === "active").map((c) => ({ key: `card:${c.id}`, name: c.name, balance: c.outstandingBalance })),
                    ...state.loans.filter((l) => l.status === "active").map((l) => ({ key: `loan:${l.id}`, name: l.name, balance: l.outstandingPrincipal })),
                  ]}
                />
              </CardContent>
            </Card>
          )}

          {closed ? (
            <Card>
              <CardHeader><CardTitle>Balances at month end</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Debt</TableHead><TableHead className="text-right">Opening</TableHead><TableHead className="text-right">Closing</TableHead><TableHead className="text-right">Reduced by</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {Object.entries(snapshot.debtBalances).map(([k, b]) => (
                      <TableRow key={k}>
                        <TableCell className="font-medium">{b.name}</TableCell>
                        <TableCell className="text-right num">{formatINR(b.opening)}</TableCell>
                        <TableCell className="text-right num">{formatINR(b.closing)}</TableCell>
                        <TableCell className="text-right num">{formatINR(b.opening - b.closing)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {snapshot.notes ? <p className="mt-3 text-sm text-muted-foreground">Notes: {snapshot.notes}</p> : null}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Planned vs actual</CardTitle>
            <CardDescription>Plan = projection for {formatMonth(month)} from your saved settings.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Planned</TableHead><TableHead className="text-right">Actual</TableHead><TableHead className="text-right">Diff</TableHead></TableRow></TableHeader>
              <TableBody>
                {compareRows.map(([label, p, a]) => (
                  <TableRow key={label}>
                    <TableCell className="font-medium">{label}</TableCell>
                    <TableCell className="text-right num">{formatINR(p)}</TableCell>
                    <TableCell className="text-right num">{formatINR(a)}</TableCell>
                    <TableCell className="text-right num">{formatINR(a - p)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4">
              <GroupedBarChart data={compareRows.map(([name, planned, actual]) => ({ name, planned, actual }))} series={[{ key: "planned", name: "Planned" }, { key: "actual", name: "Actual" }]} height={220} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Every closed month is kept as an immutable snapshot.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {history.length > 1 ? (
            <MultiLineChart data={history.map((h) => ({ month: h.month, debt: Number(h.closingDebt), expenses: Number(h.actualExpenses), savings: Number(h.savingsBalance) }))} series={[{ key: "debt", name: "Closing debt" }, { key: "expenses", name: "Actual expenses" }, { key: "savings", name: "Savings" }]} />
          ) : null}
          {snapshots.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No months closed yet. Close your first month above to start building history.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead><TableHead className="text-right">Income</TableHead><TableHead className="text-right">Expenses (actual / plan)</TableHead><TableHead className="text-right">Debt paid</TableHead><TableHead className="text-right">Interest</TableHead><TableHead className="text-right">Principal reduced</TableHead><TableHead className="text-right">Closing debt</TableHead><TableHead>Projected debt-free</TableHead><TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshots.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium"><Link className="underline-offset-2 hover:underline" href={`/monthly-review?month=${h.month}`}>{formatMonth(h.month, true)}</Link></TableCell>
                    <TableCell className="text-right num">{formatINR(Number(h.salaryReceived) + Number(h.otherIncome))}</TableCell>
                    <TableCell className="text-right num">{formatINR(h.actualExpenses)} / {formatINR(h.plannedExpenses)}</TableCell>
                    <TableCell className="text-right num">{formatINR(Number(h.emiPaid) + Number(h.extraPaid) + Number(h.cardPaid))}</TableCell>
                    <TableCell className="text-right num">{formatINR(h.interestPaid)}</TableCell>
                    <TableCell className="text-right num">{formatINR(h.principalReduction)}</TableCell>
                    <TableCell className="text-right num">{formatINR(h.closingDebt)}</TableCell>
                    <TableCell>{formatMonth(h.projectedDebtFreeMonth, true)}</TableCell>
                    <TableCell><Badge variant={h.status === "closed" ? "success" : "secondary"}>{h.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
