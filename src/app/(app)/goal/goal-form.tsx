"use client";
import { saveGoalAction, clearGoalAction } from "@/app/actions/goal";
import { ActionForm } from "@/components/forms/form-dialog";
import { Field, SubmitButton } from "@/components/forms/form-kit";
import { ActionButton } from "@/components/forms/action-button";

export function GoalForm({ targetMonth, description, hasGoal }: { targetMonth: string; description: string; hasGoal: boolean }) {
  return (
    <ActionForm action={saveGoalAction} className="flex flex-col gap-4">
      {(e) => (
        <>
          <Field name="targetMonth" label="Debt-free by" type="month" defaultValue={targetMonth} error={e.targetMonth} required />
          <Field name="description" label="Why it matters (optional)" defaultValue={description} error={e.description} placeholder="I want to close all my loans by December 2028." />
          <div className="flex flex-wrap gap-2">
            <SubmitButton>Save target</SubmitButton>
            {hasGoal ? <ActionButton action={clearGoalAction} confirm="Remove the current debt-free target?" variant="ghost" size="default">Remove target</ActionButton> : null}
          </div>
        </>
      )}
    </ActionForm>
  );
}
