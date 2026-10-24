/**
 * Checks the Postgres persistence layer end to end: reset, write, read back, and two
 * concurrent writes that must both survive (optimistic lock + merge).
 * Usage: npm run db:check   (needs DATABASE_URL in .env.local)
 */
import { getDb, resetDb } from "@/lib/store/db";
import { persistenceEnabled, withDb } from "@/lib/store/persist";

async function main() {
  if (!persistenceEnabled()) {
    console.error("DATABASE_URL is not set.");
    process.exit(2);
  }
  const t0 = Date.now();
  await withDb(() => resetDb(), { write: true });
  console.log(`reset ok (${Date.now() - t0}ms)`);

  await withDb(() => { getDb().orders[0].holdReason = "db-check write"; }, { write: true });
  const back = await withDb(() => getDb().orders[0].holdReason, { write: false });
  console.log(`read back: ${back === "db-check write" ? "ok" : `FAIL (${back})`}`);

  // Two requests start from the same version and save at the same time.
  const slow = (fn: () => void) => withDb(async () => { fn(); await new Promise((r) => setTimeout(r, 300)); }, { write: true });
  await Promise.all([
    slow(() => { getDb().payments[0].refundedCents = 123; }),
    slow(() => { getDb().subscriptions[0].status = "paused"; }),
  ]);
  const [refund, status] = await withDb(() => [getDb().payments[0].refundedCents, getDb().subscriptions[0].status], { write: false });
  console.log(`concurrent writes merged: ${refund === 123 && status === "paused" ? "ok" : `FAIL (refund=${refund}, status=${status})`}`);

  await withDb(() => resetDb(), { write: true });
  console.log("reset back to clean seed. done.");
}
main().catch((e) => { console.error(e); process.exit(1); });
