import { Suspense } from "react";
import { FileSpreadsheetIcon, FileTextIcon, SheetIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { MonthPicker } from "@/components/shared/month-picker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { REPORTS, buildReport, type ReportKey } from "@/lib/reports";
import { isValidMonthKey, monthKey } from "@/lib/finance/dates";
import { formatINR } from "@/lib/format";

export const metadata = { title: "Reports" };

const DESCRIPTIONS: Record<Exclude<ReportKey, "plan">, string> = {
  summary: "Income, expenses, EMIs, savings, debt and projected debt-free date.",
  debts: "Every loan and card with balance, rate and EMI.",
  expenses: "Budget vs actual by category plus all transactions for the selected month.",
  interest: "Interest by debt and by month under your current strategy.",
  repayments: "All recorded loan and credit card transactions.",
  cashflow: "Projected monthly income, expenses, savings and loan payments.",
  projection: "Month-by-month debt-free projection with loan-wise balances.",
  strategies: "My Priority vs Avalanche vs Snowball.",
  history: "Closed monthly snapshots.",
};

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ month?: string; view?: string }> }) {
  const sp = await searchParams;
  const month = isValidMonthKey(sp.month) ? sp.month : monthKey();
  const view = (sp.view && sp.view in DESCRIPTIONS ? sp.view : "summary") as Exclude<ReportKey, "plan">;
  const preview = await buildReport(view, new URLSearchParams({ month }));
  const q = (k: string, f: string) => `/api/export/${k}?format=${f}&month=${month}`;
  return (
    <>
      <PageHeader title="Reports" description="Export any report as CSV, Excel or PDF. All figures come from your saved data." actions={<Suspense><MonthPicker month={month} /></Suspense>} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(Object.keys(DESCRIPTIONS) as (keyof typeof DESCRIPTIONS)[]).map((k) => (
          <Card key={k} className={k === view ? "ring-2 ring-primary" : undefined}>
            <CardHeader>
              <CardTitle className="text-base">{REPORTS[k]}</CardTitle>
              <CardDescription>{DESCRIPTIONS[k]}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" asChild><a href={`/reports?view=${k}&month=${month}`}>Preview</a></Button>
              <Button size="sm" variant="outline" asChild><a href={q(k, "csv")}><SheetIcon /> CSV</a></Button>
              <Button size="sm" variant="outline" asChild><a href={q(k, "xlsx")}><FileSpreadsheetIcon /> Excel</a></Button>
              <Button size="sm" variant="outline" asChild><a href={q(k, "pdf")}><FileTextIcon /> PDF</a></Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{preview.title}</CardTitle>
          <CardDescription>{preview.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {preview.sheets.map((sheet) => (
            <div key={sheet.name}>
              {preview.sheets.length > 1 ? <h3 className="mb-2 text-sm font-medium">{sheet.name}</h3> : null}
              <div className="max-h-[480px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>{sheet.columns.map((c, i) => <TableHead key={c} className={sheet.money?.includes(i) ? "text-right" : undefined}>{c}</TableHead>)}</TableRow>
                  </TableHeader>
                  <TableBody>
                    {sheet.rows.length === 0 ? (
                      <TableRow><TableCell colSpan={sheet.columns.length} className="py-6 text-center text-muted-foreground">No data</TableCell></TableRow>
                    ) : (
                      sheet.rows.slice(0, 200).map((r, ri) => (
                        <TableRow key={ri}>
                          {r.map((c, ci) => (
                            <TableCell key={ci} className={sheet.money?.includes(ci) ? "text-right num" : undefined}>
                              {sheet.money?.includes(ci) && typeof c === "number" ? formatINR(c, { decimals: true }) : String(c ?? "")}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
