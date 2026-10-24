import { newId, type Db } from "@/lib/store/db";
import type { AuditEntry } from "@/lib/store/types";

export function audit(db: Db, e: Omit<AuditEntry, "id" | "ts">, now = new Date()): AuditEntry {
  const entry: AuditEntry = { id: newId("aud"), ts: now.toISOString(), ...e };
  db.audit.unshift(entry);
  return entry;
}
