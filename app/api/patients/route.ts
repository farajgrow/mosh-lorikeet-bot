import { toCard } from "@/lib/api/patients";
import { getDb } from "@/lib/store/db";
import { withDb } from "@/lib/store/persist";

export const dynamic = "force-dynamic";

export async function GET() {
  return withDb(() => Response.json(getDb().patients.map((p) => toCard(p.id))), { write: false });
}
