"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { changePasswordAction } from "@/app/actions/auth";
import { deleteAccountAction, deleteAllDataAction } from "@/app/actions/settings";
import { ActionForm } from "@/components/forms/form-dialog";
import { Field, SubmitButton } from "@/components/forms/form-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangePasswordForm() {
  return (
    <ActionForm action={changePasswordAction} className="grid gap-3">
      {(e) => (
        <>
          <Field name="current" label="Current password" type="password" autoComplete="current-password" error={e.current} required />
          <Field name="password" label="New password" type="password" autoComplete="new-password" error={e.password} required />
          <Field name="confirm" label="Confirm new password" type="password" autoComplete="new-password" error={e.confirm} required />
          <div><SubmitButton>Change password</SubmitButton></div>
        </>
      )}
    </ActionForm>
  );
}

export function DangerZone() {
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; message?: string } | null>) =>
    start(async () => {
      const r = await fn();
      if (r?.ok) {
        toast.success(r.message);
        setConfirm("");
        router.refresh();
      } else if (r) toast.error(r.message);
    });
  return (
    <div className="space-y-3 rounded-lg border border-destructive/40 p-3">
      <div className="text-sm font-medium text-destructive">Danger zone</div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm-del">Type DELETE (or DELETE ACCOUNT) to enable</Label>
        <Input id="confirm-del" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={pending || confirm !== "DELETE"} onClick={() => run(() => deleteAllDataAction({ confirm, reseed: true }))}>Reset to initial data</Button>
        <Button variant="destructive" size="sm" disabled={pending || confirm !== "DELETE"} onClick={() => run(() => deleteAllDataAction({ confirm, reseed: false }))}>Delete all financial data</Button>
        <Button variant="destructive" size="sm" disabled={pending || confirm !== "DELETE ACCOUNT"} onClick={() => run(() => deleteAccountAction({ confirm }))}>Delete account</Button>
      </div>
      <p className="text-xs text-muted-foreground">Export your data first — deletion cannot be undone.</p>
    </div>
  );
}
