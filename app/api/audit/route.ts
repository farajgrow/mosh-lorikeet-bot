import { getDb } from "@/lib/store/db";
import { withDb } from "@/lib/store/persist";

export const dynamic = "force-dynamic";

export async function GET() {
  return withDb(() => Response.json(getDb().audit.slice(0, 500)), { write: false });
}
