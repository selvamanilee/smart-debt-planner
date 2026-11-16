"use client";
import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { ActionState } from "@/lib/validation";
import { cn } from "@/lib/utils";

export function SubmitButton({ children, className, variant, size }: { children: React.ReactNode; className?: string; variant?: React.ComponentProps<typeof Button>["variant"]; size?: React.ComponentProps<typeof Button>["size"] }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className={className} variant={variant} size={size}>
      {pending ? <Loader2Icon className="animate-spin" /> : null}
      {children}
    </Button>
  );
}

/** Toast the result of a server action once per state change. */
export function useActionToast(state: ActionState, onSuccess?: () => void) {
  const last = useRef<ActionState>(null);
  useEffect(() => {
    if (!state || state === last.current) return;
    last.current = state;
    if (state.ok) {
      if (state.message) toast.success(state.message);
      onSuccess?.();
    } else if (state.message) {
      toast.error(state.message);
    }
  }, [state, onSuccess]);
}

type FieldProps = {
  name: string;
  label: string;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
} & Omit<React.ComponentProps<"input">, "name">;

export function Field({ name, label, hint, error, className, id, ...input }: FieldProps) {
  const fieldId = id ?? `f-${name}`;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={fieldId}>{label}</Label>
      <Input id={fieldId} name={name} aria-invalid={error ? true : undefined} aria-describedby={error ? `${fieldId}-err` : hint ? `${fieldId}-hint` : undefined} {...input} />
      {error ? (
        <p id={`${fieldId}-err`} className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function MoneyField(props: FieldProps) {
  return <Field inputMode="decimal" autoComplete="off" placeholder={props.placeholder ?? "0"} {...props} />;
}

export function SelectField({
  name,
  label,
  options,
  defaultValue,
  error,
  hint,
  className,
  onChange,
  value,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  value?: string;
  error?: string;
  hint?: string;
  className?: string;
  onChange?: (v: string) => void;
}) {
  const id = `f-${name}`;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} name={name} defaultValue={value === undefined ? defaultValue : undefined} value={value} onChange={onChange ? (e) => onChange(e.target.value) : undefined} aria-invalid={error ? true : undefined}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </NativeSelect>
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function CheckboxField({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-4 accent-[var(--primary)]" />
      <span>
        <span className="font-medium">{label}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}
