"use client";
import { useActionState, useCallback, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useActionToast } from "./form-kit";
import type { ActionState } from "@/lib/validation";

/** Dialog wrapping a server-action form; closes itself on success. */
export function FormDialog({
  trigger,
  title,
  description,
  action,
  children,
  className,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: (errors: Record<string, string>) => React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, null);
  const close = useCallback(() => setOpen(false), []);
  useActionToast(state, close);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={className}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {children(state?.errors ?? {})}
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Inline (non-dialog) action form with toast feedback. */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: (errors: Record<string, string>) => React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  useActionToast(state);
  return (
    <form action={formAction} className={className}>
      {children(state?.errors ?? {})}
    </form>
  );
}
