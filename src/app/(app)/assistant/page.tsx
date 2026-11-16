import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/layout/page-header";
import { getDb } from "@/lib/db";
import { aiRecommendations } from "@/lib/db/schema";
import { getSettings } from "@/lib/data";
import { aiConfigured } from "@/lib/assistant/server";
import { AssistantClient } from "./assistant-client";

export const metadata = { title: "AI Financial Assistant" };

export default async function AssistantPage() {
  const [settings, history] = await Promise.all([getSettings(), getDb().select().from(aiRecommendations).orderBy(desc(aiRecommendations.createdAt)).limit(10)]);
  return (
    <>
      <PageHeader title="Personal Debt Optimizer" description="Ask about your debts in plain language. Every number comes from the app's calculation engine, never from the AI's own maths." />
      <AssistantClient
        aiEnabled={settings.aiEnabled}
        aiConsent={settings.aiConsent}
        aiModel={settings.aiModel ?? ""}
        configured={aiConfigured()}
        defaultModel={process.env.AI_MODEL || "anthropic/claude-sonnet-5.5"}
        history={history.reverse().flatMap((h) => [
          { role: "user" as const, content: h.question },
          { role: "assistant" as const, content: h.answer, source: h.source },
        ])}
      />
    </>
  );
}
