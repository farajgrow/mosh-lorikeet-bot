import { neon } from "@neondatabase/serverless";

/**
 * Site-wide daily message cap for the public demo, so strangers can't drain the API credit.
 * Counted per Sydney calendar day in Postgres (atomic upsert), or in memory when there's no DATABASE_URL.
 * Set DAILY_MESSAGE_CAP to change the limit (default 100).
 */
export const DAILY_CAP = Number(process.env.DAILY_MESSAGE_CAP || 100);

export const CAP_MESSAGE =
  "Thanks for trying the demo! It has reached its limit of AI messages for today, which keeps this free public demo within budget. " +
  "Please come back tomorrow, or watch the walkthrough video. (Urgent-symptom handling still works, because it never uses the AI.)";

/** Today's date in Sydney, e.g. 2026-10-24. */
export const sydneyDay = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });

const memory = new Map<string, number>();
let ready: Promise<unknown> | null = null;

/** Counts one message and returns the new total for today. */
export async function countMessage(now = new Date()): Promise<number> {
  const day = sydneyDay(now);
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    const n = (memory.get(day) ?? 0) + 1;
    memory.set(day, n);
    return n;
  }
  const sql = neon(url);
  ready ??= sql.query("create table if not exists daily_usage (day date primary key, messages integer not null)");
  await ready;
  const rows = (await sql.query(
    "insert into daily_usage (day, messages) values ($1, 1) on conflict (day) do update set messages = daily_usage.messages + 1 returning messages",
    [day],
  )) as { messages: number }[];
  return rows[0].messages;
}

/** True if this message would go over today's cap. Fails open if the counter is unavailable. */
export async function overDailyCap(now = new Date()): Promise<boolean> {
  try {
    return (await countMessage(now)) > DAILY_CAP;
  } catch {
    return false;
  }
}
