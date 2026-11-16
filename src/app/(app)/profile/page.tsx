import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFinancialState } from "@/lib/data";
import { formatINR } from "@/lib/format";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Financial Profile" };

export default async function ProfilePage() {
  const state = await getFinancialState();
  const p = state.profile;
  const cf = state.cashFlow;
  const rows: [string, number, string?][] = [
    ["Total income", cf.totalIncome],
    ["Planned expenses", -cf.plannedExpenses],
    ["Planned savings", -cf.plannedSavings],
    ["Available for debt repayment", cf.availableForDebt, "font-semibold"],
    ["Mandatory EMIs & minimums", -cf.mandatoryEmis],
    ["Remaining for additional repayment", cf.remainingForExtra, "font-semibold text-primary"],
  ];
  return (
    <>
      <PageHeader title="Financial Profile" description="Your salary, savings and emergency fund. Everything else recalculates from these numbers." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Other income sources are managed on the Income page.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm
              defaults={{
                displayName: p.displayName,
                monthlySalary: p.monthlySalary,
                salaryCreditDay: p.salaryCreditDay?.toString() ?? "",
                currentSavings: p.currentSavings,
                emergencySavingsTarget: p.emergencySavingsTarget,
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Monthly cash flow</CardTitle>
            <CardDescription>Available = income − expenses − planned savings. EMIs are paid from it, never subtracted twice.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y text-sm">
              {rows.map(([label, value, cls]) => (
                <div key={label} className={`flex justify-between py-2 ${cls ?? ""}`}>
                  <dt>{label}</dt>
                  <dd className={`num ${value < 0 ? "text-muted-foreground" : ""}`}>{formatINR(value)}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
