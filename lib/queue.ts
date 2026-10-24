import { newId, type Db } from "@/lib/store/db";
import type { QueueItem } from "@/lib/store/types";

export function enqueue(db: Db, item: Omit<QueueItem, "id" | "status" | "createdAt">, now = new Date()): QueueItem {
  const full: QueueItem = { id: newId("q"), status: "pending", createdAt: now.toISOString(), ...item };
  db.queue.unshift(full);
  return full;
}
