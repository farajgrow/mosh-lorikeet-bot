// All demo dates (seed times, appointment slots) are in Sydney time, wherever the server runs (e.g. Vercel = UTC).
process.env.TZ ||= "Australia/Sydney";

import { AsyncLocalStorage } from "node:async_hooks";
import { buildSeed, type SeedData } from "./seed";
import type { AuditEntry, Conversation, QueueItem } from "./types";

/**
 * The mock backend's state.
 *
 * Locally (no Supabase env vars) it lives in memory on globalThis.
 * In production, lib/store/persist.ts loads it from Supabase for each request and runs the
 * handler inside an AsyncLocalStorage context, so concurrent requests each get their own copy.
 * Either way, all code reads it through getDb().
 */
export interface Db extends SeedData {
  conversations: Map<string, Conversation>;
  queue: QueueItem[];
  audit: AuditEntry[];
  seededAt: string;
}

/** A box around the Db so resetDb() can swap it out inside a request context. */
export interface DbHolder {
  db: Db;
}

const g = globalThis as unknown as { __moshDb?: DbHolder };
export const requestDb = new AsyncLocalStorage<DbHolder>();

export function freshDb(now = new Date()): Db {
  return {
    ...buildSeed(now),
    conversations: new Map(),
    queue: [],
    audit: [],
    seededAt: now.toISOString(),
  };
}

function holder(): DbHolder {
  const scoped = requestDb.getStore();
  if (scoped) return scoped;
  g.__moshDb ??= { db: freshDb() };
  return g.__moshDb;
}

export function getDb(): Db {
  return holder().db;
}

export function resetDb(now?: Date): Db {
  const h = holder();
  h.db = freshDb(now);
  return h.db;
}

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
