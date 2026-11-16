"use client";
import { HandCoinsIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { deleteCardAction, recordCardTransactionAction, saveCardAction } from "@/app/actions/debts";
import { FormDialog } from "@/components/forms/form-dialog";
import { Field, MoneyField, SelectField, SubmitButton } from "@/components/forms/form-kit";
import { ActionButton } from "@/components/forms/action-button";
import { Button } from "@/components/ui/button";

export type CardFormValues = {
  id: number;
  name: string;
  bank: string;
  outstandingBalance: string;
  creditLimit: string;
  interestRate: string;
  ratePeriod: string;
  minimumDue: string;
  billingDay: string;
  dueDay: string;
  lateCharges: string;
  otherFees: string;
  notes: string;
};

export function CardDialog({ card }: { card?: CardFormValues }) {
  return (
    <FormDialog
      title={card ? `Edit ${card.name}` : "Add credit card"}
      description="Leave unknown values blank — they will be shown as “Not configured” instead of guessed."
      action={saveCardAction}
      className="max-w-2xl"
      trigger={card ? <Button variant="outline" size="sm"><PencilIcon /> Edit</Button> : <Button><PlusIcon /> Add card</Button>}
    >
      {(e) => (
        <div className="grid gap-4 sm:grid-cols-2">
          {card ? <input type="hidden" name="id" value={card.id} /> : null}
          <Field name="name" label="Card name" defaultValue={card?.name} error={e.name} required />
          <Field name="bank" label="Bank" defaultValue={card?.bank} error={e.bank} />
          <MoneyField name="outstandingBalance" label="Outstanding balance (₹)" defaultValue={card?.outstandingBalance} error={e.outstandingBalance} required />
          <MoneyField name="creditLimit" label="Credit limit (₹)" defaultValue={card?.creditLimit} error={e.creditLimit} />
          <Field name="interestRate" label="Interest rate (%)" inputMode="decimal" defaultValue={card?.interestRate} error={e.interestRate} hint="From your statement, e.g. 3.6 per month" />
          <SelectField name="ratePeriod" label="Rate is per" defaultValue={card?.ratePeriod ?? "monthly"} options={[{ value: "monthly", label: "Month" }, { value: "annual", label: "Year (APR)" }]} />
          <MoneyField name="minimumDue" label="Minimum due (₹)" defaultValue={card?.minimumDue} error={e.minimumDue} hint="Blank = estimated at 5%" />
          <MoneyField name="lateCharges" label="Late payment charges (₹)" defaultValue={card?.lateCharges} error={e.lateCharges} />
          <Field name="billingDay" label="Billing day" type="number" min={1} max={31} defaultValue={card?.billingDay} error={e.billingDay} />
          <Field name="dueDay" label="Payment due day" type="number" min={1} max={31} defaultValue={card?.dueDay} error={e.dueDay} />
          <MoneyField name="otherFees" label="Other monthly fees (₹)" defaultValue={card?.otherFees ?? "0"} error={e.otherFees} />
          <Field name="notes" label="Notes" defaultValue={card?.notes} error={e.notes} />
          <div className="sm:col-span-2"><SubmitButton>{card ? "Save card" : "Add card"}</SubmitButton></div>
        </div>
      )}
    </FormDialog>
  );
}

export function CardTxDialog({ cardId, name, balance }: { cardId: number; name: string; balance: string }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <FormDialog
      title={`Record transaction · ${name}`}
      description="Record payments you have actually made, or new charges from your statement."
      action={recordCardTransactionAction}
      trigger={<Button size="sm"><HandCoinsIcon /> Record payment</Button>}
    >
      {(e) => (
        <>
          <input type="hidden" name="cardId" value={cardId} />
          <SelectField
            name="type"
            label="Type"
            defaultValue="payment"
            options={[
              { value: "payment", label: "Payment (reduces balance)" },
              { value: "purchase", label: "New purchase (adds)" },
              { value: "interest", label: "Interest charged (adds)" },
              { value: "fee", label: "Fee / late charge (adds)" },
              { value: "adjustment", label: "Set balance from statement" },
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field name="date" label="Date" type="date" defaultValue={today} error={e.date} required />
            <MoneyField name="amount" label="Amount (₹)" error={e.amount} required hint={`Current balance ₹${Number(balance).toLocaleString("en-IN")}`} />
          </div>
          <Field name="note" label="Note" error={e.note} />
          <SubmitButton>Record</SubmitButton>
        </>
      )}
    </FormDialog>
  );
}

export function DeleteCard({ id, name }: { id: number; name: string }) {
  return (
    <ActionButton action={() => deleteCardAction(id)} confirm={`Delete card "${name}" and its history?`} variant="ghost" size="icon-sm" title={`Delete ${name}`}>
      <Trash2Icon />
    </ActionButton>
  );
}
