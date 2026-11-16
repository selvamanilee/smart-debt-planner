import Decimal from "decimal.js";

/**
 * All money maths runs through decimal.js. JavaScript numbers are only used at
 * the edges (display, charts, JSON) after values have been rounded to paise.
 */
const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type Money = InstanceType<typeof Dec>;
export type MoneyInput = Decimal.Value | Money | null | undefined;

export const ZERO: Money = new Dec(0);

export function D(value: MoneyInput): Money {
  if (value === null || value === undefined || value === "") return new Dec(0);
  if (value instanceof Dec) return value;
  try {
    return new Dec(value as Decimal.Value);
  } catch {
    return new Dec(0);
  }
}

/** Round to 2 decimal places (paise), half-up. */
export function round2(value: MoneyInput): Money {
  return D(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Convert to a plain number rounded to 2dp — for display/serialisation only. */
export function toNum(value: MoneyInput): number {
  return round2(value).toNumber();
}

export function maxD(...values: Money[]): Money {
  return values.reduce((a, b) => (a.gte(b) ? a : b));
}

export function minD(...values: Money[]): Money {
  return values.reduce((a, b) => (a.lte(b) ? a : b));
}

export function sumD(values: MoneyInput[]): Money {
  return values.reduce<Money>((acc, v) => acc.plus(D(v)), ZERO);
}

export function isPositive(value: MoneyInput): boolean {
  return D(value).gt(0);
}

/** Treat anything below half a paisa as zero to avoid dust balances. */
export function isEffectivelyZero(value: MoneyInput): boolean {
  return D(value).abs().lt("0.005");
}

export { Dec as Decimal };
