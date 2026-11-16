import type { Loan } from "@/lib/db/schema";
import type { LoanFormValues } from "./loan-forms";

export function loanFormValues(l: Loan): LoanFormValues {
  return {
    id: l.id,
    name: l.name,
    lender: l.lender ?? "",
    loanType: l.loanType,
    originalPrincipal: l.originalPrincipal ?? "",
    outstandingPrincipal: l.outstandingPrincipal,
    interestRate: l.interestRate ? String(Number(l.interestRate)) : "",
    ratePeriod: l.ratePeriod,
    interestMethod: l.interestMethod,
    interestConvention: l.interestConvention,
    emi: l.emi ?? "",
    remainingTenureMonths: l.remainingTenureMonths?.toString() ?? "",
    paymentDay: l.paymentDay?.toString() ?? "",
    startDate: l.startDate ?? "",
    prepaymentAllowed: l.prepaymentAllowed,
    foreclosureChargePct: String(Number(l.foreclosureChargePct)),
    additionalMonthlyCharges: l.additionalMonthlyCharges,
    notes: l.notes ?? "",
  };
}
