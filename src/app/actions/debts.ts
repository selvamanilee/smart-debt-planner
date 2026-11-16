"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getSettings, loanToDebt, cardKey, loanKey } from "@/lib/data";
import { D, ZERO, round2, maxD, minD } from "@/lib/finance/money";
import { monthlyInterest } from "@/lib/finance/debt";
import {
  type ActionState,
  checkbox,
  dateSchema,
  fail,
  formToObject,
  money,
  optionalDay,
  optionalInt,
  optionalMoney,
  optionalRate,
  optionalText,
  text,
  zodErrors,
} from "@/lib/validation";

function done(message: string, ...paths: string[]): ActionState {
  for (const p of ["/", "/planner", "/goal", ...paths]) revalidatePath(p);
  return { ok: true, message };
}

async function addToPriority(key: string) {
  const settings = await getSettings();
  if (!settings.priorityOrder.includes(key)) {
    await getDb().update(s.userSettings).set({ priorityOrder: [...settings.priorityOrder, key] }).where(eq(s.userSettings.id, settings.id));
  }
}
async function removeFromPriority(key: string) {
  const settings = await getSettings();
  await getDb().update(s.userSettings).set({ priorityOrder: settings.priorityOrder.filter((k) => k !== key) }).where(eq(s.userSettings.id, settings.id));
}

/* ---------------------------- Loans ---------------------------------- */

const loanSchema = z.object({
  id: z.coerce.number().int().optional(),
  name: text(120).min(1, "Required"),
  lender: optionalText(120),
  loanType: text(40).min(1),
  originalPrincipal: optionalMoney,
  outstandingPrincipal: money,
  interestRate: optionalRate,
  ratePeriod: z.enum(["annual", "monthly"]),
  interestMethod: z.enum(["reducing", "flat"]),
  interestConvention: z.enum(["monthly", "daily_365"]),
  emi: optionalMoney,
  remainingTenureMonths: optionalInt,
  paymentDay: optionalDay,
  startDate: z.union([dateSchema, z.literal("")]).transform((v) => v || null),
  prepaymentAllowed: checkbox,
  foreclosureChargePct: optionalRate.transform((v) => v ?? "0"),
  additionalMonthlyCharges: optionalMoney.transform((v) => v ?? "0"),
  notes: optionalText(2000),
});

export async function saveLoanAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const raw = formToObject(fd);
  const parsed = loanSchema.safeParse({ ...raw, id: raw.id || undefined });
  if (!parsed.success) return fail(zodErrors(parsed.error));
  const { id, ...values } = parsed.data;
  if (values.interestMethod === "flat" && !values.originalPrincipal) return fail({ originalPrincipal: "Flat-rate loans need the original principal" });
  const db = getDb();
  if (id) {
    const [before] = await db.select().from(s.loans).where(eq(s.loans.id, id));
    if (!before) return fail("Loan not found.");
    const status = D(values.outstandingPrincipal).gt(0) ? "active" : "closed";
    await db.update(s.loans).set({ ...values, status }).where(eq(s.loans.id, id));
    if (!D(before.outstandingPrincipal).eq(D(values.outstandingPrincipal))) {
      await db.insert(s.loanTransactions).values({
        loanId: id,
        date: new Date().toISOString().slice(0, 10),
        type: "adjustment",
        amount: values.outstandingPrincipal,
        principalComponent: round2(D(before.outstandingPrincipal).minus(values.outstandingPrincipal)).toFixed(2),
        balanceBefore: before.outstandingPrincipal,
        balanceAfter: values.outstandingPrincipal,
        note: "Balance edited on loan form",
      });
    }
    await audit("loan", id, "update", { before, after: values });
  } else {
    const [row] = await db.insert(s.loans).values(values).returning();
    await addToPriority(loanKey(row.id));
    await audit("loan", row.id, "create", values);
  }
  return done("Loan saved.", "/loans");
}

export async function deleteLoanAction(id: number): Promise<ActionState> {
  await requireUser();
  const db = getDb();
  const [loan] = await db.select().from(s.loans).where(eq(s.loans.id, id));
  if (!loan) return fail("Loan not found.");
  await db.delete(s.loans).where(eq(s.loans.id, id));
  await removeFromPriority(loanKey(id));
  await audit("loan", id, "delete", loan);
  return done(`Deleted ${loan.name}.`, "/loans");
}

