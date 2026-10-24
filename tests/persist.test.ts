import { describe, expect, it } from "vitest";
import { freshDb } from "@/lib/store/db";
import { mergeChanges } from "@/lib/store/persist";

const doc = () => {
  const db = freshDb(new Date("2026-10-24T10:00:00+11:00"));
  return { ...db, conversations: {} as Record<string, unknown> };
};
const clone = <T>(x: T): T => structuredClone(x);

describe("mergeChanges (concurrent saves)", () => {
  it("keeps both an approval and a chat turn that ran at the same time", () => {
    const base = doc();
    // Request A (operator) refunded a payment and resolved a queue item.
    const latest = clone(base);
    latest.payments[0].refundedCents = 100;
    latest.queue.unshift({ id: "q_a", status: "approved" } as never);
    // Request B (chat) started from base, added a conversation and skipped an order.
    const mine = clone(base);
    mine.conversations.conv_b = { id: "conv_b" };
    mine.orders[0].status = "skipped";
    const out = mergeChanges(base, mine, latest);
    expect(out.payments[0].refundedCents).toBe(100);
    expect(out.queue.map((q) => q.id)).toContain("q_a");
    expect(out.orders[0].status).toBe("skipped");
    expect(out.conversations.conv_b).toBeTruthy();
  });

  it("does not overwrite records this request did not change", () => {
    const base = doc();
    const latest = clone(base);
    latest.subscriptions[0].status = "cancelled";
    const mine = clone(base); // untouched copy of subscriptions[0]
    expect(mergeChanges(base, mine, latest).subscriptions[0].status).toBe("cancelled");
  });

  it("a reset by someone else wins over stale changes", () => {
    const base = doc();
    const latest = { ...doc(), seededAt: "later" };
    const mine = clone(base);
    mine.orders[0].status = "skipped";
    expect(mergeChanges(base, mine, latest).seededAt).toBe("later");
  });
});
