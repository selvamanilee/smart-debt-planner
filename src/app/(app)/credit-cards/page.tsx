import { CreditCardIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Notice } from "@/components/notice";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExtraPaymentCalculator } from "@/components/shared/extra-payment-calculator";
import { cardToDebt, debtRateLabel, getCardTransactions, getCards, getSettings } from "@/lib/data";
import { debtSchedule } from "@/lib/finance/analysis";
import { monthlyInterest, contractualMinimum } from "@/lib/finance/debt";
import { D } from "@/lib/finance/money";
import { monthKey } from "@/lib/finance/dates";
import { formatDate, formatINR, formatMonth } from "@/lib/format";
import { CardDialog, CardTxDialog, DeleteCard, type CardFormValues } from "./card-forms";

export const metadata = { title: "Credit Cards" };

function NotSet() {
  return <Badge variant="warning">Not configured</Badge>;
}

export default async function CreditCardsPage() {
  const [cards, txs, settings] = await Promise.all([getCards(), getCardTransactions(), getSettings()]);
  const start = settings.planStartMonth ?? monthKey();
  return (
    <>
      <PageHeader title="Credit Cards" description="Revolving balances, minimum dues and settlement simulation." actions={<CardDialog />} />
      {cards.length === 0 ? <p className="text-sm text-muted-foreground">No cards added.</p> : null}
      <div className="space-y-6">
        {cards.map((c) => {
          const debt = cardToDebt(c);
          const interest = monthlyInterest(debt, c.outstandingBalance, start);
          const bal = D(c.outstandingBalance);
          const min = contractualMinimum(debt, interest ?? D(0), D(c.otherFees), bal.plus(interest ?? 0));
          const minOnly = bal.gt(0) ? debtSchedule(debt, { startMonth: start, maxMonths: 600 }) : null;
          const util = c.creditLimit && Number(c.creditLimit) > 0 ? (Number(c.outstandingBalance) / Number(c.creditLimit)) * 100 : null;
          const values: CardFormValues = {
            id: c.id,
            name: c.name,
            bank: c.bank ?? "",
            outstandingBalance: c.outstandingBalance,
            creditLimit: c.creditLimit ?? "",
            interestRate: c.interestRate ? String(Number(c.interestRate)) : "",
            ratePeriod: c.ratePeriod,
            minimumDue: c.minimumDue ?? "",
            billingDay: c.billingDay?.toString() ?? "",
            dueDay: c.dueDay?.toString() ?? "",
            lateCharges: c.lateCharges ?? "",
            otherFees: c.otherFees,
            notes: c.notes ?? "",
          };
          const cardTx = txs.filter((t) => t.cardId === c.id);
          return (
            <div key={c.id} className="grid gap-4 xl:grid-cols-5">
              <Card className="xl:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCardIcon className="size-4" /> {c.name} {c.status === "closed" ? <Badge variant="success">Settled</Badge> : null}
                  </CardTitle>
                  <CardDescription>{c.bank ?? "Bank not set"}</CardDescription>
                  <CardAction>
                    <div className="flex gap-1">
                      <CardDialog card={values} />
                      <DeleteCard id={c.id} name={c.name} />
                    </div>
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Outstanding (revolving) balance</div>
                    <div className="text-3xl font-semibold num">{formatINR(c.outstandingBalance)}</div>
                    {util !== null ? (
                      <div className="mt-2 space-y-1">
                        <Progress value={util} indicatorClassName={util > 70 ? "bg-destructive" : util > 30 ? "bg-warning" : undefined} />
                        <div className="text-xs text-muted-foreground">{util.toFixed(1)}% of {formatINR(c.creditLimit)} limit used</div>
                      </div>
                    ) : null}
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <Row label="Interest rate">{c.interestRate ? debtRateLabel(debt) : <NotSet />}</Row>
                    <Row label="Minimum due">
                      {c.minimumDue ? formatINR(c.minimumDue) : (
                        <>
                          <NotSet /> <span className="block text-xs text-muted-foreground">est. {formatINR(min.amount.toNumber())}</span>
                        </>
                      )}
                    </Row>
                    <Row label="Billing day">{c.billingDay ?? <NotSet />}</Row>
                    <Row label="Due day">{c.dueDay ?? <NotSet />}</Row>
                    <Row label="Credit limit">{c.creditLimit ? formatINR(c.creditLimit) : <NotSet />}</Row>
                    <Row label="Late charges">{c.lateCharges ? formatINR(c.lateCharges) : <NotSet />}</Row>
                    <Row label="Other fees / month">{formatINR(c.otherFees)}</Row>
                    <Row label="Interest this month">{interest ? formatINR(interest.toNumber(), { decimals: true }) : <span className="text-xs text-warning">Needs rate</span>}</Row>
                  </dl>
                  {!c.interestRate && bal.gt(0) ? (
                    <Notice tone="warn" title="Enter the actual interest rate">
                      Interest projections for this card are excluded until the rate from your statement is configured.
                    </Notice>
                  ) : null}
                  {minOnly ? (
                    <div className="rounded-lg bg-accent/60 p-3 text-sm">
                      <div className="font-medium">Full settlement simulation</div>
                      {c.interestRate ? (
                        minOnly.debtFreeMonth ? (
                          <p className="mt-1 text-muted-foreground">
                            Paying only the minimum: clears {formatMonth(minOnly.debtFreeMonth, true)} with <strong>{formatINR(minOnly.totalInterest)}</strong> interest. Settling {formatINR(c.outstandingBalance)} now saves that entire amount.
                          </p>
                        ) : (
                          <p className="mt-1 text-muted-foreground">Paying only the minimum never clears this card. Settle it as early as possible.</p>
                        )
                      ) : (
                        <p className="mt-1 text-muted-foreground">Settling now clears {formatINR(c.outstandingBalance)}. Interest savings can be calculated once the rate is configured.</p>
                      )}
                    </div>
                  ) : null}
                  {c.status === "active" ? <CardTxDialog cardId={c.id} name={c.name} balance={c.outstandingBalance} /> : null}
                </CardContent>
              </Card>
              <div className="space-y-4 xl:col-span-3">
                {bal.gt(0) ? <ExtraPaymentCalculator debt={debt} startMonth={start} title="Payment plan simulator" /> : null}
                <Card>
                  <CardHeader>
                    <CardTitle>Transactions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {cardTx.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No transactions recorded.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Balance after</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {cardTx.map((t) => (
                            <TableRow key={t.id}>
                              <TableCell>{formatDate(t.date)}</TableCell>
                              <TableCell className="capitalize">
                                {t.type}
                                {t.note ? <span className="block text-xs normal-case text-muted-foreground">{t.note}</span> : null}
                              </TableCell>
                              <TableCell className="text-right num">{formatINR(t.amount, { decimals: true })}</TableCell>
                              <TableCell className="text-right num">{formatINR(t.balanceAfter, { decimals: true })}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
