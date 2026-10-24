import { beforeEach, describe, expect, it } from "vitest";
import { decideQueueItem } from "@/lib/agent/approvals";
import { createConversation } from "@/lib/agent/runTurn";
import { runTool } from "@/lib/permissions/gate";
import { getDb, resetDb } from "@/lib/store/db";
import type { Conversation } from "@/lib/store/types";

let conv: Conversation;
const ctx = () => ({ db: getDb(), conv, now: new Date(), activeSops: [], emit: () => {} });
const call = (name: string, input: unknown) => runTool(ctx(), name, input);
const verifyAs = (pid: string) => {
  const p = getDb().patients.find((x) => x.id === pid)!;
  return call("verify_patient", { email: p.email, dob: p.dob });
};
const payFor = (pid: string, status: string) => {
  const db = getDb();
  const order = db.orders.find((o) => o.patientId === pid && o.status === status)!;
  return db.payments.find((p) => p.orderId === order.id)!;
};

beforeEach(() => {
  resetDb();
  conv = createConversation();
  conv.turn = 1;
});

describe("verification gate", () => {
  it("blocks account tools until verified", () => {
    const r = call("get_orders", {});
    expect(r.isError).toBe(true);
    expect(r.content).toMatch(/not verified/);
  });
  it("rejects wrong DOB without revealing which field", () => {
    const r = call("verify_patient", { email: "ruby.adams@example.com", dob: "1998-02-15" });
    expect(JSON.parse(r.content).verified).toBe(false);
    expect(r.content).not.toMatch(/dob|birth|email/i);
    expect(conv.verifiedPatientId).toBeNull();
  });
  it("locks after 3 failures", () => {
    for (let i = 0; i < 3; i++) call("verify_patient", { email: "ruby.adams@example.com", dob: "2000-01-01" });
    expect(verifyAs("pat_14").isError).toBe(true);
  });
  it("cannot switch to another patient mid-conversation", () => {
    verifyAs("pat_01");
    expect(verifyAs("pat_05").isError).toBe(true);
    expect(conv.verifiedPatientId).toBe("pat_01");
  });
  it("cannot touch another patient's records", () => {
    verifyAs("pat_04");
    const other = payFor("pat_05", "on_hold");
    const r = call("issue_refund", { paymentId: other.id, amountCents: 100, reason: "x", faultReported: false });
    expect(r.isError).toBe(true);
    expect(getDb().payments.find((p) => p.id === other.id)!.refundedCents).toBe(0);
  });
});

describe("schema validation", () => {
  it("rejects malformed input", () => {
    verifyAs("pat_04");
    expect(call("issue_refund", { paymentId: "x", amountCents: "lots" }).isError).toBe(true);
  });
});

describe("skip", () => {
  it("skips a scheduled order automatically", () => {
    verifyAs("pat_01");
    const o = getDb().orders.find((x) => x.patientId === "pat_01" && x.status === "scheduled")!;
    const r = call("skip_next_order", { orderId: o.id, reason: "OC-4" });
    expect(r.isError).toBe(false);
    expect(o.status).toBe("skipped");
  });
  it("blocks skipping a dispatched order", () => {
    verifyAs("pat_03");
    const o = getDb().orders.find((x) => x.patientId === "pat_03" && x.status === "dispatched")!;
    const r = call("skip_next_order", { orderId: o.id, reason: "x" });
    expect(r.isError).toBe(true);
    expect(o.status).toBe("dispatched");
  });
});

