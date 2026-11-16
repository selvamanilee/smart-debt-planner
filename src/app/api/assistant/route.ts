import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { aiRecommendations } from "@/lib/db/schema";
import { getFinancialState } from "@/lib/data";
import { answerLocally, sectionsToMarkdown } from "@/lib/assistant/local";
import { aiConfigured, answerWithAI, buildContext } from "@/lib/assistant/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  question: z.string().trim().min(1).max(1000),
  mode: z.enum(["auto", "local"]).default("auto"),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).max(20).default([]),
});

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { question, mode, history } = parsed.data;

  const state = await getFinancialState();
  const s = state.settings;
  // Personal data is only sent to an external AI provider with explicit consent.
  const useAI = mode === "auto" && s.aiEnabled && s.aiConsent && aiConfigured();
  const model = s.aiModel || process.env.AI_MODEL || "anthropic/claude-sonnet-5.5";

  let answer: string;
  let source: "ai" | "local" = "local";
  let note: string | undefined;
  if (useAI) {
    try {
      answer = await answerWithAI(question, history, state, model);
      source = "ai";
    } catch (err) {
      console.error("[assistant] AI call failed, falling back to local engine", err);
      note = "The AI service was unavailable, so this answer comes from the built-in calculation engine.";
      answer = sectionsToMarkdown(answerLocally(question, await buildContext(state)));
    }
  } else {
    answer = sectionsToMarkdown(answerLocally(question, await buildContext(state)));
    if (mode === "auto" && s.aiEnabled && !aiConfigured()) note = "AI is enabled but no AI Gateway credentials are configured — using the built-in engine.";
  }

  await getDb()
    .insert(aiRecommendations)
    .values({ question, answer, source, model: source === "ai" ? model : null, context: { month: state.month, totalDebt: state.totalDebt } })
    .catch((e) => console.error("[assistant] failed to store recommendation", e));

  return NextResponse.json({ answer, source, model: source === "ai" ? model : null, note });
}
