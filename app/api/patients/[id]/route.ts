import type { PatientDetail } from "@/lib/api/contract";
import { getDb } from "@/lib/store/db";
import { toCard } from "@/lib/api/patients";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = toCard(id);
  if (!card) return Response.json({ message: "Patient not found" }, { status: 404 });
  const db = getDb();
  const mine = <T extends { patientId: string }>(xs: T[]) => xs.filter((x) => x.patientId === id);
  const detail: PatientDetail = {
    patient: card,
    subscriptions: mine(db.subscriptions),
    orders: mine(db.orders).sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor)),
    consults: mine(db.consults),
    payments: mine(db.payments).sort((a, b) => b.date.localeCompare(a.date)),
  };
  return Response.json(detail);
}
