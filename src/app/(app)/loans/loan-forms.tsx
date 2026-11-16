"use client";
import { useState } from "react";
import { HandCoinsIcon, PencilIcon, PlusIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import { deleteLoanAction, deleteLoanTransactionAction, recordLoanTransactionAction, saveLoanAction } from "@/app/actions/debts";
import { FormDialog } from "@/components/forms/form-dialog";
import { CheckboxField, Field, MoneyField, SelectField, SubmitButton } from "@/components/forms/form-kit";
import { ActionButton } from "@/components/forms/action-button";
import { Button } from "@/components/ui/button";

export type LoanFormValues = {
  id: number;
  name: string;
  lender: string;
  loanType: string;
  originalPrincipal: string;
  outstandingPrincipal: string;
  interestRate: string;
  ratePeriod: string;
  interestMethod: string;
  interestConvention: string;
  emi: string;
  remainingTenureMonths: string;
  paymentDay: string;
  startDate: string;
  prepaymentAllowed: boolean;
  foreclosureChargePct: string;
  additionalMonthlyCharges: string;
  notes: string;
};

export function LoanDialog({ loan, compact }: { loan?: LoanFormValues; compact?: boolean }) {
  return (
    <FormDialog
      title={loan ? `Edit ${loan.name}` : "Add loan"}
      description="Leave a field blank if you don't know it — unknown values are flagged rather than guessed."
      action={saveLoanAction}
      className="max-w-2xl"
      trigger={
        loan ? (
          compact ? <Button variant="ghost" size="icon-sm" title="Edit loan" aria-label={`Edit ${loan.name}`}><PencilIcon /></Button> : <Button variant="outline"><PencilIcon /> Edit loan</Button>
        ) : (
          <Button><PlusIcon /> Add loan</Button>
        )
      }
    >
      {(e) => (
        <div className="grid gap-4 sm:grid-cols-2">
          {loan ? <input type="hidden" name="id" value={loan.id} /> : null}
          <Field name="name" label="Loan name" defaultValue={loan?.name} error={e.name} required />
          <Field name="lender" label="Bank / lender" defaultValue={loan?.lender} error={e.lender} />
          <SelectField
            name="loanType"
            label="Loan type"
            defaultValue={loan?.loanType ?? "personal"}
            options={["personal", "home", "vehicle", "education", "gold", "business", "consumer", "private", "other"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))}
          />
          <MoneyField name="originalPrincipal" label="Original principal (₹)" defaultValue={loan?.originalPrincipal} error={e.originalPrincipal} hint="Required for flat-rate loans" />
          <MoneyField name="outstandingPrincipal" label="Current outstanding principal (₹)" defaultValue={loan?.outstandingPrincipal} error={e.outstandingPrincipal} required />
          <MoneyField name="emi" label="EMI (₹)" defaultValue={loan?.emi} error={e.emi} hint="Blank = no fixed EMI (interest-only minimum)" />
          <Field name="interestRate" label="Interest rate (%)" inputMode="decimal" defaultValue={loan?.interestRate} error={e.interestRate} hint="Blank = not configured" />
          <SelectField name="ratePeriod" label="Rate is per" defaultValue={loan?.ratePeriod ?? "annual"} options={[{ value: "annual", label: "Year (p.a.)" }, { value: "monthly", label: "Month" }]} />
          <SelectField name="interestMethod" label="Interest method" defaultValue={loan?.interestMethod ?? "reducing"} options={[{ value: "reducing", label: "Reducing balance" }, { value: "flat", label: "Flat rate (on original principal)" }]} />
          <SelectField name="interestConvention" label="Interest convention" defaultValue={loan?.interestConvention ?? "monthly"} options={[{ value: "monthly", label: "Monthly (rate ÷ 12)" }, { value: "daily_365", label: "Daily (actual days ÷ 365)" }]} />
          <Field name="remainingTenureMonths" label="Remaining tenure (months)" type="number" min={0} defaultValue={loan?.remainingTenureMonths} error={e.remainingTenureMonths} />
          <Field name="paymentDay" label="Payment day of month" type="number" min={1} max={31} defaultValue={loan?.paymentDay} error={e.paymentDay} />
          <Field name="startDate" label="Loan start date" type="date" defaultValue={loan?.startDate} error={e.startDate} />
          <Field name="foreclosureChargePct" label="Prepayment / foreclosure charge (%)" inputMode="decimal" defaultValue={loan?.foreclosureChargePct ?? "0"} error={e.foreclosureChargePct} />
          <MoneyField name="additionalMonthlyCharges" label="Additional monthly charges (₹)" defaultValue={loan?.additionalMonthlyCharges ?? "0"} error={e.additionalMonthlyCharges} hint="Insurance, service fees etc." />
          <div className="flex items-end pb-1">
            <CheckboxField name="prepaymentAllowed" label="Prepayment allowed" defaultChecked={loan?.prepaymentAllowed ?? true} />
          </div>
          <Field name="notes" label="Notes" defaultValue={loan?.notes} error={e.notes} className="sm:col-span-2" />
          <div className="sm:col-span-2">
            <SubmitButton>{loan ? "Save loan" : "Add loan"}</SubmitButton>
          </div>
        </div>
      )}
    </FormDialog>
  );
}

