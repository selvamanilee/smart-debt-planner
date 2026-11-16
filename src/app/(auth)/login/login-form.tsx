"use client";
import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, SubmitButton } from "@/components/forms/form-kit";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(loginAction, null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Your financial data is private to this account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next ?? "/"} />
          <Field name="username" label="Username" autoComplete="username" required autoFocus />
          <Field name="password" label="Password" type="password" autoComplete="current-password" required />
          {state && !state.ok ? <p role="alert" className="text-sm text-destructive">{state.message}</p> : null}
          <SubmitButton className="w-full">Sign in</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
