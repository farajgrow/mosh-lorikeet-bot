import { resetDb } from "@/lib/store/db";
import { withDb } from "@/lib/store/persist";

export const dynamic = "force-dynamic";

export async function POST() {
  await withDb(() => resetDb(), { write: true });
  return Response.json({ ok: true });
}