const loanTxSchema = z.object({
  loanId: z.coerce.number().int().positive(),
  date: dateSchema,
  type: z.enum(["emi", "interest_only", "extra_principal", "charge", "adjustment", "disbursement"]),
  amount: money,
  /** Optional override of the interest portion (from the lender statement). */
  interestOverride: optionalMoney,
  note: optionalText(500),
});

/**
 * Record a loan transaction. The split between interest and principal follows the
 * loan's own convention unless the user enters the lender's actual interest figure.
 * Interest is calculated for one period on the balance before the payment.
 */
export async function recordLoanTransactionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = loanTxSchema.safeParse(formToObject(fd));
  if (!parsed.success) return fail(zodErrors(parsed.error));
  const t = parsed.data;
  const db = getDb();
  const [loan] = await db.select().from(s.loans).where(eq(s.loans.id, t.loanId));
  if (!loan) return fail("Loan not found.");

  const before = D(loan.outstandingPrincipal);
  const amount = D(t.amount);
  let interest = ZERO;
  let charges = ZERO;
  let principal = ZERO;
  let after = before;

  switch (t.type) {
    case "emi":
    case "interest_only": {
      const calc = monthlyInterest(loanToDebt(loan), before, t.date.slice(0, 7));
      interest = t.interestOverride !== null ? D(t.interestOverride) : calc ?? ZERO;
      interest = minD(interest, amount);
      principal = minD(maxD(amount.minus(interest), ZERO), before);
      after = before.minus(principal);
      break;
    }
    case "extra_principal": {
      if (!loan.prepaymentAllowed) return fail("This loan does not allow prepayment. Edit the loan if that has changed.");
      const pct = D(loan.foreclosureChargePct).div(100);
      principal = minD(round2(amount.div(pct.plus(1))), before);
      charges = round2(amount.minus(principal));
      after = before.minus(principal);
      break;
    }
    case "charge":
      charges = amount;
      after = before.plus(amount);
      break;
    case "disbursement":
      after = before.plus(amount);
      principal = amount.neg();
      break;
    case "adjustment":
      after = amount;
      principal = before.minus(amount);
      break;
  }
  after = round2(maxD(after, ZERO));

  await db.insert(s.loanTransactions).values({
    loanId: loan.id,
    date: t.date,
    type: t.type,
    amount: round2(amount).toFixed(2),
    principalComponent: round2(principal).toFixed(2),
    interestComponent: round2(interest).toFixed(2),
    chargesComponent: round2(charges).toFixed(2),
    balanceBefore: before.toFixed(2),
    balanceAfter: after.toFixed(2),
    note: t.note,
  });
  const tenure = t.type === "emi" && loan.remainingTenureMonths ? Math.max(0, loan.remainingTenureMonths - 1) : loan.remainingTenureMonths;
  await db
    .update(s.loans)
    .set({ outstandingPrincipal: after.toFixed(2), remainingTenureMonths: tenure, status: after.gt(0) ? "active" : "closed" })
    .where(eq(s.loans.id, loan.id));
  await audit("loan_transaction", loan.id, t.type, { amount: t.amount, interest: interest.toFixed(2), principal: principal.toFixed(2), before: before.toFixed(2), after: after.toFixed(2) });
  return done(
    after.isZero() ? `${loan.name} is fully repaid 🎉` : `Recorded. ${loan.name} balance is now ₹${after.toNumber().toLocaleString("en-IN")}.`,
    "/loans",
    `/loans/${loan.id}`,
    "/monthly-review",
  );
}

export async function deleteLoanTransactionAction(id: number): Promise<ActionState> {
  await requireUser();
  const db = getDb();
  const [tx] = await db.select().from(s.loanTransactions).where(eq(s.loanTransactions.id, id));
  if (!tx) return fail("Transaction not found.");
  const [loan] = await db.select().from(s.loans).where(eq(s.loans.id, tx.loanId));
  const latest = (await db.select().from(s.loanTransactions).where(eq(s.loanTransactions.loanId, tx.loanId))).sort((a, b) => b.id - a.id)[0];
  if (latest?.id !== tx.id) return fail("Only the most recent transaction can be reversed, to keep balances consistent.");
  await db.delete(s.loanTransactions).where(eq(s.loanTransactions.id, id));
  const tenure = tx.type === "emi" && loan.remainingTenureMonths !== null ? loan.remainingTenureMonths + 1 : loan.remainingTenureMonths;
  await db.update(s.loans).set({ outstandingPrincipal: tx.balanceBefore, status: D(tx.balanceBefore).gt(0) ? "active" : "closed", remainingTenureMonths: tenure }).where(eq(s.loans.id, loan.id));
  await audit("loan_transaction", loan.id, "reverse", tx);
  return done("Transaction reversed and balance restored.", "/loans", `/loans/${loan.id}`);
}

