"use client";
import { updateProfileAction } from "@/app/actions/finance";
import { ActionForm } from "@/components/forms/form-dialog";
import { Field, MoneyField, SubmitButton } from "@/components/forms/form-kit";

export function ProfileForm({ defaults }: { defaults: Record<string, string> }) {
  return (
    <ActionForm action={updateProfileAction} className="grid gap-4 sm:grid-cols-2">
      {(e) => (
        <>
          <Field name="displayName" label="Profile name" defaultValue={defaults.displayName} error={e.displayName} className="sm:col-span-2" />
          <MoneyField name="monthlySalary" label="Monthly salary (₹)" defaultValue={defaults.monthlySalary} error={e.monthlySalary} />
          <Field name="salaryCreditDay" label="Salary credit day" type="number" min={1} max={31} defaultValue={defaults.salaryCreditDay} error={e.salaryCreditDay} hint="Day of month salary is credited" />
          <MoneyField name="currentSavings" label="Current savings (₹)" defaultValue={defaults.currentSavings} error={e.currentSavings} />
          <MoneyField name="emergencySavingsTarget" label="Emergency savings target (₹)" defaultValue={defaults.emergencySavingsTarget} error={e.emergencySavingsTarget} />
          <div className="sm:col-span-2">
            <SubmitButton>Save profile</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
