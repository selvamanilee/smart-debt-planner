import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";
import { getFinancialState } from "@/lib/data";
import { formatINR } from "@/lib/format";
import { IncomeDialog, DeleteIncome } from "./income-client";
import Link from "next/link";

export const metadata = { title: "Income" };

const TYPE_LABEL: Record<string, string> = { additional: "Additional", variable: "Variable", freelance: "Freelance", other: "Other" };

export default async function IncomePage() {
  const state = await getFinancialState();
  const cf = state.cashFlow;
  const byType = (t: string) => state.incomeSources.filter((i) => i.active && i.type === t).reduce((a, i) => a + Number(i.amount), 0);
  return (
    <>
      <PageHeader title="Income" description="Salary plus additional, variable, freelance and other monthly income." actions={<IncomeDialog />} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard label="Total monthly income" value={formatINR(cf.totalIncome)} className="col-span-2" />
        <StatCard label="Salary" value={formatINR(cf.salary)} sub={<Link href="/profile" className="underline">Edit in profile</Link>} />
        <StatCard label="Additional" value={formatINR(byType("additional"))} />
        <StatCard label="Variable + Freelance" value={formatINR(byType("variable") + byType("freelance"))} />
        <StatCard label="Other" value={formatINR(byType("other"))} />
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Income sources</CardTitle>
          <CardDescription>Only active sources count toward monthly income and repayment capacity.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Monthly amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Monthly salary</TableCell>
                <TableCell>Salary</TableCell>
                <TableCell className="text-right num">{formatINR(cf.salary)}</TableCell>
                <TableCell><Badge variant="success">Active</Badge></TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">Edit in profile</TableCell>
              </TableRow>
              {state.incomeSources.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">
                    {i.name}
                    {i.notes ? <span className="block text-xs font-normal text-muted-foreground">{i.notes}</span> : null}
                  </TableCell>
                  <TableCell>{TYPE_LABEL[i.type] ?? i.type}</TableCell>
                  <TableCell className="text-right num">{formatINR(i.amount)}</TableCell>
                  <TableCell>{i.active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <IncomeDialog income={{ id: i.id, name: i.name, type: i.type, amount: i.amount, active: i.active, notes: i.notes ?? "" }} />
                      <DeleteIncome id={i.id} name={i.name} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>Total monthly income</TableCell>
                <TableCell className="text-right num">{formatINR(cf.totalIncome)}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          </Table>
          {state.incomeSources.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No other income yet. Add freelance, rental or variable income to see how it speeds up your debt-free date.</p>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
