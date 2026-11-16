import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { getBudgetsForMonth, getCardTransactions, getExpensesForMonth, getFinancialState, getLoanTransactions, getSnapshots, debtRateLabel } from "@/lib/data";
import { projectionFor, strategyComparison } from "@/lib/planning";
import { STRATEGY_LABELS, type Strategy } from "@/lib/finance/simulate";
import { formatMonth, isValidMonthKey, monthKey } from "@/lib/finance/dates";

export type Cell = string | number | null;
export interface Sheet {
  name: string;
  columns: string[];
  rows: Cell[][];
  /** Indexes of columns holding money values. */
  money?: number[];
}
export interface Report {
  title: string;
  subtitle: string;
  sheets: Sheet[];
}

export const REPORTS = {
  summary: "Overall financial summary",
  debts: "Loan-wise outstanding balance",
  expenses: "Monthly expenses",
  interest: "Interest cost",
  repayments: "Repayment history",
  cashflow: "Monthly cash flow",
  projection: "Debt-free projection",
  strategies: "Strategy comparison",
  history: "Monthly snapshots",
  plan: "Saved repayment plan",
} as const;
export type ReportKey = keyof typeof REPORTS;

export async function buildReport(key: ReportKey, params: URLSearchParams): Promise<Report> {
  const month = isValidMonthKey(params.get("month")) ? params.get("month")! : monthKey();
  const state = await getFinancialState(month);
  const generated = `Generated ${new Date().toLocaleString("en-IN")}`;
  const cf = state.cashFlow;

  switch (key) {
    case "summary": {
      const p = projectionFor(state);
      return {
        title: REPORTS.summary,
        subtitle: `${formatMonth(month, true)} · ${generated}`,
        sheets: [
          {
            name: "Summary",
            columns: ["Item", "Value"],
            rows: [
              ["Monthly salary", cf.salary],
              ["Other income", cf.otherIncome],
              ["Total monthly income", cf.totalIncome],
              ["Planned monthly expenses", cf.plannedExpenses],
              ["Actual expenses this month", cf.actualExpenses],
              ["Mandatory EMIs & minimums", cf.mandatoryEmis],
              ["Planned savings", cf.plannedSavings],
              ["Available for debt repayment", cf.availableForDebt],
              ["Remaining for extra repayment", cf.remainingForExtra],
              ["Estimated monthly interest", cf.estimatedMonthlyInterest],
              ["Current savings", Number(state.profile.currentSavings)],
              ["Emergency savings target", Number(state.profile.emergencySavingsTarget)],
              ["Total outstanding debt", state.totalDebt],
              ["Strategy", STRATEGY_LABELS[p.strategy]],
              ["Projected debt-free month", p.debtFreeMonth ? formatMonth(p.debtFreeMonth, true) : "Not within 30 years"],
              ["Projected total interest", p.totalInterest],
              ["Contains estimates", p.isEstimate ? "Yes — " + p.warnings.join(" ") : "No"],
            ],
            money: [1],
          },
        ],
      };
    }
    case "debts":
      return {
        title: REPORTS.debts,
        subtitle: generated,
        sheets: [
          {
            name: "Debts",
            columns: ["Debt", "Type", "Lender", "Outstanding", "Rate", "EMI / minimum", "Method", "Status"],
            rows: [
              ...state.loans.map((l) => {
                const d = state.debts.find((x) => x.key === `loan:${l.id}`);
                return [l.name, l.loanType, l.lender ?? "", Number(l.outstandingPrincipal), d ? debtRateLabel(d) : l.interestRate ? `${l.interestRate}%` : "Not configured", l.emi ? Number(l.emi) : "Interest only", l.interestMethod, l.status] as Cell[];
              }),
              ...state.cards.map((c) => {
                const d = state.debts.find((x) => x.key === `card:${c.id}`);
                return [c.name, "credit card", c.bank ?? "", Number(c.outstandingBalance), d ? debtRateLabel(d) : c.interestRate ? `${c.interestRate}%` : "Not configured", c.minimumDue ? Number(c.minimumDue) : "Not configured", "revolving", c.status] as Cell[];
              }),
              ["Total", "", "", state.totalDebt, "", "", "", ""],
            ],
            money: [3, 5],
          },
        ],
      };
    case "expenses": {
      const [budgets, txs] = await Promise.all([getBudgetsForMonth(month), getExpensesForMonth(month)]);
      const actual = new Map<number, number>();
      for (const t of txs) actual.set(t.categoryId, (actual.get(t.categoryId) ?? 0) + Number(t.amount));
      return {
        title: `${REPORTS.expenses} · ${formatMonth(month, true)}`,
        subtitle: generated,
        sheets: [
          {
            name: "Budget vs actual",
            columns: ["Category", "Budget", "Actual", "Difference", "Essential"],
            rows: budgets.map((b) => [b.category.name, Number(b.budget), actual.get(b.category.id) ?? 0, Number(b.budget) - (actual.get(b.category.id) ?? 0), b.category.isEssential ? "Yes" : "No"]),
            money: [1, 2, 3],
          },
          {
            name: "Transactions",
            columns: ["Date", "Category", "Description", "Type", "Amount"],
            rows: txs.map((t) => [t.date, budgets.find((b) => b.category.id === t.categoryId)?.category.name ?? "", t.description ?? "", t.kind, Number(t.amount)]),
            money: [4],
          },
        ],
      };
    }
    case "interest": {
      const p = projectionFor(state);
      return {
        title: REPORTS.interest,
        subtitle: `Projected with ${STRATEGY_LABELS[p.strategy]} · ${generated}`,
        sheets: [
          {
            name: "Interest by debt",
            columns: ["Debt", "Current balance", "Interest this month", "Projected total interest", "Charges", "Closes", "Rate known"],
            rows: p.debts.map((d) => [d.name, d.startBalance, p.months[0]?.debts[d.key]?.interest ?? 0, d.totalInterest, d.totalCharges, formatMonth(d.closureMonth, true), d.interestEstimated ? "No (excluded)" : "Yes"]),
            money: [1, 2, 3, 4],
          },
          {
            name: "Interest by month",
            columns: ["Month", "Interest", "Principal", "Charges"],
            rows: p.months.map((m) => [formatMonth(m.month), m.interest, m.principalPaid, m.charges]),
            money: [1, 2, 3],
          },
        ],
      };
    }
    case "repayments": {
      const [ltx, ctx] = await Promise.all([getLoanTransactions(), getCardTransactions()]);
      const loanName = (id: number) => state.loans.find((l) => l.id === id)?.name ?? `Loan ${id}`;
      const cardName = (id: number) => state.cards.find((c) => c.id === id)?.name ?? `Card ${id}`;
      return {
        title: REPORTS.repayments,
        subtitle: generated,
        sheets: [
          {
            name: "Loan transactions",
            columns: ["Date", "Loan", "Type", "Amount", "Interest", "Principal", "Charges", "Balance after", "Note"],
            rows: ltx.map((t) => [t.date, loanName(t.loanId), t.type, Number(t.amount), Number(t.interestComponent), Number(t.principalComponent), Number(t.chargesComponent), Number(t.balanceAfter), t.note ?? ""]),
            money: [3, 4, 5, 6, 7],
          },
          {
            name: "Card transactions",
            columns: ["Date", "Card", "Type", "Amount", "Balance after", "Note"],
            rows: ctx.map((t) => [t.date, cardName(t.cardId), t.type, Number(t.amount), Number(t.balanceAfter), t.note ?? ""]),
            money: [3, 4],
          },
        ],
      };
    }
    case "cashflow":
    case "projection": {
      const p = projectionFor(state);
      const sheets: Sheet[] = [
        {
          name: "Month by month",
          columns: ["Month", "Income", "Expenses", "Savings", "Loan payments", "Interest", "Principal", "Closing debt"],
          rows: p.months.map((m) => [formatMonth(m.month), m.income, m.expenses, m.savingsContribution + m.surplusToSavings, m.totalPaid, m.interest, m.principalPaid, m.closingDebt]),
          money: [1, 2, 3, 4, 5, 6, 7],
        },
      ];
      if (key === "projection") {
        sheets.push({
          name: "Loan-wise balances",
          columns: ["Month", ...p.debts.map((d) => d.name), "Total"],
          rows: p.months.map((m) => [formatMonth(m.month), ...p.debts.map((d) => m.debts[d.key]?.closing ?? 0), m.closingDebt]),
          money: p.debts.map((_, i) => i + 1).concat(p.debts.length + 1),
        });
      }
      return {
        title: key === "cashflow" ? REPORTS.cashflow : REPORTS.projection,
        subtitle: `${STRATEGY_LABELS[p.strategy]} · debt-free ${p.debtFreeMonth ? formatMonth(p.debtFreeMonth, true) : "not within 30 years"} · ${generated}`,
        sheets,
      };
    }
    case "strategies": {
      const c = strategyComparison(state);
      const keys: Strategy[] = ["priority", "avalanche", "snowball"];
      return {
        title: REPORTS.strategies,
        subtitle: `Lowest interest: ${STRATEGY_LABELS[c.best]} · ${generated}`,
        sheets: [
          {
            name: "Strategies",
            columns: ["Strategy", "Debt-free", "Months", "Total interest", "Total paid", "Order"],
            rows: keys.map((k) => {
              const r = c.results[k];
              return [STRATEGY_LABELS[k], formatMonth(r.debtFreeMonth, true), r.monthsToDebtFree, r.totalInterest, r.totalPaid, r.order.map((o) => r.debts.find((d) => d.key === o)?.name).join(" → ")];
            }),
            money: [3, 4],
          },
        ],
      };
    }
    case "history": {
      const snaps = await getSnapshots();
      return {
        title: REPORTS.history,
        subtitle: generated,
        sheets: [
          {
            name: "Snapshots",
            columns: ["Month", "Salary", "Other income", "Planned exp.", "Actual exp.", "EMIs", "Extra", "Card", "Interest", "Principal reduced", "Closing debt", "Savings", "Projected debt-free", "Status"],
            rows: snaps.map((h) => [h.month, Number(h.salaryReceived), Number(h.otherIncome), Number(h.plannedExpenses), Number(h.actualExpenses), Number(h.emiPaid), Number(h.extraPaid), Number(h.cardPaid), Number(h.interestPaid), Number(h.principalReduction), Number(h.closingDebt), Number(h.savingsBalance), h.projectedDebtFreeMonth ?? "", h.status]),
            money: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
          },
        ],
      };
    }
    case "plan": {
      const id = Number(params.get("id"));
      const db = getDb();
      const [plan] = Number.isInteger(id) ? await db.select().from(s.repaymentPlans).where(eq(s.repaymentPlans.id, id)) : [];
      if (!plan) throw new Error("Plan not found");
      const items = await db.select().from(s.repaymentPlanItems).where(eq(s.repaymentPlanItems.planId, id)).orderBy(asc(s.repaymentPlanItems.monthIndex), asc(s.repaymentPlanItems.id));
      return {
        title: `Repayment plan: ${plan.name}`,
        subtitle: `${STRATEGY_LABELS[plan.strategy as Strategy] ?? plan.strategy} · debt-free ${formatMonth(plan.debtFreeMonth, true)} · created ${plan.createdAt.toLocaleDateString("en-IN")}`,
        sheets: [
          {
            name: "Schedule",
            columns: ["Month", "Debt", "Opening", "Interest", "Charges", "Payment", "Principal", "Closing"],
            rows: items.map((i) => [formatMonth(i.month), i.debtName, Number(i.opening), Number(i.interest), Number(i.charges), Number(i.payment), Number(i.principal), Number(i.closing)]),
            money: [2, 3, 4, 5, 6, 7],
          },
        ],
      };
    }
  }
}

