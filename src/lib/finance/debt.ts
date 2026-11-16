import { D, Decimal, Money, MoneyInput, ZERO, round2, maxD, minD } from "./money";
import { daysInMonth } from "./dates";

export type DebtKind = "loan" | "card";
/** reducing = interest on outstanding principal; flat = interest on original principal. */
export type InterestMethod = "reducing" | "flat";
export type RatePeriod = "annual" | "monthly";
/** monthly = rate/12 per month; daily_365 = annual/365 × days in month. */
export type InterestConvention = "monthly" | "daily_365";

export interface DebtInput {
  /** Stable key, e.g. "loan:3" or "card:1". */
  key: string;
  kind: DebtKind;
  name: string;
  balance: MoneyInput;
  /** Interest rate in percent. null = unknown / not configured. */
  rate: MoneyInput | null;
  ratePeriod: RatePeriod;
  method: InterestMethod;
  convention?: InterestConvention;
  /** Contractual instalment. null for loans with no fixed EMI (interest-only minimum). */
  emi?: MoneyInput | null;
  /** Card minimum due. null = unknown → estimated. */
  minimumPayment?: MoneyInput | null;
  /** Needed for flat-rate interest. */
  originalPrincipal?: MoneyInput | null;
  remainingTenure?: number | null;
  prepaymentAllowed?: boolean;
  /** Percentage charged on any prepaid (extra) principal. */
  prepaymentChargePct?: MoneyInput | null;
  /** Fixed monthly charges/fees added on top of interest. */
  monthlyCharges?: MoneyInput | null;
  paymentDay?: number | null;
}

export function hasKnownRate(debt: Pick<DebtInput, "rate">): boolean {
  return debt.rate !== null && debt.rate !== undefined && debt.rate !== "";
}

/** Monthly rate as a fraction (e.g. 0.03 for 3%/month). null when unknown. */
export function monthlyRate(debt: Pick<DebtInput, "rate" | "ratePeriod">): Money | null {
  if (!hasKnownRate(debt)) return null;
  const r = D(debt.rate).div(100);
  return debt.ratePeriod === "monthly" ? r : r.div(12);
}

/** Nominal annual rate in percent. */
export function annualRatePct(debt: Pick<DebtInput, "rate" | "ratePeriod">): Money | null {
  if (!hasKnownRate(debt)) return null;
  return debt.ratePeriod === "monthly" ? D(debt.rate).mul(12) : D(debt.rate);
}

/** Standard reducing-balance EMI: P·r·(1+r)^n / ((1+r)^n − 1). */
export function calculateEmi(principal: MoneyInput, annualRatePercent: MoneyInput, months: number): Money {
  const P = D(principal);
  if (months <= 0) return round2(P);
  const r = D(annualRatePercent).div(1200);
  if (r.isZero()) return round2(P.div(months));
  const f = r.plus(1).pow(months);
  return round2(P.mul(r).mul(f).div(f.minus(1)));
}

/** Flat-rate EMI: (P + P·rate·years) / n. */
export function calculateFlatEmi(principal: MoneyInput, annualRatePercent: MoneyInput, months: number): Money {
  const P = D(principal);
  if (months <= 0) return round2(P);
  const totalInterest = P.mul(D(annualRatePercent).div(100)).mul(months).div(12);
  return round2(P.plus(totalInterest).div(months));
}

/** Months needed to repay P at monthly rate r with payment A (reducing balance). null if never. */
export function monthsToRepay(principal: MoneyInput, monthlyRateFraction: MoneyInput, payment: MoneyInput): number | null {
  const P = D(principal);
  const r = D(monthlyRateFraction);
  const A = D(payment);
  if (P.lte(0)) return 0;
  if (A.lte(0)) return null;
  if (r.isZero()) return P.div(A).ceil().toNumber();
  const interest = P.mul(r);
  if (A.lte(interest)) return null;
  // n = -ln(1 - rP/A) / ln(1+r)
  const n = Decimal.ln(D(1).minus(interest.div(A))).neg().div(Decimal.ln(r.plus(1)));
  // Tolerance absorbs paise rounding of the EMI itself.
  return n.minus("0.001").ceil().toNumber();
}

/**
 * Interest accrued for one month on the given opening balance.
 * Returns null when the rate is unknown (caller should treat as 0 and flag as estimate).
 */
export function monthlyInterest(debt: DebtInput, openingBalance: MoneyInput, month?: string): Money | null {
  const bal = D(openingBalance);
  if (bal.lte(0)) return ZERO;
  if (!hasKnownRate(debt)) return null;
  if (debt.method === "flat") {
    const base = debt.originalPrincipal ? D(debt.originalPrincipal) : bal;
    const annual = annualRatePct(debt)!;
    return round2(base.mul(annual).div(1200));
  }
  if (debt.convention === "daily_365" && month) {
    const annual = annualRatePct(debt)!;
    return round2(bal.mul(annual).div(100).div(365).mul(daysInMonth(month)));
  }
  return round2(bal.mul(monthlyRate(debt)!));
}

/** Card minimum due estimate when the actual minimum is not configured: 5% of dues, min ₹200. */
export function estimatedCardMinimum(due: Money): Money {
  return round2(minD(due, maxD(due.mul("0.05"), D(200))));
}

export interface MinimumPayment {
  amount: Money;
  estimated: boolean;
}

/**
 * Contractual minimum for the month given amount due (balance + interest + charges).
 * - Loans with EMI: EMI + monthly charges.
 * - Loans without EMI: interest + charges (interest-only).
 * - Cards: configured minimum due, else an estimate.
 */
export function contractualMinimum(debt: DebtInput, interest: Money, charges: Money, due: Money): MinimumPayment {
  let amount: Money;
  let estimated = false;
  if (debt.kind === "card") {
    if (debt.minimumPayment !== null && debt.minimumPayment !== undefined && debt.minimumPayment !== "") {
      amount = D(debt.minimumPayment);
    } else {
      amount = estimatedCardMinimum(due);
      estimated = true;
    }
  } else if (debt.emi !== null && debt.emi !== undefined && debt.emi !== "" && D(debt.emi).gt(0)) {
    amount = D(debt.emi).plus(charges);
  } else {
    amount = interest.plus(charges);
  }
  return { amount: round2(minD(amount, due)), estimated };
}

/**
 * Reducing-balance-equivalent annual rate in percent, used to rank debts by true
 * borrowing cost. For flat-rate loans this solves the IRR of the remaining EMIs.
 */
export function effectiveAnnualCost(debt: DebtInput): Money | null {
  if (!hasKnownRate(debt)) return null;
  if (debt.method !== "flat") return annualRatePct(debt);
  const bal = D(debt.balance);
  const n = debt.remainingTenure ?? 0;
  const emiRaw = debt.emi ? D(debt.emi) : null;
  if (!emiRaw || n <= 0 || bal.lte(0)) return annualRatePct(debt);
  const emi = emiRaw;
  if (emi.mul(n).lte(bal)) return ZERO;
  // Bisection on monthly rate so that PV(EMI, n, r) = balance.
  let lo = D(0);
  let hi = D(1);
  for (let i = 0; i < 80; i++) {
    const mid = lo.plus(hi).div(2);
    const f = mid.plus(1).pow(n);
    const pv = emi.mul(f.minus(1)).div(mid.mul(f));
    if (pv.gt(bal)) lo = mid;
    else hi = mid;
  }
  return lo.plus(hi).div(2).mul(1200).toDecimalPlaces(4);
}
