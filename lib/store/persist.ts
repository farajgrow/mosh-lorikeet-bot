import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requestDb, freshDb, type Db } from "./db";

/**
 * Supabase persistence for the demo state.
 *
 * Design: the whole demo state is one JSONB document in a `demo_state` row with a version number.
 * Each request loads it, runs inside its own copy (AsyncLocalStorage), and saves with an optimistic
 * lock (update ... where version = loaded version). If another request saved first, we do a
 * per-record three-way merge: only records THIS request changed are applied on top of the latest
 * state, so an operator approval and a chat turn running at the same time don't overwrite each other.
 *
 * For a real deployment these would be proper tables; a single document keeps the demo simple
 * and resettable. With no SUPABASE_* env vars, everything stays in memory (local dev, tests, evals).
 */

const ROW_ID = "demo";
type Json = Record<string, unknown>;
type Doc = Omit<Db, "conversations"> & { conversations: Record<string, unknown> };

let client: SupabaseClient | null = null;
export const persistenceEnabled = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

function sb(): SupabaseClient {
  client ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  return client;
}

const toDoc = (db: Db): Doc => ({ ...db, conversations: Object.fromEntries(db.conversations) });
const fromDoc = (d: Doc): Db => ({ ...d, conversations: new Map(Object.entries(d.conversations)) } as Db);
const clone = <T>(x: T): T => structuredClone(x);

async function load(): Promise<{ db: Db; version: number }> {
  const { data, error } = await sb().from("demo_state").select("version, data").eq("id", ROW_ID).maybeSingle();
  if (error) throw new Error(`Supabase load failed: ${error.message}`);
  if (data) return { db: fromDoc(data.data as Doc), version: data.version as number };
  const db = freshDb();
  const ins = await sb().from("demo_state").insert({ id: ROW_ID, version: 1, data: toDoc(db) });
  if (ins.error && ins.error.code !== "23505") throw new Error(`Supabase init failed: ${ins.error.message}`);
  if (ins.error) return load(); // another request created it first
  return { db, version: 1 };
}

async function save(db: Db, version: number): Promise<boolean> {
  const { data, error } = await sb()
    .from("demo_state")
    .update({ version: version + 1, data: toDoc(db), updated_at: new Date().toISOString() })
    .eq("id", ROW_ID)
    .eq("version", version)
    .select("version");
  if (error) throw new Error(`Supabase save failed: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** Collections merged record-by-record (by id). */
const COLLECTIONS = ["patients", "subscriptions", "orders", "consults", "payments", "queue", "audit"] as const;

/** Apply only what `mine` changed relative to `base` onto `latest`. */
export function mergeChanges(base: Doc, mine: Doc, latest: Doc): Doc {
  if (mine.seededAt !== base.seededAt) return mine; // this request reset the demo: reset wins
  if (latest.seededAt !== base.seededAt) return latest; // someone else reset: drop our stale changes
  const out = clone(latest);
  for (const key of COLLECTIONS) {
    const baseById = new Map((base[key] as unknown as Json[]).map((x) => [x.id, JSON.stringify(x)]));
    const outArr = out[key] as unknown as Json[];
    const outIdx = new Map(outArr.map((x, i) => [x.id, i]));
    for (const item of mine[key] as unknown as Json[]) {
      if (baseById.get(item.id) === JSON.stringify(item)) continue; // unchanged by us
      const i = outIdx.get(item.id);
      if (i !== undefined) outArr[i] = item;
      else if (key === "queue" || key === "audit") outArr.unshift(item); // newest first
      else outArr.push(item);
    }
  }
  for (const [id, conv] of Object.entries(mine.conversations)) {
    if (JSON.stringify(base.conversations[id]) !== JSON.stringify(conv)) out.conversations[id] = conv;
  }
  return out;
}

/**
 * Run a request handler against the shared demo state.
 * Reads skip the save. Writes save with an optimistic lock and merge on conflict.
 */
export async function withDb<T>(fn: () => Promise<T> | T, opts: { write: boolean }): Promise<T> {
  if (!persistenceEnabled()) return fn();

  const { db, version } = await load();
  const base = opts.write ? clone(toDoc(db)) : null;
  const box = { db };
  const result = await requestDb.run(box, fn);
  if (!opts.write) return result;

  let mine = toDoc(box.db);
  let v = version;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (await save(fromDoc(mine), v)) return result;
    const latest = await load();
    mine = mergeChanges(base!, mine, toDoc(latest.db));
    v = latest.version;
  }
  throw new Error("Could not save demo state after several attempts (too much concurrent traffic).");
}

