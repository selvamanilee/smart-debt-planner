import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeftIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/notice";
import { ExtraPaymentCalculator } from "@/components/shared/extra-payment-calculator";
import { getDb } from "@/lib/db";
import { loans } from "@/lib/db/schema";
import { debtRateLabel, getLoanTransactions, getSettings, loanToDebt } from "@/lib/data";
import { monthKey } from "@/lib/finance/dates";
import { monthlyInterest } from "@/lib/finance/debt";
import { formatDate, formatINR } from "@/lib/format";
import { LoanDialog, LoanPaymentDialog, ReverseLoanTx } from "../loan-forms";
import { loanFormValues } from "../loan-utils";

const TYPE_LABEL: Record<string, string> = { emi: "EMI", interest_only: "Interest", extra_principal: "Extra principal", charge: "Charge", disbursement: "Top-up", adjustment: "Balance set" };

export default async function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loanId = Number(id);
  if (!Number.isInteger(loanId)) notFound();
  const [loan] = await getDb().select().from(loans).where(eq(loans.id, loanId));
  if (!loan) notFound();
  const [txs, settings] = await Promise.all([getLoanTransactions([loanId]), getSettings()]);
  const debt = loanToDebt(loan);
  const startMonth = settings.planStartMonth ?? monthKey();
  const interest = monthlyInterest(debt, loan.outstandingPrincipal, startMonth);

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link href="/loans"><ArrowLeftIcon /> All loans</Link>
      </Button>
      <PageHeader
        title={loan.name}
        description={`${loan.lender ?? "Lender not set"} · ${debtRateLabel(debt)} · ${loan.interestMethod === "flat" ? "flat rate" : "reducing balance"} · outstanding ${formatINR(loan.outstandingPrincipal)}`}
        actions={
          <>
            <LoanDialog loan={loanFormValues(loan)} />
            {loan.status === "active" ? <LoanPaymentDialog loanId={loan.id} name={loan.name} emi={loan.emi} interestHint={interest ? interest.toNumber() : null} defaultType={loan.emi ? "emi" : "interest_only"} /> : null}
          </>
        }
      />
      {!loan.interestRate ? <Notice tone="warn" className="mb-4" title="Interest rate not configured">Interest-based figures below are excluded until you enter the actual rate.</Notice> : null}
      {loan.notes ? <Notice className="mb-4">{loan.notes}</Notice> : null}

      <div className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3">
          {loan.status === "active" ? <ExtraPaymentCalculator debt={debt} startMonth={startMonth} title="Repayment schedule & extra payment impact" /> : <Notice tone="good" title="This loan is closed" />}
        </div>
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Transaction history</CardTitle>
            <CardDescription>Most recent first. Only the latest entry can be reversed.</CardDescription>
          </CardHeader>
          <CardContent>
            {txs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No transactions recorded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Interest</TableHead>
                    <TableHead className="text-right">Principal</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {txs.map((t, i) => (
                    <TableRow key={t.id}>
                      <TableCell>{formatDate(t.date)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{TYPE_LABEL[t.type] ?? t.type}</Badge>
                        {t.note ? <span className="block max-w-40 truncate text-xs text-muted-foreground">{t.note}</span> : null}
                      </TableCell>
                      <TableCell className="text-right num">{formatINR(t.amount)}</TableCell>
                      <TableCell className="text-right num">{formatINR(t.interestComponent)}</TableCell>
                      <TableCell className="text-right num">{formatINR(t.principalComponent)}</TableCell>
                      <TableCell className="text-right num">{formatINR(t.balanceAfter)}</TableCell>
                      <TableCell>{i === 0 ? <ReverseLoanTx id={t.id} /> : null}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
