import { z } from "zod";

const MAX_MONEY = 1_000_000_000_000; // ₹1 lakh crore — sanity cap

/** Accepts "1,23,456.78" style input, returns a decimal string with ≤2dp. */
export const money = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).replace(/[,₹\s]/g, ""))
  .refine((v) => /^-?\d+(\.\d{1,2})?$/.test(v), "Enter a valid amount (up to 2 decimals)")
  .refine((v) => Number(v) >= 0, "Amount cannot be negative")
  .refine((v) => Number(v) <= MAX_MONEY, "Amount is too large");

export const signedMoney = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).replace(/[,₹\s]/g, ""))
  .refine((v) => /^-?\d+(\.\d{1,2})?$/.test(v), "Enter a valid amount (up to 2 decimals)")
  .refine((v) => Math.abs(Number(v)) <= MAX_MONEY, "Amount is too large");

/** Empty string → null (unknown). */
export const optionalMoney = z
  .union([z.string(), z.number(), z.null()]).optional()
  .transform((v) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).replace(/[,₹\s]/g, "")))
  .refine((v) => v === null || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) <= MAX_MONEY), "Enter a valid amount or leave blank");

export const optionalRate = z
  .union([z.string(), z.number(), z.null()]).optional()
  .transform((v) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).replace(/[%\s]/g, "")))
  .refine((v) => v === null || (/^\d+(\.\d{1,4})?$/.test(v) && Number(v) <= 1000), "Enter a valid rate (e.g. 11.5) or leave blank");

export const optionalDay = z
  .union([z.string(), z.number(), z.null()]).optional()
  .transform((v) => (v === null || v === undefined || String(v).trim() === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 31), "Day must be 1–31");

export const optionalInt = z
  .union([z.string(), z.number(), z.null()]).optional()
  .transform((v) => (v === null || v === undefined || String(v).trim() === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 1200), "Enter a whole number");

export const monthKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");
export const checkbox = z
  .union([z.string(), z.boolean(), z.null()]).optional()
  .transform((v) => v === true || v === "on" || v === "true" || v === "1");
export const text = (max = 255) => z.string().trim().max(max);
export const optionalText = (max = 2000) =>
  z
    .union([z.string(), z.null()]).optional()
    .transform((v) => (v === null || v === undefined || v.trim() === "" ? null : v.trim()))
    .refine((v) => v === null || v.length <= max, `Max ${max} characters`);

export type ActionState = { ok: boolean; message?: string; errors?: Record<string, string> } | null;

export function formToObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

export function zodErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function fail(errorsOrMessage: Record<string, string> | string): ActionState {
  return typeof errorsOrMessage === "string"
    ? { ok: false, message: errorsOrMessage }
    : { ok: false, message: "Please fix the highlighted fields.", errors: errorsOrMessage };
}
