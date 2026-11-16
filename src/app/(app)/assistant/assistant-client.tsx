"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BotIcon, CpuIcon, Loader2Icon, SendIcon, ShieldCheckIcon, SparklesIcon, Trash2Icon, UserIcon } from "lucide-react";
import { setAiPreferencesAction, clearAssistantHistoryAction } from "@/app/actions/settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Markdown } from "@/components/markdown";
import { Notice } from "@/components/notice";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string; source?: string; note?: string };

const SUGGESTIONS = [
  "How much can I pay this month?",
  "Which loan should I close first?",
  "How much interest am I paying?",
  "What if my salary increases by ₹10,000?",
  "What if I reduce expenses by ₹2,000?",
  "Can I close all loans within two years?",
  "How much extra income do I need?",
  "What if I receive a ₹50,000 bonus?",
  "Which strategy saves the most interest?",
  "Show the next six months of repayments",
  "Why has my debt-free date changed?",
];

export function AssistantClient({ aiEnabled, aiConsent, aiModel, configured, authMethod, defaultModel, history }: { aiEnabled: boolean; aiConsent: boolean; aiModel: string; configured: boolean; authMethod: "api_key" | "vercel_oidc" | null; defaultModel: string; history: Msg[] }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(history);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(aiEnabled);
  const [consent, setConsent] = useState(aiConsent);
  const [model, setModel] = useState(aiModel);
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  const aiActive = aiEnabled && aiConsent && configured;

  async function ask(q: string) {
    const question = q.trim();
    if (!question || loading) return;
    setInput("");
    const next: Msg[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history: next.slice(-9, -1).map((m) => ({ role: m.role, content: m.content.slice(0, 8000) })) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Request failed (${res.status})`);
      const data = await res.json();
      setMessages([...next, { role: "assistant", content: data.answer, source: data.source, note: data.note }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not get an answer.");
      setMessages(next);
    } finally {
      setLoading(false);
    }
  }

  const savePrefs = () =>
    start(async () => {
      if (enabled && !consent) {
        toast.error("Tick the consent box to allow sending your financial data to the AI provider.");
        return;
      }
      const r = await setAiPreferencesAction({ aiEnabled: enabled, aiConsent: consent, aiModel: model || null });
      if (r?.ok) {
        toast.success(r.message);
        router.refresh();
      } else toast.error(r?.message);
    });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="min-h-[70vh] gap-0 py-0">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <BotIcon className="size-4 text-primary" /> Personal Debt Optimizer
            {aiActive ? <Badge><SparklesIcon /> AI + engine</Badge> : <Badge variant="secondary"><CpuIcon /> Built-in engine</Badge>}
          </div>
          {messages.length ? (
            <Button variant="ghost" size="sm" onClick={() => { if (window.confirm("Clear the conversation history?")) start(async () => { await clearAssistantHistoryAction(); setMessages([]); }); }}>
              <Trash2Icon /> Clear
            </Button>
          ) : null}
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5" aria-live="polite">
          {messages.length === 0 ? (
            <div className="mx-auto max-w-xl py-8 text-center">
              <BotIcon className="mx-auto size-10 text-primary" />
              <h2 className="mt-3 font-semibold">Ask anything about your debts</h2>
              <p className="mt-1 text-sm text-muted-foreground">Answers use your saved salary, expenses, loans and cards, and always include status, action, impact, risks and next step.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.slice(0, 6).map((s) => (
                  <button key={s} onClick={() => ask(s)} className="rounded-full border bg-background px-3 py-1.5 text-xs hover:bg-muted cursor-pointer">{s}</button>
                ))}
              </div>
            </div>
          ) : null}
          {messages.map((m, i) => (
            <div key={i} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
              <span className={cn("grid size-7 shrink-0 place-items-center rounded-full", m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted")}>
                {m.role === "user" ? <UserIcon className="size-3.5" /> : <BotIcon className="size-3.5" />}
              </span>
              <div className={cn("max-w-[85%] rounded-xl px-4 py-3", m.role === "user" ? "bg-primary text-primary-foreground" : "border bg-card")}>
                {m.role === "user" ? <p className="text-sm whitespace-pre-wrap">{m.content}</p> : <Markdown text={m.content} />}
                {m.role === "assistant" ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2 text-[11px] text-muted-foreground">
                    {m.source === "ai" ? "AI explanation · numbers from the calculation engine" : "Built-in calculation engine · no AI used"}
                    {m.note ? <span className="text-warning">{m.note}</span> : null}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2Icon className="size-4 animate-spin" /> Calculating…</div>
          ) : null}
          <div ref={endRef} />
        </div>
        <form
          className="flex items-end gap-2 border-t p-3"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <Textarea
            aria-label="Your question"
            value={input}
            maxLength={1000}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            placeholder="e.g. What if I pay ₹50,000 to the friend loan in January?"
            className="min-h-11 resize-none"
            rows={1}
          />
          <Button type="submit" size="icon" aria-label="Send" disabled={loading || !input.trim()}><SendIcon /></Button>
        </form>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ShieldCheckIcon className="size-4" /> AI & privacy</CardTitle>
            <CardDescription>The built-in engine always works offline. AI only rephrases and explains engine results.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {!configured ? (
              <Notice tone="info" title="AI Gateway not configured">Set <code>AI_GATEWAY_API_KEY</code> to use AI. Everything else works without it.</Notice>
            ) : authMethod === "vercel_oidc" ? (
              <Notice tone="info" title="AI Gateway via Vercel">Uses your Vercel team&apos;s AI Gateway automatically. To turn AI on: switch on “Use AI”, tick the consent box and save. If AI Gateway has no credits, answers fall back to the built-in engine and say why.</Notice>
            ) : null}
            {configured && !aiEnabled ? <p className="text-xs text-muted-foreground">AI is currently off — answers come from the built-in engine.</p> : null}
            <label className="flex items-center justify-between gap-3">
              <span className="font-medium">Use AI for answers</span>
              <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Use AI for answers" />
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span className="text-muted-foreground">
                I consent to sending my saved financial figures (income, expenses, balances, rates) to the AI provider through Vercel AI Gateway to answer my questions. I can withdraw consent at any time.
              </span>
            </label>
            <div className="space-y-1.5">
              <Label htmlFor="ai-model">Model (optional)</Label>
              <Input id="ai-model" placeholder={defaultModel} value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
            <Button className="w-full" variant="outline" disabled={pending} onClick={savePrefs}>Save AI preferences</Button>
            <p className="text-xs text-muted-foreground">The assistant can never record, confirm or change payments or balances.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Try asking</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} disabled={loading} onClick={() => ask(s)} className="rounded-full border bg-background px-3 py-1.5 text-left text-xs hover:bg-muted cursor-pointer disabled:opacity-50">{s}</button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
