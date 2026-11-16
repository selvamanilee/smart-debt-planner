import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&>svg]:size-3", {
  variants: {
    variant: {
      default: "border-transparent bg-primary/12 text-primary",
      secondary: "border-transparent bg-secondary text-secondary-foreground",
      destructive: "border-transparent bg-destructive/12 text-destructive",
      warning: "border-transparent bg-warning/15 text-[color-mix(in_oklch,var(--warning),black_35%)] dark:text-warning",
      success: "border-transparent bg-success/15 text-[color-mix(in_oklch,var(--success),black_25%)] dark:text-success",
      outline: "text-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
