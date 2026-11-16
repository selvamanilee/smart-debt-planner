"use client";
import { useActionState } from "react";
import { setupAction } from "@/app/actions/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, SubmitButton } from "@/components/forms/form-kit";

export function SetupForm({ needsCode }: { needsCode: boolean }) {
  const [state, action] = useActionState(setupAction, null);
  const e = state?.errors ?? {};
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>One-time setup. Your initial salary, expenses, loans and credit card are loaded automatically and can be edited later.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <Field name="username" label="Username" autoComplete="username" required error={e.username} />
          <Field name="password" label="Password" type="password" autoComplete="new-password" required error={e.password} hint="At least 10 characters." />
          <Field name="confirm" label="Confirm password" type="password" autoComplete="new-password" required error={e.confirm} />
          {needsCode ? <Field name="setupCode" label="Setup code" type="password" required error={e.setupCode} hint="The SETUP_CODE value from your environment variables." /> : null}
          {state && !state.ok && !state.errors ? <p role="alert" className="text-sm text-destructive">{state.message}</p> : null}
          <SubmitButton className="w-full">Create account</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
