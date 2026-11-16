import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { REPORTS, buildReport, renderCsv, renderPdf, renderXlsx, type ReportKey } from "@/lib/reports";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ report: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { report } = await params;
  if (!(report in REPORTS)) return NextResponse.json({ error: "Unknown report" }, { status: 404 });
  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  try {
    const data = await buildReport(report as ReportKey, req.nextUrl.searchParams);
    const base = `smart-debt-planner-${report}-${new Date().toISOString().slice(0, 10)}`;
    await audit("export", report, format);
    if (format === "xlsx") {
      return new NextResponse(new Uint8Array(await renderXlsx(data)), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${base}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }
    if (format === "pdf") {
      return new NextResponse(new Uint8Array(await renderPdf(data)), {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${base}.pdf"`, "Cache-Control": "no-store" },
      });
    }
    return new NextResponse(renderCsv(data), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"`, "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[export]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Export failed" }, { status: 400 });
  }
}
