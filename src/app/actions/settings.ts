"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { requireUser, clearSessionCookie } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/data";
import { seedInitialData, wipeFinancialData } from "@/lib/db/seed";
import type { ActionState } from "@/lib/validation";
import { redirect } from "next/navigation";

export async function setAiPreferencesAction(input: { aiEnabled: boolean; aiConsent: boolean; aiModel?: string | null }): Promise<ActionState> {
  await requireUser();
  const settings = await getSettings();
  const model = input.aiModel?.trim() ? input.aiModel.trim().slice(0, 120) : null;
  if (model && !/^[a-z0-9-]+\/[a-z0-9.\-_:]+$/i.test(model)) return { ok: false, message: "Model id should look like provider/model-name." };
  await getDb()
    .update(s.userSettings)
    .set({
      aiEnabled: input.aiEnabled,
      aiConsent: input.aiConsent,
      aiConsentAt: input.aiConsent && !settings.aiConsent ? new Date() : input.aiConsent ? settings.aiConsentAt : null,
      aiModel: model,
    })
    .where(eq(s.userSettings.id, settings.id));
  await audit("settings", settings.id, "ai_preferences", input);
  revalidatePath("/assistant");
  revalidatePath("/settings");
  return { ok: true, message: input.aiEnabled && input.aiConsent ? "AI assistant enabled with your consent." : "AI preferences saved. Answers use the built-in engine." };
}

export async function clearAssistantHistoryAction(): Promise<ActionState> {
  await requireUser();
  await getDb().delete(s.aiRecommendations);
  await audit("assistant", null, "clear_history");
  revalidatePath("/assistant");
  return { ok: true, message: "Assistant history cleared." };
}

/** Delete all financial data, optionally re-seeding the initial figures. */
export async function deleteAllDataAction(input: { confirm: string; reseed: boolean }): Promise<ActionState> {
  await requireUser();
  if (input.confirm !== "DELETE") return { ok: false, message: 'Type DELETE to confirm.' };
  const db = getDb();
  await wipeFinancialData(db);
  if (input.reseed) await seedInitialData(db);
  await audit("system", null, input.reseed ? "reset_to_initial" : "delete_all_data");
  revalidatePath("/", "layout");
  return { ok: true, message: input.reseed ? "All data deleted and initial figures restored." : "All financial data deleted." };
}

/** Delete the account and every record, then sign out. */
export async function deleteAccountAction(input: { confirm: string }): Promise<ActionState> {
  await requireUser();
  if (input.confirm !== "DELETE ACCOUNT") return { ok: false, message: 'Type DELETE ACCOUNT to confirm.' };
  const db = getDb();
  await wipeFinancialData(db);
  await db.delete(s.auditLog);
  await db.delete(s.users);
  await clearSessionCookie();
  redirect("/setup");
}