describe("refunds", () => {
  it("auto-refunds under $50 on an unprocessed order", () => {
    verifyAs("pat_04");
    const p = payFor("pat_04", "on_hold");
    const r = call("issue_refund", { paymentId: p.id, amountCents: p.amountCents, reason: "RF-4", faultReported: false });
    expect(r.isError).toBe(false);
    expect(p.status).toBe("refunded");
  });
  it("queues refunds over $50 and does NOT execute them", () => {
    verifyAs("pat_05");
    const p = payFor("pat_05", "on_hold");
    const r = call("issue_refund", { paymentId: p.id, amountCents: p.amountCents, reason: "RF-4", faultReported: false });
    expect(JSON.parse(r.content).status).toBe("pending_human_approval");
    expect(p.refundedCents).toBe(0);
    const item = getDb().queue[0];
    expect(item.policyNotes?.join(" ")).toMatch(/over the \$50\.00/);
  });
  it("queues refunds outside the window or on delivered orders", () => {
    verifyAs("pat_06");
    const p = getDb().payments.filter((x) => x.patientId === "pat_06").sort((a, b) => a.date.localeCompare(b.date))[0];
    const r = call("issue_refund", { paymentId: p.id, amountCents: 1000, reason: "x", faultReported: false });
    expect(JSON.parse(r.content).status).toBe("pending_human_approval");
    expect(p.refundedCents).toBe(0);
  });
  it("blocks refunding more than was paid", () => {
    verifyAs("pat_04");
    const p = payFor("pat_04", "on_hold");
    expect(call("issue_refund", { paymentId: p.id, amountCents: p.amountCents + 1, reason: "x", faultReported: false }).isError).toBe(true);
  });
  it("human approval executes the queued refund and messages the patient", () => {
    verifyAs("pat_05");
    const p = payFor("pat_05", "on_hold");
    call("issue_refund", { paymentId: p.id, amountCents: p.amountCents, reason: "RF-4", faultReported: false });
    const item = decideQueueItem(getDb().queue[0].id, "approve", { approver: "Sam" });
    expect(item.status).toBe("approved");
    expect(p.status).toBe("refunded");
    expect(conv.transcript.at(-1)?.text).toMatch(/approved your refund/);
    expect(getDb().audit[0].approver).toBe("Sam");
  });
});

describe("cancellation flow", () => {
  it("blocks cancel without a prior pause offer", () => {
    verifyAs("pat_12");
    expect(call("cancel_subscription", { subscriptionId: "sub_12", reason: "x", patientReason: "y" }).isError).toBe(true);
  });
  it("blocks cancel in the same turn as the offer", () => {
    verifyAs("pat_12");
    call("record_retention_offer", { subscriptionId: "sub_12" });
    expect(call("cancel_subscription", { subscriptionId: "sub_12", reason: "x", patientReason: "y" }).isError).toBe(true);
  });
  it("offers pause only once", () => {
    verifyAs("pat_12");
    call("record_retention_offer", { subscriptionId: "sub_12" });
    expect(call("record_retention_offer", { subscriptionId: "sub_12" }).isError).toBe(true);
  });
  it("cancels a standard plan after the patient declines the pause", () => {
    verifyAs("pat_12");
    call("record_retention_offer", { subscriptionId: "sub_12" });
    conv.turn = 2;
    expect(call("cancel_subscription", { subscriptionId: "sub_12", reason: "CN-5", patientReason: "no longer needed" }).isError).toBe(false);
    expect(getDb().subscriptions.find((s) => s.id === "sub_12")!.status).toBe("cancelled");
  });
  it("queues Commit & Save cancellations", () => {
    verifyAs("pat_11");
    call("record_retention_offer", { subscriptionId: "sub_11" });
    conv.turn = 2;
    const r = call("cancel_subscription", { subscriptionId: "sub_11", reason: "CN-5", patientReason: "cost" });
    expect(JSON.parse(r.content).status).toBe("pending_human_approval");
    expect(getDb().subscriptions.find((s) => s.id === "sub_11")!.status).toBe("active");
  });
});

describe("consult reschedule", () => {
  it("queues a psychologist change within 24h", () => {
    verifyAs("pat_09");
    const slots = JSON.parse(call("get_available_slots", { consultId: "con_09" }).content).slots;
    const r = call("reschedule_consult", { consultId: "con_09", newTime: slots[2].slot, reason: "CR-5" });
    expect(JSON.parse(r.content).status).toBe("pending_human_approval");
  });
  it("moves a doctor follow-up automatically, but only to a real slot", () => {
    verifyAs("pat_10");
    expect(call("reschedule_consult", { consultId: "con_10", newTime: "2030-01-01T03:00:00.000Z", reason: "x" }).isError).toBe(true);
    const slots = JSON.parse(call("get_available_slots", { consultId: "con_10" }).content).slots;
    expect(call("reschedule_consult", { consultId: "con_10", newTime: slots[0].slot, reason: "CR-5" }).isError).toBe(false);
    expect(getDb().consults.find((c) => c.id === "con_10")!.scheduledAt).toBe(slots[0].slot);
  });
});
