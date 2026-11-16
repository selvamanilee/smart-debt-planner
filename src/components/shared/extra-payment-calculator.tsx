"use client";
import { useMemo, useState } from "react";
import type { DebtInput } from "@/lib/finance/debt";
import { debtSchedule, extraPaymentImpact } from "@/lib/finance/analysis";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatINR, formatMonth } from "@/lib/format";

function num(v: string) {
  const n = Number(v.replace(/[,₹\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Runs the deterministic engine in the browser — instant what-if for one debt. */
export function ExtraPaymentCalculator({ debt, startMonth, title = "Extra payment impact" }: { debt: DebtInput; startMonth: string; title?: string }) {
  const [extra, setExtra] = useState("5000");
  const [lump, setLump] = useState("0");
  const [lumpMonth, setLumpMonth] = useState(startMonth);
  const [showAll, setShowAll] = useState(false);

  const { impact, schedule } = useMemo(() => {
    const opts = { startMonth, extraMonthly: num(extra), lumpSums: num(lump) > 0 ? [{ month: lumpMonth, amount: num(lump) }] : [], maxMonths: 600 };
    return { impact: extraPaymentImpact(debt, opts), schedule: debtSchedule(debt, opts) };
  }, [debt, startMonth, extra, lump, lumpMonth]);

  const rows = showAll ? schedule.months : schedule.months.slice(0, 12);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Minimum payment plus your extra amounts, recalculated instantly.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="xp-extra">Extra every month (₹)</Label>
            <Input id="xp-extra" inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="xp-lump">One-time payment (₹)</Label>
            <Input id="xp-lump" inputMode="decimal" value={lump} onChange={(e) => setLump(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="xp-month">One-time payment month</Label>
            <Input id="xp-month" type="month" value={lumpMonth} min={startMonth} onChange={(e) => setLumpMonth(e.target.value || startMonth)} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Compare title="Minimum payments only" months={impact.base.months} interest={impact.base.interest} closure={impact.base.closure} total={impact.base.totalPaid} />
          <Compare title="With extra payments" months={impact.withExtra.months} interest={impact.withExtra.interest} closure={impact.withExtra.closure} total={impact.withExtra.totalPaid} highlight />
        </div>
        <div className="rounded-lg bg-accent/60 p-3 text-sm">
          {impact.base.months === null ? (
            <>With minimum payments only this debt <strong>never closes</strong>. {impact.withExtra.months ? <>Your extra payments close it in <strong>{impact.withExtra.months} months</strong> ({formatMonth(impact.withExtra.closure, true)}).</> : "Increase the extra amount to close it."}</>
          ) : (
            <>
              Interest saved: <strong className="text-success">{formatINR(impact.interestSaved ?? 0)}</strong> · Closes{" "}
              <strong>{impact.monthsSaved ?? 0} months earlier</strong>
            </>
          )}
          {schedule.isEstimate ? <span className="mt-1 block text-xs text-warning">Estimate: {schedule.warnings[0] ?? schedule.assumptions.at(-1)}</span> : null}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Opening</TableHead>
              <TableHead className="text-right">Interest</TableHead>
              <TableHead className="text-right">Payment</TableHead>
              <TableHead className="text-right">Principal</TableHead>
              <TableHead className="text-right">Closing</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => {
              const d = m.debts[debt.key];
              if (!d) return null;
              return (
                <TableRow key={m.month}>
                  <TableCell>{formatMonth(m.month)}</TableCell>
                  <TableCell className="text-right num">{formatINR(d.opening, { decimals: true })}</TableCell>
                  <TableCell className="text-right num">{formatINR(d.interest, { decimals: true })}</TableCell>
                  <TableCell className="text-right num">{formatINR(d.totalPaid, { decimals: true })}</TableCell>
                  <TableCell className="text-right num">{formatINR(d.principalPaid, { decimals: true })}</TableCell>
                  <TableCell className="text-right num">{formatINR(d.closing, { decimals: true })}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {schedule.months.length > 12 ? (
          <Button variant="outline" size="sm" onClick={() => setShowAll((v) => !v)}>{showAll ? "Show first 12 months" : `Show all ${schedule.months.length} months`}</Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Compare({ title, months, interest, closure, total, highlight }: { title: string; months: number | null; interest: number; closure: string | null; total: number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}>
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div><div className="text-xs text-muted-foreground">Closes</div><div className="font-medium">{closure ? formatMonth(closure, true) : "Never"}</div></div>
        <div><div className="text-xs text-muted-foreground">Months</div><div className="font-medium num">{months ?? "—"}</div></div>
        <div><div className="text-xs text-muted-foreground">Interest {months === null ? "(50 yrs)" : ""}</div><div className="font-medium num">{formatINR(interest)}</div></div>
        <div><div className="text-xs text-muted-foreground">Total paid</div><div className="font-medium num">{formatINR(total)}</div></div>
      </div>
    </div>
  );
}
