import { buildSeed, type SeedData } from "./seed";
import type { AuditEntry, Conversation, QueueItem } from "./types";

/**
 * In-memory mock backend.
 * Stored on globalThis so Next.js hot reloads and separate API routes share one copy.
 * Swappable for Redis/Postgres later: everything goes through getDb().
 */
export interface Db extends SeedData {
  conversations: Map<string, Conversation>;
  queue: QueueItem[];
  audit: AuditEntry[];
  seededAt: string;
}

const g = globalThis as unknown as { __moshDb?: Db };

function fresh(now = new Date()): Db {
  return {
    ...buildSeed(now),
    conversations: new Map(),
    queue: [],
    audit: [],
    seededAt: now.toISOString(),
  };
}

export function getDb(): Db {
  if (!g.__moshDb) g.__moshDb = fresh();
  return g.__moshDb;
}

export function resetDb(now?: Date): Db {
  g.__moshDb = fresh(now);
  return g.__moshDb;
}

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}
