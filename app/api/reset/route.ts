import { resetDb } from "@/lib/store/db";

export const dynamic = "force-dynamic";

export async function POST() {
  resetDb();
  return Response.json({ ok: true });
}
