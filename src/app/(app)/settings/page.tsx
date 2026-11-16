import Link from "next/link";
import { desc } from "drizzle-orm";
import { DownloadIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { getSession } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { aiConfigured } from "@/lib/assistant/server";
import { STRATEGY_LABELS, type Strategy } from "@/lib/finance/simulate";
import { formatINR, formatMonth } from "@/lib/format";
import { ChangePasswordForm, DangerZone } from "./settings-client";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [session, settings, logs] = await Promise.all([getSession(), getSettings(), getDb().select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(50)]);
  return (
    <>
      <PageHeader title="Settings" description="Account, privacy, data export and audit history." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Signed in as <strong>{session?.username}</strong>. Passwords are hashed with scrypt.</CardDescription>
          </CardHeader>
          <CardContent><ChangePasswordForm /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Planning preferences</CardTitle>
            <CardDescription>Change these in the <Link className="underline" href="/planner">Repayment Planner</Link>.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-muted-foreground">Default strategy</dt><dd className="font-medium">{STRATEGY_LABELS[settings.preferredStrategy as Strategy]}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Planned monthly savings</dt><dd className="font-medium">{formatINR(settings.plannedMonthlySavings)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Additional repayment</dt><dd className="font-medium">{formatINR(settings.extraMonthlyRepayment)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Plan start</dt><dd className="font-medium">{settings.planStartMonth ? formatMonth(settings.planStartMonth, true) : "Current month"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Stop savings at target</dt><dd className="font-medium">{settings.stopSavingsAtTarget ? "Yes" : "No"}</dd></div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>AI assistant</CardTitle>
            <CardDescription>Manage on the <Link className="underline" href="/assistant">AI Financial Assistant</Link> page.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-sm">
            <Badge variant={aiConfigured() ? "success" : "secondary"}>Gateway {aiConfigured() ? "configured" : "not configured"}</Badge>
            <Badge variant={settings.aiEnabled ? "success" : "secondary"}>AI {settings.aiEnabled ? "enabled" : "disabled"}</Badge>
            <Badge variant={settings.aiConsent ? "success" : "warning"}>Consent {settings.aiConsent ? `given ${settings.aiConsentAt?.toLocaleDateString("en-IN") ?? ""}` : "not given"}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Your data</CardTitle>
            <CardDescription>Download everything as JSON, or delete it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" asChild><a href="/api/data/export"><DownloadIcon /> Export all data (JSON)</a></Button>
            <DangerZone />
          </CardContent>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Audit history</CardTitle>
          <CardDescription>Last 50 changes to your financial records.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[480px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card"><TableRow><TableHead>When</TableHead><TableHead>Entity</TableHead><TableHead>Action</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.createdAt.toLocaleString("en-IN")}</TableCell>
                    <TableCell>{l.entity}{l.entityId ? ` #${l.entityId}` : ""}</TableCell>
                    <TableCell><Badge variant="secondary">{l.action}</Badge></TableCell>
                    <TableCell className="max-w-[420px] truncate font-mono text-xs text-muted-foreground" title={l.changes ? JSON.stringify(l.changes) : ""}>{l.changes ? JSON.stringify(l.changes) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
