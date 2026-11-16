import "server-only";
import { getDb } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

export async function audit(entity: string, entityId: string | number | null, action: string, changes?: unknown) {
  try {
    await getDb().insert(auditLog).values({ entity, entityId: entityId === null ? null : String(entityId), action, changes: changes ?? null });
  } catch (err) {
    console.error("[audit] failed to write audit entry", err);
  }
}