/* ---------------------------- Renderers ------------------------------ */

function csvEscape(v: Cell): string {
  if (v === null || v === undefined) return "";
  const str = typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v);
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@]/.test(str) && typeof v !== "number" ? `'${str}` : str;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function renderCsv(report: Report): string {
  const parts: string[] = [];
  for (const sheet of report.sheets) {
    if (report.sheets.length > 1) parts.push(csvEscape(sheet.name));
    parts.push(sheet.columns.map(csvEscape).join(","));
    for (const r of sheet.rows) parts.push(r.map(csvEscape).join(","));
    parts.push("");
  }
  return "﻿" + parts.join("\n");
}

export async function renderXlsx(report: Report): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Smart Debt Planner";
  wb.created = new Date();
  for (const sheet of report.sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31));
    ws.addRow([report.title]).font = { bold: true, size: 14 };
    ws.addRow([report.subtitle]).font = { italic: true, color: { argb: "FF666666" } };
    ws.addRow([]);
    const header = ws.addRow(sheet.columns);
    header.font = { bold: true };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F4EF" } };
    for (const r of sheet.rows) ws.addRow(r.map((c) => (c === null ? "" : c)));
    sheet.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = Math.max(12, Math.min(40, c.length + 4));
      if (sheet.money?.includes(i)) col.numFmt = '"₹"#,##,##0.00';
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function renderPdf(report: Report): Promise<Buffer> {
  const { jsPDF } = await import("jspdf");
  const { autoTable } = await import("jspdf-autotable");
  const wide = report.sheets.some((s) => s.columns.length > 6);
  const doc = new jsPDF({ orientation: wide ? "landscape" : "portrait", unit: "pt", format: "a4" });
  // Built-in PDF fonts lack the ₹ glyph, so amounts use "Rs." here.
  const fmt = (v: Cell, money: boolean) =>
    v === null ? "" : typeof v === "number" ? (money ? `Rs. ${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : v.toLocaleString("en-IN")) : String(v).replace(/₹/g, "Rs. ").replace(/→/g, "->").replace(/[^\x00-\xFF]/g, "");
  doc.setFontSize(16);
  doc.text(report.title.replace(/₹/g, "Rs. "), 40, 44);
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(report.subtitle.replace(/₹/g, "Rs. "), 40, 60);
  let y = 76;
  for (const sheet of report.sheets) {
    if (report.sheets.length > 1) {
      doc.setFontSize(11);
      doc.setTextColor(30);
      doc.text(sheet.name, 40, y + 10);
      y += 16;
    }
    autoTable(doc, {
      startY: y,
      head: [sheet.columns],
      body: sheet.rows.map((r) => r.map((c, i) => fmt(c, sheet.money?.includes(i) ?? false))),
      styles: { fontSize: 7.5, cellPadding: 3 },
      headStyles: { fillColor: [15, 157, 118] },
      columnStyles: Object.fromEntries((sheet.money ?? []).map((i) => [i, { halign: "right" as const }])),
      margin: { left: 40, right: 40 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
  }
  return Buffer.from(doc.output("arraybuffer"));
}
