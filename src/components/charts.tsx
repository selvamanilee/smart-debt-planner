"use client";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatINR, formatINRCompact, formatMonth } from "@/lib/format";

export const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];

const axisProps = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

function TooltipBox({ active, payload, label, labelFormatter }: { active?: boolean; payload?: { name?: string; value?: number; color?: string }[]; label?: string | number; labelFormatter?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      {label !== undefined ? <div className="mb-1 font-medium">{labelFormatter ? labelFormatter(String(label)) : label}</div> : null}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto pl-3 font-medium num">{formatINR(p.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

function Empty({ text = "No data yet" }: { text?: string }) {
  return <div className="grid h-full min-h-40 place-items-center text-sm text-muted-foreground">{text}</div>;
}

export function DebtBalanceBar({ data, height = 260 }: { data: { name: string; balance: number }[]; height?: number }) {
  if (!data.length) return <Empty text="No outstanding debts 🎉" />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis type="number" {...axisProps} tickFormatter={(v) => formatINRCompact(v)} />
        <YAxis type="category" dataKey="name" {...axisProps} width={96} />
        <Tooltip content={<TooltipBox />} cursor={{ fill: "var(--muted)" }} />
        <Bar dataKey="balance" name="Outstanding" radius={[0, 6, 6, 0]} maxBarSize={28}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, height = 260 }: { data: { name: string; value: number }[]; height?: number }) {
  const filtered = data.filter((d) => d.value > 0);
  if (!filtered.length) return <Empty text="No expenses recorded" />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={filtered} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="var(--card)">
          {filtered.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<TooltipBox />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function CashFlowBar({ data, height = 260 }: { data: { name: string; value: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 0, right: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="name" {...axisProps} interval={0} fontSize={10} />
        <YAxis {...axisProps} tickFormatter={(v) => formatINRCompact(v)} width={56} />
        <Tooltip content={<TooltipBox />} cursor={{ fill: "var(--muted)" }} />
        <Bar dataKey="value" name="Amount" radius={[6, 6, 0, 0]} maxBarSize={48}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.value < 0 ? "var(--destructive)" : CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function InterestPrincipalChart({ data, height = 260 }: { data: { month: string; interest: number; principal: number }[]; height?: number }) {
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 0, right: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="month" {...axisProps} tickFormatter={(m) => formatMonth(m)} minTickGap={12} />
        <YAxis {...axisProps} tickFormatter={(v) => formatINRCompact(v)} width={56} />
        <Tooltip content={<TooltipBox labelFormatter={(m) => formatMonth(m, true)} />} cursor={{ fill: "var(--muted)" }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="principal" name="Principal" stackId="a" fill="var(--chart-1)" />
        <Bar dataKey="interest" name="Interest" stackId="a" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DebtReductionChart({
  data,
  series,
  height = 280,
  stacked = true,
}: {
  data: Record<string, number | string>[];
  series: { key: string; name: string }[];
  height?: number;
  stacked?: boolean;
}) {
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ left: 0, right: 8 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`g-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.5} />
              <stop offset="95%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.05} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="month" {...axisProps} tickFormatter={(m) => formatMonth(m)} minTickGap={16} />
        <YAxis {...axisProps} tickFormatter={(v) => formatINRCompact(v)} width={56} />
        <Tooltip content={<TooltipBox labelFormatter={(m) => formatMonth(m, true)} />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stackId={stacked ? "1" : undefined}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            fill={`url(#g-${i})`}
            strokeWidth={2}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function MultiLineChart({ data, series, height = 280 }: { data: Record<string, number | string>[]; series: { key: string; name: string }[]; height?: number }) {
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: 0, right: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="month" {...axisProps} tickFormatter={(m) => formatMonth(m)} minTickGap={16} />
        <YAxis {...axisProps} tickFormatter={(v) => formatINRCompact(v)} width={56} />
        <Tooltip content={<TooltipBox labelFormatter={(m) => formatMonth(m, true)} />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function GroupedBarChart({ data, series, xKey = "name", height = 260 }: { data: Record<string, number | string>[]; series: { key: string; name: string }[]; xKey?: string; height?: number }) {
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 0, right: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey={xKey} {...axisProps} tickFormatter={(v) => (/^\d{4}-\d{2}$/.test(String(v)) ? formatMonth(String(v)) : String(v))} />
        <YAxis {...axisProps} tickFormatter={(v) => formatINRCompact(v)} width={56} />
        <Tooltip content={<TooltipBox labelFormatter={(v) => (/^\d{4}-\d{2}$/.test(v) ? formatMonth(v, true) : v)} />} cursor={{ fill: "var(--muted)" }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={36} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
