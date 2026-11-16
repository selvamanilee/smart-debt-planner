"use client";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, RotateCcwIcon, SaveIcon, Trash2Icon, XIcon, BookmarkPlusIcon, FileCheck2Icon } from "lucide-react";
import { simulate, compareStrategies, STRATEGY_LABELS, type SimEvent, type SimulationInput, type SimulationResult, type Strategy } from "@/lib/finance/simulate";
import { applyOverrides, presetScenarios, type ScenarioOverrides } from "@/lib/finance/analysis";
import { addMonths, monthDiff } from "@/lib/finance/dates";
import { deletePlanAction, deleteScenarioAction, savePlannerSettingsAction, saveRepaymentPlanAction, saveScenarioAction } from "@/app/actions/planner";
import type { CashFlow } from "@/lib/data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/native-select";
import { Notice } from "@/components/notice";
import { GroupedBarChart, MultiLineChart, DebtReductionChart } from "@/components/charts";
import { formatINR, formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";

type DebtInfo = { key: string; name: string; kind: string; balance: number; rate: number | null; rateLabel: string; emi: number | null; prepay: boolean };
type SavedScenario = { id: number; name: string; description: string | null; overrides: object; createdAt: string };
type SavedPlan = { id: number; name: string; strategy: string; debtFreeMonth: string | null; monthsToDebtFree: number | null; totalInterest: number; isActive: boolean; createdAt: string };

const toNum = (v: string) => {
  const n = Number(String(v).replace(/[,₹\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const EVENT_LABELS: Record<SimEvent["type"], string> = {
  bonus: "One-time bonus (to repayment pool)",
  lump_sum: "Lump-sum payment to a debt",
  settle: "Settle a debt in full",
  income_change: "New monthly income from",
  expense_change: "New monthly expenses from",
  rate_change: "Interest rate change",
};

export function PlannerClient({
  base,
  debts,
  settings,
  cashFlow,
  savingsTarget,
  scenarios,
  plans,
}: {
  base: SimulationInput;
  debts: DebtInfo[];
  settings: { stopSavingsAtTarget: boolean; planStartMonth: string | null };
  cashFlow: CashFlow;
  savingsTarget: number;
  scenarios: SavedScenario[];
  plans: SavedPlan[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [income, setIncome] = useState(String(base.monthlyIncome));
  const [expenses, setExpenses] = useState(String(base.monthlyExpenses));
  const [savings, setSavings] = useState(String(Number(base.plannedSavings)));
  const [extra, setExtra] = useState(String(Number(base.extraMonthlyPayment ?? 0)));
  const [strategy, setStrategy] = useState<Strategy>(base.strategy);
  const [order, setOrder] = useState<string[]>(base.priorityOrder ?? debts.map((d) => d.key));
  const [events, setEvents] = useState<SimEvent[]>([]);
  const [debtOv, setDebtOv] = useState<Record<string, { balance?: string; rate?: string; emi?: string }>>({});
  const [stopAtTarget, setStopAtTarget] = useState(settings.stopSavingsAtTarget);
  const [startMonth, setStartMonth] = useState(base.startMonth);

  const overrides: ScenarioOverrides = useMemo(() => {
    const debtOverrides: ScenarioOverrides["debtOverrides"] = {};
    for (const [k, v] of Object.entries(debtOv)) {
      const o: { balance?: number; rate?: number | null; emi?: number | null } = {};
      if (v.balance !== undefined && v.balance !== "") o.balance = toNum(v.balance);
      if (v.rate !== undefined) o.rate = v.rate === "" ? null : toNum(v.rate);
      if (v.emi !== undefined) o.emi = v.emi === "" ? null : toNum(v.emi);
      if (Object.keys(o).length) debtOverrides[k] = o;
    }
    return {
      monthlyIncome: toNum(income),
      monthlyExpenses: toNum(expenses),
      plannedSavings: toNum(savings),
      extraMonthlyPayment: toNum(extra),
      strategy,
      priorityOrder: order,
      events,
      debtOverrides,
    };
  }, [income, expenses, savings, extra, strategy, order, events, debtOv]);

  const deferred = useDeferredValue(overrides);
  const deferredStart = useDeferredValue(startMonth);
  const deferredStop = useDeferredValue(stopAtTarget);

  const computed = useMemo(() => {
    const input = { ...applyOverrides(base, deferred), startMonth: deferredStart, stopSavingsAtTarget: deferredStop };
    const result = simulate(input);
    const comparison = compareStrategies(input);
    const saved = simulate(base);
    const presets = presetScenarios(input).map((p) => ({ ...p, result: simulate(applyOverrides(input, p.overrides)) }));
    const savedScenarios = scenarios.map((s) => ({ ...s, result: simulate(applyOverrides(base, s.overrides as ScenarioOverrides)) }));
    return { input, result, comparison, saved, presets, savedScenarios };
  }, [base, deferred, deferredStart, deferredStop, scenarios]);

  const { result, comparison, saved } = computed;
  const monthsDelta = result.monthsToDebtFree !== null && saved.monthsToDebtFree !== null ? result.monthsToDebtFree - saved.monthsToDebtFree : null;
  const interestDelta = result.totalInterest - saved.totalInterest;
  const dirty = JSON.stringify(overrides) !== JSON.stringify({ monthlyIncome: Number(base.monthlyIncome), monthlyExpenses: Number(base.monthlyExpenses), plannedSavings: Number(base.plannedSavings), extraMonthlyPayment: Number(base.extraMonthlyPayment ?? 0), strategy: base.strategy, priorityOrder: base.priorityOrder, events: [], debtOverrides: {} }) || startMonth !== base.startMonth || stopAtTarget !== settings.stopSavingsAtTarget;

  const reset = () => {
    setIncome(String(base.monthlyIncome));
    setExpenses(String(base.monthlyExpenses));
    setSavings(String(Number(base.plannedSavings)));
    setExtra(String(Number(base.extraMonthlyPayment ?? 0)));
    setStrategy(base.strategy);
    setOrder(base.priorityOrder ?? debts.map((d) => d.key));
    setEvents([]);
    setDebtOv({});
    setStopAtTarget(settings.stopSavingsAtTarget);
    setStartMonth(base.startMonth);
  };

  const loadOverrides = (o: ScenarioOverrides) => {
    reset();
    if (o.monthlyIncome !== undefined) setIncome(String(o.monthlyIncome));
    if (o.monthlyExpenses !== undefined) setExpenses(String(o.monthlyExpenses));
    if (o.plannedSavings !== undefined) setSavings(String(o.plannedSavings));
    if (o.extraMonthlyPayment !== undefined) setExtra(String(o.extraMonthlyPayment));
    if (o.strategy) setStrategy(o.strategy);
    if (o.priorityOrder) setOrder(o.priorityOrder);
    if (o.events) setEvents(o.events);
    if (o.debtOverrides) {
      const d: typeof debtOv = {};
      for (const [k, v] of Object.entries(o.debtOverrides)) d[k] = { balance: v.balance?.toString(), rate: v.rate === undefined ? undefined : v.rate === null ? "" : String(v.rate), emi: v.emi === undefined ? undefined : v.emi === null ? "" : String(v.emi) };
      setDebtOv(d);
    }
    toast.info("Scenario loaded into the simulator.");
  };

  const run = (fn: () => Promise<{ ok: boolean; message?: string } | null>) =>
    start(async () => {
      const r = await fn();
      if (r?.ok) {
        toast.success(r.message ?? "Saved");
        router.refresh();
      } else toast.error(r?.message ?? "Something went wrong");
    });

  const debtName = (k: string) => debts.find((d) => d.key === k)?.name ?? k;
  const move = (i: number, dir: -1 | 1) => {
    const next = [...order];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    if (strategy !== "priority") setStrategy("priority");
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Summary label="Debt-free" value={result.debtFreeMonth ? formatMonth(result.debtFreeMonth, true) : "Not within 30 yrs"} tone={result.debtFreeMonth ? "good" : "bad"} />
        <Summary label="Months" value={result.monthsToDebtFree ?? "—"} delta={monthsDelta !== null && monthsDelta !== 0 ? `${monthsDelta > 0 ? "+" : ""}${monthsDelta} vs saved plan` : undefined} deltaGood={monthsDelta !== null && monthsDelta < 0} />
        <Summary label="Total interest" value={formatINR(result.totalInterest)} delta={Math.abs(interestDelta) >= 1 ? `${interestDelta > 0 ? "+" : "−"}${formatINR(Math.abs(interestDelta))} vs saved plan` : undefined} deltaGood={interestDelta < 0} />
        <Summary label="Month-1 repayment pool" value={formatINR(result.firstMonthPool)} delta={`${formatINR(result.firstMonthMandatory)} mandatory`} />
        <Summary label="Strategy" value={STRATEGY_LABELS[result.strategy]} delta={result.isEstimate ? "Contains estimates" : "All rates known"} className="col-span-2 lg:col-span-1" />
      </div>
      {result.warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        {/* Inputs */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monthly inputs</CardTitle>
              <CardDescription>Saved: income {formatINR(cashFlow.totalIncome)}, expenses {formatINR(cashFlow.plannedExpenses)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <NumField id="in-income" label="Monthly income (₹)" value={income} onChange={setIncome} />
              <NumField id="in-exp" label="Monthly expenses (₹)" value={expenses} onChange={setExpenses} />
              <NumField id="in-sav" label="Planned savings / month (₹)" value={savings} onChange={setSavings} hint={`Emergency target ${formatINR(savingsTarget)}`} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={stopAtTarget} onChange={(e) => setStopAtTarget(e.target.checked)} />
                Stop saving once the emergency target is reached
              </label>
              <NumField id="in-extra" label="Additional repayment / month (₹)" value={extra} onChange={setExtra} hint="Extra cash committed on top of the surplus (negative holds cash back)" />
              <div className="space-y-1.5">
                <Label htmlFor="in-start">Plan start month</Label>
                <Input id="in-start" type="month" value={startMonth} onChange={(e) => e.target.value && setStartMonth(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Strategy & priority</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Strategy">
                {(["priority", "avalanche", "snowball"] as Strategy[]).map((s) => (
                  <button key={s} role="radio" aria-checked={strategy === s} onClick={() => setStrategy(s)} className={cn("rounded-md px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer", strategy === s ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                    {STRATEGY_LABELS[s]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {strategy === "priority" ? "Extra cash follows your order below." : strategy === "avalanche" ? "Extra cash goes to the highest effective cost first (unknown rates first)." : "Extra cash goes to the smallest balance first."}
              </p>
              <ol className="space-y-1.5">
                {order.map((k, i) => (
                  <li key={k} className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm">
                    <span className="grid size-5 place-items-center rounded bg-muted text-xs font-medium">{i + 1}</span>
                    <span className="flex-1 truncate">{debtName(k)}</span>
                    <Button variant="ghost" size="icon-sm" aria-label={`Move ${debtName(k)} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUpIcon /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Move ${debtName(k)} down`} disabled={i === order.length - 1} onClick={() => move(i, 1)}><ArrowDownIcon /></Button>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <EventsEditor debts={debts} startMonth={startMonth} events={events} setEvents={setEvents} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Debt what-ifs</CardTitle>
              <CardDescription>Temporarily change a balance, rate or EMI. Blank rate = unknown.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {debts.map((d) => (
                <div key={d.key} className="space-y-2">
                  <div className="text-sm font-medium">{d.name} <span className="text-xs font-normal text-muted-foreground">· {d.rateLabel}</span></div>
                  <div className="grid grid-cols-3 gap-2">
                    <Input aria-label={`${d.name} balance`} placeholder={String(d.balance)} inputMode="decimal" value={debtOv[d.key]?.balance ?? ""} onChange={(e) => setDebtOv({ ...debtOv, [d.key]: { ...debtOv[d.key], balance: e.target.value } })} title="Balance" />
                    <Input aria-label={`${d.name} rate %`} placeholder={d.rate === null ? "rate?" : `${d.rate}%`} inputMode="decimal" value={debtOv[d.key]?.rate ?? ""} onChange={(e) => setDebtOv({ ...debtOv, [d.key]: { ...debtOv[d.key], rate: e.target.value === "" ? undefined : e.target.value } })} title="Rate %" />
                    <Input aria-label={`${d.name} EMI`} placeholder={d.emi === null ? "no EMI" : String(d.emi)} inputMode="decimal" disabled={d.kind === "card"} value={debtOv[d.key]?.emi ?? ""} onChange={(e) => setDebtOv({ ...debtOv, [d.key]: { ...debtOv[d.key], emi: e.target.value === "" ? undefined : e.target.value } })} title="EMI" />
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Columns: balance · rate % ({"same period as the debt"}) · EMI</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-2 pt-0">
              <Button disabled={pending} onClick={() => run(() => savePlannerSettingsAction({ strategy, priorityOrder: order, plannedSavings: toNum(savings), extraMonthlyPayment: toNum(extra), stopSavingsAtTarget: stopAtTarget, planStartMonth: startMonth === base.startMonth && !settings.planStartMonth ? null : startMonth }))}>
                <SaveIcon /> Save strategy, priority & savings as default
              </Button>
              <p className="text-xs text-muted-foreground">Income, expenses and debt values are saved on their own pages; events and what-ifs live in scenarios.</p>
              <Button variant="outline" disabled={pending} onClick={() => {
                const name = window.prompt("Scenario name", `Scenario ${new Date().toLocaleDateString("en-IN")}`);
                if (name) run(() => saveScenarioAction({ name, overrides }));
              }}>
                <BookmarkPlusIcon /> Save as scenario
              </Button>
              <Button variant="outline" disabled={pending} onClick={() => {
                const name = window.prompt("Plan name", `${STRATEGY_LABELS[strategy]} plan`);
                if (name) run(() => saveRepaymentPlanAction({ name, overrides, makeActive: true }));
              }}>
                <FileCheck2Icon /> Generate & save repayment plan
              </Button>
              <Button variant="ghost" disabled={!dirty} onClick={reset}><RotateCcwIcon /> Reset to saved data</Button>
            </CardContent>
          </Card>
        </div>

        {/* Results */}
        <div className="min-w-0">
          <Tabs defaultValue="strategies">
            <TabsList>
              <TabsTrigger value="strategies">Strategies</TabsTrigger>
              <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
              <TabsTrigger value="schedule">Month by month</TabsTrigger>
              <TabsTrigger value="balances">Loan-wise</TabsTrigger>
              <TabsTrigger value="allocation">Allocation</TabsTrigger>
              <TabsTrigger value="plans">Saved plans</TabsTrigger>
            </TabsList>
            <TabsContent value="strategies"><StrategiesTab comparison={comparison} current={strategy} /></TabsContent>
            <TabsContent value="scenarios">
              <ScenariosTab
                current={result}
                presets={computed.presets}
                saved={computed.savedScenarios}
                onLoad={loadOverrides}
                onDelete={(id) => run(() => deleteScenarioAction(id))}
              />
            </TabsContent>
            <TabsContent value="schedule"><ScheduleTab result={result} /></TabsContent>
            <TabsContent value="balances"><BalancesTab result={result} /></TabsContent>
            <TabsContent value="allocation"><AllocationTab result={result} /></TabsContent>
            <TabsContent value="plans"><PlansTab plans={plans} onDelete={(id) => run(() => deletePlanAction(id))} /></TabsContent>
          </Tabs>
          <details className="mt-4 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Assumptions used in this projection</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">{result.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
          </details>
        </div>
      </div>
    </div>
  );
}

function Summary({ label, value, delta, deltaGood, tone, className }: { label: string; value: React.ReactNode; delta?: string; deltaGood?: boolean; tone?: "good" | "bad"; className?: string }) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className={cn("mt-1 text-xl font-semibold num", tone === "bad" && "text-destructive")}>{value}</div>
      {delta ? <div className={cn("mt-0.5 text-xs", deltaGood === undefined ? "text-muted-foreground" : deltaGood ? "text-success" : "text-destructive")}>{delta}</div> : null}
    </div>
  );
}

function NumField({ id, label, value, onChange, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function EventsEditor({ debts, startMonth, events, setEvents }: { debts: DebtInfo[]; startMonth: string; events: SimEvent[]; setEvents: (e: SimEvent[]) => void }) {
  const [type, setType] = useState<SimEvent["type"]>("bonus");
  const [month, setMonth] = useState(addMonths(startMonth, 1));
  const [amount, setAmount] = useState("50000");
  const [debtKey, setDebtKey] = useState(debts[0]?.key ?? "");
  const [source, setSource] = useState<"external" | "savings">("external");
  const needsDebt = type === "lump_sum" || type === "settle" || type === "rate_change";
  const needsAmount = type !== "settle";
  const add = () => {
    let e: SimEvent;
    const amt = toNum(amount);
    switch (type) {
      case "bonus": e = { type, month, amount: amt }; break;
      case "income_change": e = { type, month, amount: amt }; break;
      case "expense_change": e = { type, month, amount: amt }; break;
      case "lump_sum": e = { type, month, amount: amt, debtKey, source }; break;
      case "settle": e = { type, month, debtKey, source }; break;
      case "rate_change": e = { type, month, debtKey, rate: amt }; break;
    }
    setEvents([...events, e]);
  };
  const name = (k: string) => debts.find((d) => d.key === k)?.name ?? k;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">One-time events & changes</CardTitle>
        <CardDescription>Bonus, lump-sum prepayments, settlements, salary or rate changes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <NativeSelect aria-label="Event type" value={type} onChange={(e) => setType(e.target.value as SimEvent["type"])}>
          {Object.entries(EVENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </NativeSelect>
        <div className="grid grid-cols-2 gap-2">
          <Input type="month" aria-label="Event month" value={month} min={startMonth} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          {needsAmount ? <Input aria-label={type === "rate_change" ? "New rate %" : "Amount"} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={type === "rate_change" ? "Rate %" : "Amount ₹"} /> : <div />}
        </div>
        {needsDebt ? (
          <NativeSelect aria-label="Debt" value={debtKey} onChange={(e) => setDebtKey(e.target.value)}>
            {debts.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
          </NativeSelect>
        ) : null}
        {type === "lump_sum" || type === "settle" ? (
          <NativeSelect aria-label="Funding source" value={source} onChange={(e) => setSource(e.target.value as "external" | "savings")}>
            <option value="external">Funded by new money (bonus, gift…)</option>
            <option value="savings">Funded from savings</option>
          </NativeSelect>
        ) : null}
        <Button variant="secondary" className="w-full" onClick={add}><PlusIcon /> Add event</Button>
        {events.length ? (
          <ul className="space-y-1.5">
            {events.map((e, i) => (
              <li key={i} className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-xs">
                <Badge variant="secondary">{formatMonth(e.month)}</Badge>
                <span className="flex-1">
                  {e.type === "bonus" && `Bonus ${formatINR(Number(e.amount))}`}
                  {e.type === "lump_sum" && `${formatINR(Number(e.amount))} → ${name(e.debtKey)}${e.source === "savings" ? " (from savings)" : ""}`}
                  {e.type === "settle" && `Settle ${name(e.debtKey)}${e.source === "savings" ? " (from savings)" : ""}`}
                  {e.type === "income_change" && `Income becomes ${formatINR(Number(e.amount))}`}
                  {e.type === "expense_change" && `Expenses become ${formatINR(Number(e.amount))}`}
                  {e.type === "rate_change" && `${name(e.debtKey)} rate → ${e.rate}%`}
                </span>
                <Button variant="ghost" size="icon-sm" aria-label="Remove event" onClick={() => setEvents(events.filter((_, j) => j !== i))}><XIcon /></Button>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StrategiesTab({ comparison, current }: { comparison: ReturnType<typeof compareStrategies>; current: Strategy }) {
  const keys: Strategy[] = ["priority", "avalanche", "snowball"];
  const worst = Math.max(...keys.map((k) => comparison.results[k].totalInterest));
  const lineData = (() => {
    const len = Math.max(...keys.map((k) => comparison.results[k].months.length));
    const first = keys.map((k) => comparison.results[k]).find((r) => r.months.length === len)!;
    return first.months.map((m, i) => ({ month: m.month, ...Object.fromEntries(keys.map((k) => [k, comparison.results[k].months[i]?.closingDebt ?? 0])) }));
  })();
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {keys.map((k) => {
          const r = comparison.results[k];
          return (
            <Card key={k} className={cn(k === current && "ring-2 ring-primary")}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {STRATEGY_LABELS[k]}
                  {comparison.best === k ? <Badge variant="success">Lowest interest</Badge> : null}
                  {k === current ? <Badge>Selected</Badge> : null}
                </CardTitle>
                <CardDescription>{k === "priority" ? "Your manual order" : k === "avalanche" ? "Highest effective cost first" : "Smallest balance first"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div><div className="text-xs text-muted-foreground">Debt-free</div><div className="font-semibold">{formatMonth(r.debtFreeMonth, true)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Months</div><div className="font-semibold num">{r.monthsToDebtFree ?? "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground">Total interest</div><div className="font-semibold num">{formatINR(r.totalInterest)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Saves vs worst</div><div className="font-semibold text-success num">{formatINR(worst - r.totalInterest)}</div></div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Order & closure</div>
                  <ol className="mt-1 space-y-0.5">
                    {r.order.map((key, i) => {
                      const d = r.debts.find((x) => x.key === key)!;
                      return <li key={key} className="flex justify-between gap-2"><span>{i + 1}. {d.name}</span><span className="text-muted-foreground">{formatMonth(d.closureMonth)}</span></li>;
                    })}
                  </ol>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Strategy differences</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Compared</TableHead><TableHead className="text-right">Interest difference</TableHead><TableHead className="text-right">Months difference</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {[["avalanche", "priority"], ["snowball", "priority"], ["avalanche", "snowball"]].map(([a, b]) => {
                const ra = comparison.results[a as Strategy];
                const rb = comparison.results[b as Strategy];
                const di = ra.totalInterest - rb.totalInterest;
                const dm = ra.monthsToDebtFree !== null && rb.monthsToDebtFree !== null ? ra.monthsToDebtFree - rb.monthsToDebtFree : null;
                return (
                  <TableRow key={a + b}>
                    <TableCell>{STRATEGY_LABELS[a as Strategy]} vs {STRATEGY_LABELS[b as Strategy]}</TableCell>
                    <TableCell className={cn("text-right num", di < 0 ? "text-success" : di > 0 ? "text-destructive" : "")}>{di === 0 ? "Same" : `${di < 0 ? "Saves" : "Costs"} ${formatINR(Math.abs(di))}`}</TableCell>
                    <TableCell className="text-right num">{dm === null ? "—" : dm === 0 ? "Same" : `${dm > 0 ? "+" : ""}${dm}`}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="mt-4">
            <MultiLineChart data={lineData} series={keys.map((k) => ({ key: k, name: STRATEGY_LABELS[k] }))} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ScenariosTab({
  current,
  presets,
  saved,
  onLoad,
  onDelete,
}: {
  current: SimulationResult;
  presets: { id: string; name: string; description: string; overrides: ScenarioOverrides; result: SimulationResult }[];
  saved: (SavedScenario & { result: SimulationResult })[];
  onLoad: (o: ScenarioOverrides) => void;
  onDelete: (id: number) => void;
}) {
  const all = [...presets.map((p) => ({ ...p, key: p.id, savedId: null as number | null })), ...saved.map((s) => ({ key: `s${s.id}`, name: s.name, description: s.description ?? "Saved scenario", overrides: s.overrides as ScenarioOverrides, result: s.result, savedId: s.id }))];
  const ref = presets[0].result;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scenario comparison</CardTitle>
          <CardDescription>Presets are derived from the inputs on the left. “Current Plan” = your inputs as they are now.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scenario</TableHead>
                <TableHead>Debt-free</TableHead>
                <TableHead className="text-right">Months</TableHead>
                <TableHead className="text-right">Interest</TableHead>
                <TableHead className="text-right">vs Current</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {all.map((s) => {
                const di = s.result.totalInterest - ref.totalInterest;
                return (
                  <TableRow key={s.key}>
                    <TableCell className="whitespace-normal">
                      <div className="font-medium">{s.name}</div>
                      <div className="max-w-80 text-xs text-muted-foreground">{s.description}</div>
                    </TableCell>
                    <TableCell>{formatMonth(s.result.debtFreeMonth, true)}</TableCell>
                    <TableCell className="text-right num">{s.result.monthsToDebtFree ?? "—"}</TableCell>
                    <TableCell className="text-right num">{formatINR(s.result.totalInterest)}</TableCell>
                    <TableCell className={cn("text-right num", di < 0 ? "text-success" : di > 0 ? "text-destructive" : "")}>{Math.abs(di) < 1 ? "—" : `${di < 0 ? "−" : "+"}${formatINR(Math.abs(di))}`}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {s.key !== "current" ? <Button size="sm" variant="outline" onClick={() => onLoad(s.overrides)}>Load</Button> : null}
                        {s.savedId ? <Button size="icon-sm" variant="ghost" aria-label={`Delete ${s.name}`} onClick={() => window.confirm(`Delete scenario "${s.name}"?`) && onDelete(s.savedId!)}><Trash2Icon /></Button> : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="mt-4">
            <GroupedBarChart data={all.map((s) => ({ name: s.name, interest: s.result.totalInterest }))} series={[{ key: "interest", name: "Total interest" }]} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Current projection: {formatMonth(current.debtFreeMonth, true)}, {formatINR(current.totalInterest)} interest.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function ScheduleTab({ result }: { result: SimulationResult }) {
  const t = result.months.reduce((a, m) => ({ income: a.income + m.income, expenses: a.expenses + m.expenses, savings: a.savings + m.savingsContribution, paid: a.paid + m.totalPaid, interest: a.interest + m.interest, principal: a.principal + m.principalPaid }), { income: 0, expenses: 0, savings: 0, paid: 0, interest: 0, principal: 0 });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Month-by-month repayment</CardTitle>
        <CardDescription>Loan payments = EMIs/minimums + extra. Surplus after all debts are cleared goes to savings.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-[640px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Income</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">Savings</TableHead>
                <TableHead className="text-right">Loan payments</TableHead>
                <TableHead className="text-right">Interest</TableHead>
                <TableHead className="text-right">Principal</TableHead>
                <TableHead className="text-right">Closing debt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.months.map((m) => (
                <TableRow key={m.month} className={m.shortfall > 0 ? "bg-destructive/5" : undefined}>
                  <TableCell className="font-medium">{formatMonth(m.month)}{m.bonus ? <Badge variant="success" className="ml-1">+{formatINR(m.bonus)}</Badge> : null}</TableCell>
                  <TableCell className="text-right num">{formatINR(m.income)}</TableCell>
                  <TableCell className="text-right num">{formatINR(m.expenses)}</TableCell>
                  <TableCell className="text-right num">{formatINR(m.savingsContribution + m.surplusToSavings)}</TableCell>
                  <TableCell className="text-right num">{formatINR(m.totalPaid)}{m.extraPaid > 0 ? <span className="block text-xs text-muted-foreground">extra {formatINR(m.extraPaid)}</span> : null}</TableCell>
                  <TableCell className="text-right num">{formatINR(m.interest)}</TableCell>
                  <TableCell className="text-right num">{formatINR(m.principalPaid)}</TableCell>
                  <TableCell className="text-right font-medium num">{formatINR(m.closingDebt)}{m.shortfall > 0 ? <span className="block text-xs text-destructive">short {formatINR(m.shortfall)}</span> : null}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className="text-right num">{formatINR(t.income)}</TableCell>
                <TableCell className="text-right num">{formatINR(t.expenses)}</TableCell>
                <TableCell className="text-right num">{formatINR(t.savings)}</TableCell>
                <TableCell className="text-right num">{formatINR(t.paid)}</TableCell>
                <TableCell className="text-right num">{formatINR(t.interest)}</TableCell>
                <TableCell className="text-right num">{formatINR(t.principal)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function BalancesTab({ result }: { result: SimulationResult }) {
  const series = result.debts.map((d) => ({ key: d.key, name: d.name }));
  const data = result.months.map((m) => ({ month: m.month, ...Object.fromEntries(result.debts.map((d) => [d.key, m.debts[d.key]?.closing ?? 0])) }));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Loan-wise month-end balances</CardTitle>
        <CardDescription>Closing balance of every debt for each month.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <DebtReductionChart data={data} series={series} stacked />
        <div className="max-h-[520px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead>Month</TableHead>
                {result.debts.map((d) => <TableHead key={d.key} className="text-right">{d.name}</TableHead>)}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.months.map((m) => (
                <TableRow key={m.month}>
                  <TableCell className="font-medium">{formatMonth(m.month)}</TableCell>
                  {result.debts.map((d) => {
                    const row = m.debts[d.key];
                    return (
                      <TableCell key={d.key} className={cn("text-right num", row?.closedThisMonth && "font-semibold text-success")}>
                        {row ? (row.closedThisMonth ? "Closed ✓" : formatINR(row.closing)) : "—"}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right font-medium num">{formatINR(m.closingDebt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Debt</TableHead><TableHead className="text-right">Starting balance</TableHead><TableHead className="text-right">Interest</TableHead><TableHead className="text-right">Charges</TableHead><TableHead className="text-right">Total paid</TableHead><TableHead>Closes</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {result.debts.map((d) => (
              <TableRow key={d.key}>
                <TableCell className="font-medium">{d.name}{d.interestEstimated ? <Badge variant="warning" className="ml-1">rate unknown</Badge> : null}</TableCell>
                <TableCell className="text-right num">{formatINR(d.startBalance)}</TableCell>
                <TableCell className="text-right num">{formatINR(d.totalInterest)}</TableCell>
                <TableCell className="text-right num">{formatINR(d.totalCharges)}</TableCell>
                <TableCell className="text-right num">{formatINR(d.totalPaid)}</TableCell>
                <TableCell>{formatMonth(d.closureMonth, true)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AllocationTab({ result }: { result: SimulationResult }) {
  const [idx, setIdx] = useState(0);
  const m = result.months[Math.min(idx, result.months.length - 1)];
  if (!m) return null;
  const rows = Object.values(m.debts);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Monthly payment allocation</CardTitle>
        <CardDescription>How each month&apos;s repayment pool is split between debts.</CardDescription>
        <div className="mt-2 flex items-center gap-2">
          <Label htmlFor="alloc-month">Month</Label>
          <NativeSelect id="alloc-month" className="w-48" value={idx} onChange={(e) => setIdx(Number(e.target.value))}>
            {result.months.map((x, i) => <option key={x.month} value={i}>{formatMonth(x.month, true)}</option>)}
          </NativeSelect>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Mini label="Repayment pool" value={formatINR(m.repaymentPool)} />
          <Mini label="Mandatory" value={formatINR(m.mandatoryPaid)} />
          <Mini label="Extra" value={formatINR(m.extraPaid)} />
          <Mini label="To savings" value={formatINR(m.savingsContribution + m.surplusToSavings)} />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Debt</TableHead>
              <TableHead className="text-right">Opening</TableHead>
              <TableHead className="text-right">Interest</TableHead>
              <TableHead className="text-right">EMI / minimum</TableHead>
              <TableHead className="text-right">Extra</TableHead>
              <TableHead className="text-right">Principal reduced</TableHead>
              <TableHead className="text-right">Closing</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((d) => (
              <TableRow key={d.key}>
                <TableCell className="font-medium">{result.debts.find((x) => x.key === d.key)?.name}</TableCell>
                <TableCell className="text-right num">{formatINR(d.opening, { decimals: true })}</TableCell>
                <TableCell className="text-right num">{formatINR(d.interest, { decimals: true })}</TableCell>
                <TableCell className="text-right num">{formatINR(d.minimumPaid, { decimals: true })}</TableCell>
                <TableCell className="text-right num">{d.extraPaid ? formatINR(d.extraPaid, { decimals: true }) : "—"}</TableCell>
                <TableCell className="text-right num">{formatINR(d.principalPaid, { decimals: true })}</TableCell>
                <TableCell className="text-right num">{formatINR(d.closing, { decimals: true })}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/60 p-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold num">{value}</div>
    </div>
  );
}

function PlansTab({ plans, onDelete }: { plans: SavedPlan[]; onDelete: (id: number) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Saved repayment plans</CardTitle>
        <CardDescription>Generated plans are stored with their full month-by-month schedule. Export them from Reports.</CardDescription>
      </CardHeader>
      <CardContent>
        {plans.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No plans saved yet. Use “Generate & save repayment plan”.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Plan</TableHead><TableHead>Strategy</TableHead><TableHead>Debt-free</TableHead><TableHead className="text-right">Interest</TableHead><TableHead>Created</TableHead><TableHead /></TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name} {p.isActive ? <Badge>Active</Badge> : null}</TableCell>
                  <TableCell>{STRATEGY_LABELS[p.strategy as Strategy] ?? p.strategy}</TableCell>
                  <TableCell>{formatMonth(p.debtFreeMonth, true)}{p.debtFreeMonth && monthDiff(p.debtFreeMonth, p.debtFreeMonth) === 0 ? "" : ""}</TableCell>
                  <TableCell className="text-right num">{formatINR(p.totalInterest)}</TableCell>
                  <TableCell>{new Date(p.createdAt).toLocaleDateString("en-IN")}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" asChild><a href={`/api/export/plan?id=${p.id}&format=xlsx`}>Excel</a></Button>
                      <Button size="icon-sm" variant="ghost" aria-label={`Delete ${p.name}`} onClick={() => window.confirm(`Delete plan "${p.name}"?`) && onDelete(p.id)}><Trash2Icon /></Button>
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
