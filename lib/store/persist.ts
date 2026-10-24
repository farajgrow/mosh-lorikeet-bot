import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { requestDb, freshDb, type Db } from "./db";

/**
 * Postgres persistence for the demo state (Neon, added to the project via the Vercel Marketplace).
 *
 * Design: the whole demo state is one JSONB document in a `demo_state` row with a version number.
 * Each request loads it, runs inside its own copy (AsyncLocalStorage), and saves with an optimistic
 * lock (update ... where version = loaded version). If another request saved first, we do a
 * per-record three-way merge: only records THIS request changed are applied on top of the latest
 * state, so an operator approval and a chat turn running at the same time don't overwrite each other.
 *
 * For a real deployment these would be proper tables; a single document keeps the demo simple
 * and resettable. With no DATABASE_URL, everything stays in memory (local dev, tests, evals).
 */

const ROW_ID = "demo";
type Json = Record<string, unknown>;
type Doc = Omit<Db, "conversations"> & { conversations: Record<string, unknown> };

const dbUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL;
export const persistenceEnabled = () => Boolean(dbUrl());

let sqlClient: NeonQueryFunction<false, false> | null = null;
let schemaReady: Promise<unknown> | null = null;
function sql() {
  sqlClient ??= neon(dbUrl()!);
  // Create the table on first use, so there is no manual SQL step.
  schemaReady ??= sqlClient.query(
    "create table if not exists demo_state (id text primary key, version integer not null, data jsonb not null, updated_at timestamptz not null default now())",
  );
  return { q: sqlClient, ready: schemaReady };
}

const toDoc = (db: Db): Doc => ({ ...db, conversations: Object.fromEntries(db.conversations) });
const fromDoc = (d: Doc): Db => ({ ...d, conversations: new Map(Object.entries(d.conversations)) } as Db);
const clone = <T>(x: T): T => structuredClone(x);

async function load(): Promise<{ db: Db; version: number }> {
  const { q, ready } = sql();
  await ready;
  const rows = (await q.query("select version, data from demo_state where id = $1", [ROW_ID])) as { version: number; data: Doc }[];
  if (rows[0]) return { db: fromDoc(rows[0].data), version: rows[0].version };
  const db = freshDb();
  const inserted = (await q.query("insert into demo_state (id, version, data) values ($1, 1, $2) on conflict (id) do nothing returning version", [ROW_ID, JSON.stringify(toDoc(db))])) as unknown[];
  if (inserted.length === 0) return load(); // another request created it first
  return { db, version: 1 };
}

async function save(db: Db, version: number): Promise<boolean> {
  const { q } = sql();
  const rows = (await q.query(
    "update demo_state set version = version + 1, data = $1, updated_at = now() where id = $2 and version = $3 returning version",
    [JSON.stringify(toDoc(db)), ROW_ID, version],
  )) as unknown[];
  return rows.length > 0;
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

