"use client";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { deleteIncomeAction, saveIncomeAction } from "@/app/actions/finance";
import { FormDialog } from "@/components/forms/form-dialog";
import { CheckboxField, Field, MoneyField, SelectField, SubmitButton } from "@/components/forms/form-kit";
import { ActionButton } from "@/components/forms/action-button";
import { Button } from "@/components/ui/button";

type Income = { id: number; name: string; type: string; amount: string; active: boolean; notes: string };

export function IncomeDialog({ income }: { income?: Income }) {
  return (
    <FormDialog
      title={income ? "Edit income source" : "Add income source"}
      action={saveIncomeAction}
      trigger={
        income ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${income.name}`} title="Edit"><PencilIcon /></Button>
        ) : (
          <Button><PlusIcon /> Add income</Button>
        )
      }
    >
      {(e) => (
        <>
          {income ? <input type="hidden" name="id" value={income.id} /> : null}
          <Field name="name" label="Name" defaultValue={income?.name} error={e.name} required placeholder="e.g. Freelance design work" />
          <SelectField
            name="type"
            label="Type"
            defaultValue={income?.type ?? "additional"}
            options={[
              { value: "additional", label: "Additional income" },
              { value: "variable", label: "Variable income" },
              { value: "freelance", label: "Freelance income" },
              { value: "other", label: "Other income" },
            ]}
          />
          <MoneyField name="amount" label="Monthly amount (₹)" defaultValue={income?.amount} error={e.amount} hint="For variable income use a conservative monthly average." />
          <Field name="notes" label="Notes" defaultValue={income?.notes} error={e.notes} />
          <CheckboxField name="active" label="Active (counts toward monthly income)" defaultChecked={income?.active ?? true} />
          <SubmitButton>{income ? "Save changes" : "Add income"}</SubmitButton>
        </>
      )}
    </FormDialog>
  );
}

export function DeleteIncome({ id, name }: { id: number; name: string }) {
  return (
    <ActionButton action={() => deleteIncomeAction(id)} confirm={`Delete income source "${name}"?`} variant="ghost" size="icon-sm" title={`Delete ${name}`}>
      <Trash2Icon />
    </ActionButton>
  );
}