/* ---------------------------- Credit cards --------------------------- */

const cardSchema = z.object({
  id: z.coerce.number().int().optional(),
  name: text(120).min(1, "Required"),
  bank: optionalText(120),
  outstandingBalance: money,
  creditLimit: optionalMoney,
  interestRate: optionalRate,
  ratePeriod: z.enum(["annual", "monthly"]),
  minimumDue: optionalMoney,
  billingDay: optionalDay,
  dueDay: optionalDay,
  lateCharges: optionalMoney,
  otherFees: optionalMoney.transform((v) => v ?? "0"),
  notes: optionalText(2000),
});

export async function saveCardAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const raw = formToObject(fd);
  const parsed = cardSchema.safeParse({ ...raw, id: raw.id || undefined });
  if (!parsed.success) return fail(zodErrors(parsed.error));
  const { id, ...values } = parsed.data;
  const db = getDb();
  if (id) {
    const [before] = await db.select().from(s.creditCards).where(eq(s.creditCards.id, id));
    if (!before) return fail("Card not found.");
    await db.update(s.creditCards).set({ ...values, status: D(values.outstandingBalance).gt(0) ? "active" : "closed" }).where(eq(s.creditCards.id, id));
    if (!D(before.outstandingBalance).eq(D(values.outstandingBalance))) {
      await db.insert(s.creditCardTransactions).values({
        cardId: id,
        date: new Date().toISOString().slice(0, 10),
        type: "adjustment",
        amount: values.outstandingBalance,
        balanceBefore: before.outstandingBalance,
        balanceAfter: values.outstandingBalance,
        note: "Balance edited on card form",
      });
    }
    await audit("credit_card", id, "update", { before, after: values });
  } else {
    const [row] = await db.insert(s.creditCards).values(values).returning();
    await addToPriority(cardKey(row.id));
    await audit("credit_card", row.id, "create", values);
  }
  return done("Credit card saved.", "/credit-cards");
}

export async function deleteCardAction(id: number): Promise<ActionState> {
  await requireUser();
  const db = getDb();
  const [card] = await db.select().from(s.creditCards).where(eq(s.creditCards.id, id));
  if (!card) return fail("Card not found.");
  await db.delete(s.creditCards).where(eq(s.creditCards.id, id));
  await removeFromPriority(cardKey(id));
  await audit("credit_card", id, "delete", card);
  return done(`Deleted ${card.name}.`, "/credit-cards");
}

const cardTxSchema = z.object({
  cardId: z.coerce.number().int().positive(),
  date: dateSchema,
  type: z.enum(["payment", "purchase", "interest", "fee", "adjustment"]),
  amount: money,
  note: optionalText(500),
});

export async function recordCardTransactionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = cardTxSchema.safeParse(formToObject(fd));
  if (!parsed.success) return fail(zodErrors(parsed.error));
  const t = parsed.data;
  const db = getDb();
  const [card] = await db.select().from(s.creditCards).where(eq(s.creditCards.id, t.cardId));
  if (!card) return fail("Card not found.");
  const before = D(card.outstandingBalance);
  const amt = D(t.amount);
  let after: ReturnType<typeof D>;
  if (t.type === "payment") after = before.minus(amt);
  else if (t.type === "adjustment") after = amt;
  else after = before.plus(amt);
  after = round2(maxD(after, ZERO));
  await db.insert(s.creditCardTransactions).values({ cardId: card.id, date: t.date, type: t.type, amount: amt.toFixed(2), balanceBefore: before.toFixed(2), balanceAfter: after.toFixed(2), note: t.note });
  await db.update(s.creditCards).set({ outstandingBalance: after.toFixed(2), status: after.gt(0) ? "active" : "closed" }).where(eq(s.creditCards.id, card.id));
  await audit("card_transaction", card.id, t.type, { amount: t.amount, before: before.toFixed(2), after: after.toFixed(2) });
  return done(after.isZero() ? `${card.name} is fully settled 🎉` : `Recorded. ${card.name} balance is now ₹${after.toNumber().toLocaleString("en-IN")}.`, "/credit-cards", "/monthly-review");
}
