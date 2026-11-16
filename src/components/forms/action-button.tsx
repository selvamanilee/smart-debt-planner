"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/validation";

/** Runs a server action with an optional named confirmation (for destructive actions). */
export function ActionButton({
  action,
  confirm,
  children,
  variant = "outline",
  size = "sm",
  title,
  className,
}: {
  action: () => Promise<ActionState>;
  confirm?: string;
  children: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  title?: string;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      title={title}
      aria-label={title}
      className={className}
      disabled={pending}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          const r = await action();
          if (r?.ok) {
            if (r.message) toast.success(r.message);
            router.refresh();
          } else if (r?.message) toast.error(r.message);
        });
      }}
    >
      {children}
    </Button>
  );
}
