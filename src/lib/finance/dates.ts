/** Month helpers using "YYYY-MM" keys. Pure functions, no timezone surprises. */

export function monthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function parseMonth(key: string): { year: number; month: number } {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) throw new Error(`Invalid month key: ${key}`);
  return { year: y, month: m };
}

export function addMonths(key: string, n: number): string {
  const { year, month } = parseMonth(key);
  const total = year * 12 + (month - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Number of months from a to b (b - a). */
export function monthDiff(a: string, b: string): number {
  const pa = parseMonth(a);
  const pb = parseMonth(b);
  return pb.year * 12 + pb.month - (pa.year * 12 + pa.month);
}

export function daysInMonth(key: string): number {
  const { year, month } = parseMonth(key);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function formatMonth(key: string | null | undefined, long = false): string {
  if (!key) return "—";
  try {
    const { year, month } = parseMonth(key);
    return `${(long ? MONTHS_LONG : MONTHS)[month - 1]} ${year}`;
  } catch {
    return key;
  }
}

export function isValidMonthKey(key: unknown): key is string {
  return typeof key === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
}
