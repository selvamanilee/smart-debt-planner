import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "default" | "good" | "warn" | "bad";
  className?: string;
}) {
  const toneCls = {
    default: "bg-muted text-muted-foreground",
    good: "bg-success/15 text-success",
    warn: "bg-warning/15 text-warning",
    bad: "bg-destructive/12 text-destructive",
  }[tone];
  return (
    <Card className={cn("gap-2 py-4", className)}>
      <div className="flex items-start justify-between gap-3 px-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        {Icon ? (
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", toneCls)}>
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <div className="px-4">
        <div className="text-2xl font-semibold tracking-tight num">{value}</div>
        {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
      </div>
    </Card>
  );
}
