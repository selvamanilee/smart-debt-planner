"use client";
import { closeMonthAction } from "@/app/actions/monthly";
import { ActionForm } from "@/components/forms/form-dialog";
import { Field, MoneyField, SubmitButton } from "@/components/forms/form-kit";
import { formatMonth } from "@/lib/format";

export function CloseMonthForm({ month, defaults, debts }: { month: string; defaults: Record<string, string>; debts: { key: string; name: string; balance: string }[] }) {
  return (
    <ActionForm action={closeMonthAction} className="space-y-5">
      {(e) => (
        <>
          <input type="hidden" name="month" value={month} />
          <div className="grid gap-4 sm:grid-cols-2">
            <MoneyField name="salaryReceived" label="Salary received (₹)" defaultValue={defaults.salaryReceived} error={e.salaryReceived} />
            <MoneyField name="otherIncome" label="Other income received (₹)" defaultValue={defaults.otherIncome} error={e.otherIncome} />
            <MoneyField name="actualExpenses" label="Actual expenses (₹)" defaultValue={defaults.actualExpenses} error={e.actualExpenses} hint="Pre-filled from recorded expenses" />
            <MoneyField name="savingsBalance" label="Current savings balance (₹)" defaultValue={defaults.savingsBalance} error={e.savingsBalance} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">Month-end balances (from statements)</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {debts.map((d) => (
                <MoneyField key={d.key} name={`bal_${d.key}`} label={`${d.name} (₹)`} defaultValue={d.balance} error={e[`bal_${d.key}`]} hint="Differences are recorded as reconciliation entries" />
              ))}
            </div>
          </div>
          <Field name="notes" label="Notes" error={e.notes} />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" required className="mt-0.5 size-4 accent-[var(--primary)]" />
            <span>I confirm these figures are final. A closed month cannot be edited later.</span>
          </label>
          <SubmitButton>Close {formatMonth(month, true)} & generate next schedule</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
