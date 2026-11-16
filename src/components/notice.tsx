import { AlertTriangleIcon, InfoIcon, CheckCircle2Icon, XCircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const styles = {
  info: { cls: "border-chart-2/30 bg-chart-2/8", icon: InfoIcon, iconCls: "text-chart-2" },
  warn: { cls: "border-warning/40 bg-warning/10", icon: AlertTriangleIcon, iconCls: "text-warning" },
  good: { cls: "border-success/40 bg-success/10", icon: CheckCircle2Icon, iconCls: "text-success" },
  bad: { cls: "border-destructive/40 bg-destructive/8", icon: XCircleIcon, iconCls: "text-destructive" },
};

export function Notice({ tone = "info", title, children, className }: { tone?: keyof typeof styles; title?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  const s = styles[tone];
  const Icon = s.icon;
  return (
    <div role={tone === "bad" ? "alert" : "note"} className={cn("flex gap-3 rounded-lg border p-3 text-sm", s.cls, className)}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", s.iconCls)} />
      <div className="min-w-0 space-y-1">
        {title ? <div className="font-medium">{title}</div> : null}
        {children ? <div className="text-muted-foreground [&_strong]:text-foreground">{children}</div> : null}
      </div>
    </div>
  );
}