const TX_TYPES = [
  { value: "emi", label: "EMI payment" },
  { value: "interest_only", label: "Interest payment" },
  { value: "extra_principal", label: "Extra principal payment" },
  { value: "charge", label: "Charge / penalty (adds to balance)" },
  { value: "disbursement", label: "Top-up / disbursement (adds to balance)" },
  { value: "adjustment", label: "Set balance from lender statement" },
];

export function LoanPaymentDialog({ loanId, name, emi, interestHint, defaultType = "emi" }: { loanId: number; name: string; emi: string | null; interestHint: number | null; defaultType?: string }) {
  const [type, setType] = useState(defaultType);
  const today = new Date().toISOString().slice(0, 10);
  const defaultAmount = type === "emi" ? emi ?? "" : type === "interest_only" && interestHint !== null ? String(interestHint) : "";
  return (
    <FormDialog
      title={`Record transaction · ${name}`}
      description="Only record payments you have actually made. The balance updates immediately and the transaction is kept in history."
      action={recordLoanTransactionAction}
      trigger={<Button size="sm"><HandCoinsIcon /> Record payment</Button>}
    >
      {(e) => (
        <>
          <input type="hidden" name="loanId" value={loanId} />
          <SelectField name="type" label="Transaction type" value={type} onChange={setType} options={TX_TYPES} />
          <div className="grid grid-cols-2 gap-3">
            <Field name="date" label="Date" type="date" defaultValue={today} error={e.date} required />
            <MoneyField key={type} name="amount" label={type === "adjustment" ? "New outstanding balance (₹)" : "Amount (₹)"} defaultValue={defaultAmount} error={e.amount} required />
          </div>
          {type === "emi" || type === "interest_only" ? (
            <MoneyField
              name="interestOverride"
              label="Interest portion (₹) — optional"
              error={e.interestOverride}
              hint={interestHint !== null ? `Leave blank to use the calculated ₹${interestHint.toLocaleString("en-IN")} (enter the lender's figure if different).` : "Rate not configured — enter the lender's interest figure."}
            />
          ) : null}
          <Field name="note" label="Note" error={e.note} />
          <SubmitButton>Record</SubmitButton>
        </>
      )}
    </FormDialog>
  );
}

export function DeleteLoan({ id, name }: { id: number; name: string }) {
  return (
    <ActionButton action={() => deleteLoanAction(id)} confirm={`Delete "${name}" and all its transactions? This cannot be undone.`} variant="ghost" size="icon-sm" title={`Delete ${name}`}>
      <Trash2Icon />
    </ActionButton>
  );
}

export function ReverseLoanTx({ id }: { id: number }) {
  return (
    <ActionButton action={() => deleteLoanTransactionAction(id)} confirm="Reverse this transaction and restore the previous balance?" variant="ghost" size="icon-sm" title="Reverse transaction">
      <Undo2Icon />
    </ActionButton>
  );
}
