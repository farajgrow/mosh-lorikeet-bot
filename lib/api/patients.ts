import type { PatientCard } from "@/lib/api/contract";
import { getDb } from "@/lib/store/db";

export function toCard(id: string): PatientCard | null {
  const db = getDb();
  const p = db.patients.find((x) => x.id === id);
  if (!p) return null;
  return {
    id: p.id,
    name: `${p.firstName} ${p.lastName}`,
    email: p.email,
    dob: p.dob,
    demoScenario: p.demoScenario,
    programs: db.subscriptions.filter((s) => s.patientId === p.id).map((s) => s.category),
  };
}
