"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addMonths, formatMonth } from "@/lib/finance/dates";

export function MonthPicker({ month, param = "month" }: { month: string; param?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const go = (m: string) => {
    const q = new URLSearchParams(sp.toString());
    q.set(param, m);
    router.push(`${pathname}?${q.toString()}`);
  };
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
      <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => go(addMonths(month, -1))}><ChevronLeftIcon /></Button>
      <input
        type="month"
        aria-label="Select month"
        value={month}
        onChange={(e) => e.target.value && go(e.target.value)}
        className="h-8 rounded-md bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <span className="sr-only">{formatMonth(month, true)}</span>
      <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => go(addMonths(month, 1))}><ChevronRightIcon /></Button>
    </div>
  );
}
