import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { getFinancialState, loanToDebt, debtRateLabel } from "@/lib/data";
import { debtSchedule } from "@/lib/finance/analysis";
import { monthlyInterest, effectiveAnnualCost } from "@/lib/finance/debt";
import { formatINR, formatMonth } from "@/lib/format";
import { DeleteLoan, LoanDialog, LoanPaymentDialog } from "./loan-forms";
import { loanFormValues } from "./loan-utils";

export const metadata = { title: "My Loans" };

export default async function LoansPage() {
  const state = await getFinancialState();
  const projection = (await import("@/lib/planning")).projectionFor(state);
  const loans = state.loans;
  const active = loans.filter((l) => l.status === "active");
  const totalOutstanding = active.reduce((a, l) => a + Number(l.outstandingPrincipal), 0);
  const totalEmi = state.cashFlow.mandatoryBreakdown.filter((m) => m.key.startsWith("loan:")).reduce((a, m) => a + m.amount, 0);

  return (
    <>
      <PageHeader title="My Loans" description="Every loan keeps its own interest convention. Record payments to keep balances accurate." actions={<LoanDialog />} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active loans" value={active.length} sub={`${loans.length - active.length} closed`} />
        <StatCard label="Outstanding principal" value={formatINR(totalOutstanding)} />
        <StatCard label="Monthly EMIs / interest" value={formatINR(totalEmi)} />
        <StatCard label="Interest this month (est.)" value={formatINR(active.reduce((a, l) => a + (monthlyInterest(loanToDebt(l), l.outstandingPrincipal, state.month)?.toNumber() ?? 0), 0))} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {loans.map((l) => {
          const debt = loanToDebt(l);
          const interest = monthlyInterest(debt, l.outstandingPrincipal, state.month);
          const contractual = l.status === "active" ? debtSchedule(debt, { startMonth: state.simulationInput.startMonth, maxMonths: 600 }) : null;
          const inPlan = projection.debts.find((d) => d.key === debt.key);
          const emi = l.emi ? Number(l.emi) : null;
          const principalPart = emi !== null && interest ? emi - interest.toNumber() : null;
          const cost = effectiveAnnualCost(debt);
          return (
            <Card key={l.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {l.name}
                  {l.status === "closed" ? <Badge variant="success">Closed</Badge> : null}
                  {!l.interestRate ? <Badge variant="warning">Rate not configured</Badge> : null}
                </CardTitle>
                <CardDescription>
                  {[l.lender, l.loanType, l.interestMethod === "flat" ? "Flat rate" : "Reducing balance", debtRateLabel(debt)].filter(Boolean).join(" · ")}
                </CardDescription>
                <CardAction>
                  <div className="flex gap-1">
                    <LoanDialog loan={loanFormValues(l)} compact />
                    <DeleteLoan id={l.id} name={l.name} />
                  </div>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                  <Metric label="Outstanding" value={formatINR(l.outstandingPrincipal)} strong />
                  <Metric label={emi !== null ? "EMI" : "Minimum (interest)"} value={emi !== null ? formatINR(emi) : interest ? formatINR(interest.toNumber()) : "—"} />
                  <Metric label="Monthly interest" value={interest ? formatINR(interest.toNumber()) : "Unknown"} />
                  <Metric label="Principal in EMI" value={principalPart !== null ? formatINR(principalPart) : emi === null ? "Only extra payments" : "—"} />
                  <Metric label="Effective cost" value={cost ? `${cost.toFixed(2)}% p.a.` : "Unknown"} />
                  <Metric label="Remaining tenure" value={l.remainingTenureMonths !== null ? `${l.remainingTenureMonths} months` : "—"} />
                  <Metric label="Remaining interest (EMI only)" value={contractual?.debtFreeMonth ? formatINR(contractual.totalInterest) : contractual ? "Never closes" : "—"} />
                  <Metric label="Total repayment (EMI only)" value={contractual?.debtFreeMonth ? formatINR(contractual.totalPaid) : "—"} />
                  <Metric label="Closure (EMI only)" value={contractual?.debtFreeMonth ? formatMonth(contractual.debtFreeMonth) : contractual ? "No closure" : "—"} />
                </dl>
                {inPlan ? (
                  <div className="rounded-lg bg-accent/60 p-3 text-sm">
                    With your repayment plan: closes <strong>{formatMonth(inPlan.closureMonth, true)}</strong>, interest {formatINR(inPlan.totalInterest)}
                    {contractual?.debtFreeMonth && contractual.totalInterest > inPlan.totalInterest ? (
                      <span className="text-success"> · saves {formatINR(contractual.totalInterest - inPlan.totalInterest)} vs EMI only</span>
                    ) : null}
                  </div>
                ) : null}
                {l.remainingTenureMonths && contractual?.monthsToDebtFree && Math.abs(contractual.monthsToDebtFree - l.remainingTenureMonths) > 1 ? (
                  <p className="text-xs text-warning">
                    Calculated closure takes {contractual.monthsToDebtFree} months vs stated tenure {l.remainingTenureMonths}. Check the rate, EMI or balance against your lender statement.
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {l.status === "active" ? (
                    <LoanPaymentDialog loanId={l.id} name={l.name} emi={l.emi} interestHint={interest ? interest.toNumber() : null} defaultType={emi !== null ? "emi" : "interest_only"} />
                  ) : null}
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/loans/${l.id}`}>Schedule & history <ArrowRightIcon /></Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {loans.length === 0 ? <p className="mt-6 text-center text-sm text-muted-foreground">No loans yet. Add your first loan to start planning.</p> : null}
    </>
  );
}

function Metric({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={strong ? "text-base font-semibold num" : "font-medium num"}>{value}</dd>
    </div>
  );
}
