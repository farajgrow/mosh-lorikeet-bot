import { getDb } from "@/lib/store/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(getDb().audit);
}
