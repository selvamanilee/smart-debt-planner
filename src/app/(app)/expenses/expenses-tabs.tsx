"use client";
import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArchiveRestoreIcon, PencilIcon, PlusIcon, RepeatIcon, Trash2Icon, UploadIcon } from "lucide-react";
import {
  applyRecurringAction,
  deleteCategoryAction,
  deleteExpenseAction,
  importExpensesCsvAction,
  saveCategoryAction,
  saveExpenseAction,
  saveMonthBudgetsAction,
} from "@/app/actions/finance";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { FormDialog, ActionForm } from "@/components/forms/form-dialog";
import { CheckboxField, Field, MoneyField, SelectField, SubmitButton, useActionToast } from "@/components/forms/form-kit";
import { ActionButton } from "@/components/forms/action-button";
import { GroupedBarChart } from "@/components/charts";
import { formatDate, formatINR, formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";

type BudgetRow = { id: number; name: string; budget: string; defaultBudget: string; hasOverride: boolean; essential: boolean; actual: number };
type Tx = { id: number; categoryId: number; category: string; date: string; amount: string; description: string; kind: string; source: string };
type Cat = { id: number; name: string; defaultBudget: string; essential: boolean; archived: boolean; isDefault: boolean };

export function ExpensesTabs({ month, budgets, transactions, categories, yearly, year }: { month: string; budgets: BudgetRow[]; transactions: Tx[]; categories: Cat[]; yearly: Record<string, Record<string, number>>; year: string }) {
  const active = categories.filter((c) => !c.archived);
  return (
    <Tabs defaultValue="budget">
      <TabsList>
        <TabsTrigger value="budget">Budget vs actual</TabsTrigger>
        <TabsTrigger value="transactions">Transactions</TabsTrigger>
        <TabsTrigger value="categories">Categories</TabsTrigger>
        <TabsTrigger value="yearly">Yearly</TabsTrigger>
        <TabsTrigger value="import">Import CSV</TabsTrigger>
      </TabsList>
      <TabsContent value="budget"><BudgetTab month={month} budgets={budgets} /></TabsContent>
      <TabsContent value="transactions"><TransactionsTab month={month} transactions={transactions} categories={active} /></TabsContent>
      <TabsContent value="categories"><CategoriesTab categories={categories} /></TabsContent>
      <TabsContent value="yearly"><YearlyTab yearly={yearly} year={year} /></TabsContent>
      <TabsContent value="import"><ImportTab /></TabsContent>
    </Tabs>
  );
}

function BudgetTab({ month, budgets }: { month: string; budgets: BudgetRow[] }) {
  const totalBudget = budgets.reduce((a, b) => a + Number(b.budget), 0);
  const totalActual = budgets.reduce((a, b) => a + b.actual, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Budget vs actual · {formatMonth(month, true)}</CardTitle>
        <CardDescription>Edit budgets for this month only, or tick “apply as default” to change every month without a specific budget.</CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={saveMonthBudgetsAction}>
          {(e) => (
            <>
              <input type="hidden" name="month" value={month} />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="w-40">Budget (₹)</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                    <TableHead className="w-40">Usage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {budgets.map((b) => {
                    const budget = Number(b.budget);
                    const diff = budget - b.actual;
                    const pct = budget > 0 ? (b.actual / budget) * 100 : b.actual > 0 ? 100 : 0;
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">
                          {b.name}{" "}
                          {!b.essential ? <Badge variant="secondary" className="ml-1">Discretionary</Badge> : null}
                          {b.hasOverride ? <Badge variant="outline" className="ml-1">Month-specific</Badge> : null}
                        </TableCell>
                        <TableCell>
                          <Input name={`budget_${b.id}`} defaultValue={b.budget} inputMode="decimal" aria-label={`${b.name} budget`} aria-invalid={e[`budget_${b.id}`] ? true : undefined} className="h-8" />
                        </TableCell>
                        <TableCell className="text-right num">{formatINR(b.actual)}</TableCell>
                        <TableCell className={cn("text-right num", diff < 0 && "font-medium text-destructive")}>{diff < 0 ? `Over ${formatINR(-diff)}` : formatINR(diff)}</TableCell>
                        <TableCell><Progress value={pct} indicatorClassName={pct > 100 ? "bg-destructive" : pct > 85 ? "bg-warning" : undefined} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell>Total</TableCell>
                    <TableCell className="num">{formatINR(totalBudget)}</TableCell>
                    <TableCell className="text-right num">{formatINR(totalActual)}</TableCell>
                    <TableCell className={cn("text-right num", totalActual > totalBudget && "text-destructive")}>{formatINR(totalBudget - totalActual)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <SubmitButton>Save budgets</SubmitButton>
                <CheckboxField name="applyAsDefault" label="Apply as default for all months" />
              </div>
            </>
          )}
        </ActionForm>
      </CardContent>
    </Card>
  );
}

function ExpenseDialog({ month, categories, tx }: { month: string; categories: Cat[]; tx?: Tx }) {
  const today = new Date().toISOString().slice(0, 10);
  const defDate = tx?.date ?? (today.startsWith(month) ? today : `${month}-01`);
  return (
    <FormDialog
      title={tx ? "Edit expense" : "Record expense"}
      action={saveExpenseAction}
      trigger={tx ? <Button variant="ghost" size="icon-sm" title="Edit" aria-label="Edit expense"><PencilIcon /></Button> : <Button><PlusIcon /> Record expense</Button>}
    >
      {(e) => (
        <>
          {tx ? <input type="hidden" name="id" value={tx.id} /> : null}
          <SelectField name="categoryId" label="Category" defaultValue={String(tx?.categoryId ?? categories[0]?.id ?? "")} options={categories.map((c) => ({ value: String(c.id), label: c.name }))} error={e.categoryId} />
          <div className="grid grid-cols-2 gap-3">
            <Field name="date" label="Date" type="date" defaultValue={defDate} error={e.date} required />
            <MoneyField name="amount" label="Amount (₹)" defaultValue={tx?.amount} error={e.amount} required />
          </div>
          <Field name="description" label="Description" defaultValue={tx?.description} error={e.description} />
          <SelectField name="kind" label="Type" defaultValue={tx?.kind ?? "one_time"} options={[{ value: "one_time", label: "One-time" }, { value: "recurring", label: "Recurring (copy to future months)" }]} />
          <SubmitButton>{tx ? "Save changes" : "Record expense"}</SubmitButton>
        </>
      )}
    </FormDialog>
  );
}

function TransactionsTab({ month, transactions, categories }: { month: string; transactions: Tx[]; categories: Cat[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Actual expenses · {formatMonth(month, true)}</CardTitle>
        <CardDescription>Record what you actually spent. Recurring entries can be copied into the next month in one click.</CardDescription>
        <div className="mt-2 flex flex-wrap gap-2">
          <ExpenseDialog month={month} categories={categories} />
          <ActionButton action={() => applyRecurringAction(month)} variant="outline" size="default">
            <RepeatIcon /> Copy recurring from previous month
          </ActionButton>
        </div>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No expenses recorded for this month yet. Record your first expense to compare against budget.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{formatDate(t.date)}</TableCell>
                  <TableCell>{t.category}</TableCell>
                  <TableCell className="max-w-64 truncate">{t.description || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={t.kind === "recurring" ? "default" : "secondary"}>{t.kind === "recurring" ? "Recurring" : "One-time"}</Badge>
                    {t.source === "csv" ? <Badge variant="outline" className="ml-1">CSV</Badge> : null}
                  </TableCell>
                  <TableCell className="text-right num">{formatINR(t.amount, { decimals: true })}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <ExpenseDialog month={month} categories={categories} tx={t} />
                      <ActionButton action={() => deleteExpenseAction(t.id)} confirm={`Delete this ${formatINR(t.amount)} expense?`} variant="ghost" size="icon-sm" title="Delete expense">
                        <Trash2Icon />
                      </ActionButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function CategoryDialog({ cat }: { cat?: Cat }) {
  return (
    <FormDialog
      title={cat ? (cat.archived ? "Restore category" : "Edit category") : "Add category"}
      action={saveCategoryAction}
      trigger={cat ? <Button variant="ghost" size="icon-sm" title={cat.archived ? "Restore" : "Edit"} aria-label={`Edit ${cat.name}`}>{cat.archived ? <ArchiveRestoreIcon /> : <PencilIcon />}</Button> : <Button><PlusIcon /> Add category</Button>}
    >
      {(e) => (
        <>
          {cat ? <input type="hidden" name="id" value={cat.id} /> : null}
          <Field name="name" label="Name" defaultValue={cat?.name} error={e.name} required />
          <MoneyField name="defaultBudget" label="Default monthly budget (₹)" defaultValue={cat?.defaultBudget ?? "0"} error={e.defaultBudget} />
          <CheckboxField name="isEssential" label="Essential expense" hint="Non-essential (discretionary) budgets are suggested first when you need to cut spending." defaultChecked={cat?.essential ?? false} />
          <SubmitButton>{cat ? "Save" : "Add category"}</SubmitButton>
        </>
      )}
    </FormDialog>
  );
}

function CategoriesTab({ categories }: { categories: Cat[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Expense categories</CardTitle>
        <CardDescription>Add as many as you like. Categories with recorded expenses are archived instead of deleted, so history is never lost.</CardDescription>
        <div className="mt-2"><CategoryDialog /></div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead className="text-right">Default budget</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((c) => (
              <TableRow key={c.id} className={c.archived ? "opacity-60" : undefined}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{c.essential ? "Essential" : "Discretionary"}</TableCell>
                <TableCell className="text-right num">{formatINR(c.defaultBudget)}</TableCell>
                <TableCell>{c.archived ? <Badge variant="secondary">Archived</Badge> : <Badge variant="success">Active</Badge>}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <CategoryDialog cat={c} />
                    {!c.archived ? (
                      <ActionButton action={() => deleteCategoryAction(c.id)} confirm={`Delete category "${c.name}"?`} variant="ghost" size="icon-sm" title={`Delete ${c.name}`}>
                        <Trash2Icon />
                      </ActionButton>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function YearlyTab({ yearly, year }: { yearly: Record<string, Record<string, number>>; year: string }) {
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const cats = [...new Set(Object.values(yearly).flatMap((m) => Object.keys(m)))].sort();
  const totals = months.map((m) => ({ month: m, total: Object.values(yearly[m] ?? {}).reduce((a, b) => a + b, 0) }));
  const yearTotal = totals.reduce((a, t) => a + t.total, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Yearly expenses · {year}</CardTitle>
        <CardDescription>Total {formatINR(yearTotal)} · monthly average {formatINR(yearTotal / Math.max(1, totals.filter((t) => t.total > 0).length))}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <GroupedBarChart data={totals.map((t) => ({ name: t.month, total: t.total }))} series={[{ key: "total", name: "Actual expenses" }]} />
        {cats.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                {months.map((m) => <TableHead key={m} className="text-right">{formatMonth(m).slice(0, 3)}</TableHead>)}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cats.map((c) => (
                <TableRow key={c}>
                  <TableCell className="font-medium">{c}</TableCell>
                  {months.map((m) => <TableCell key={m} className="text-right num">{yearly[m]?.[c] ? formatINR(yearly[m][c]) : "—"}</TableCell>)}
                  <TableCell className="text-right font-medium num">{formatINR(months.reduce((a, m) => a + (yearly[m]?.[c] ?? 0), 0))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : <p className="text-sm text-muted-foreground">No expenses recorded this year.</p>}
      </CardContent>
    </Card>
  );
}

function ImportTab() {
  const [state, action] = useActionState(importExpensesCsvAction, null);
  const router = useRouter();
  const [, start] = useTransition();
  useActionToast(state, () => start(() => router.refresh()));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Import expenses from CSV</CardTitle>
        <CardDescription>
          Header row required: <code>date,category,amount,description,type</code>. Dates as YYYY-MM-DD or DD/MM/YYYY. Unknown categories are created automatically. <code>type</code> is optional (recurring / one_time).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="csv" className="mb-1.5 block text-sm font-medium">CSV file</label>
            <Input id="csv" type="file" name="file" accept=".csv,text/csv" required />
          </div>
          <SubmitButton><UploadIcon /> Import</SubmitButton>
        </form>
        {state?.message ? <p className={cn("mt-3 text-sm", state.ok ? "text-success" : "text-destructive")}>{state.message}</p> : null}
        <pre className="mt-4 overflow-x-auto rounded-lg bg-muted p-3 text-xs">{`date,category,amount,description,type
2026-11-02,Food,2450.50,Groceries,one_time
05/11/2026,Rent,8000,House rent,recurring`}</pre>
        <Button variant="link" className="px-0" onClick={() => toast.info("Tip: export from your bank app, keep the columns above, and save as CSV.")}>How do I get a CSV?</Button>
      </CardContent>
    </Card>
  );
}
