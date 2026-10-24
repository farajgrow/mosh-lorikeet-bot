import { z } from "zod";
import { addDays, daysBetween, fmtDate, fmtDateTime, money } from "@/lib/format";
import { sopParam } from "@/lib/sops";
import { availableSlots } from "./read";
import { ownConsult, ownOrder, ownPayment, ownSubscription } from "./lookup";
import type { ToolDef } from "./types";

/**
 * Write tools. Each has:
 *  assess()  → hard checks (deny) + policy checks (approval reasons). Pure: never mutates.
 *  execute() → the actual change. Only the gate (after assess) or a human approval calls it.
 */

const reason = z.string().describe("Why you are taking this action, citing the SOP step (shown to human reviewers)");

// ---------------------------------------------------------------- skip

type SkipInput = { orderId: string; reason: string };
export const skipNextOrder: ToolDef<SkipInput> = {
  name: "skip_next_order",
  description: "Skip one upcoming order. Only orders with status 'scheduled' can be skipped; the following order is scheduled one cycle later.",
  schema: z.object({ orderId: z.string(), reason }),
  permission: "auto",
  requiresVerification: true,
  assess({ db, conv }, { orderId }) {
    const pid = conv.verifiedPatientId!;
    const order = ownOrder(db, pid, orderId);
    const sub = ownSubscription(db, pid, order.subscriptionId);
    if (sub.status === "cancelled") return { ok: false, reason: "Subscription is cancelled; nothing to skip." };
    if (order.status !== "scheduled")
      return { ok: false, reason: `Order ${orderId} is '${order.status}' — only scheduled orders can be skipped (SOP OC-E1). It is already with the pharmacy or carrier.` };
    return { ok: true, summary: `Skip order ${orderId} (${fmtDate(order.scheduledFor)}) for ${sub.treatmentName}`, approvalReasons: [], sopId: "order_change", sopStep: "OC-4" };
  },
  execute({ db }, { orderId }, pid) {
    const order = ownOrder(db, pid, orderId);
    const sub = ownSubscription(db, pid, order.subscriptionId);
    order.status = "skipped";
    const next = addDays(order.scheduledFor, sub.frequencyDays);
    db.orders.push({ ...order, id: `${order.id}_n`, status: "scheduled", scheduledFor: next, chargedAt: null });
    sub.nextOrderDate = next;
    return { skipped: orderId, nextOrderDate: fmtDate(next) };
  },
  approvalMessage: (i, ok) => (ok ? `Your order ${i.orderId} has been skipped.` : `We weren't able to skip order ${i.orderId}.`),
};

// ---------------------------------------------------------------- pause

type PauseInput = { subscriptionId: string; resumeDate: string; reason: string };
export const pauseSubscription: ToolDef<PauseInput> = {
  name: "pause_subscription",
  description: "Pause (snooze) a subscription until a resume date (YYYY-MM-DD, max 90 days away). Scheduled orders before that date move to the resume date. Orders already processing are not affected.",
  schema: z.object({ subscriptionId: z.string(), resumeDate: z.string().describe("YYYY-MM-DD"), reason }),
  permission: "auto",
  requiresVerification: true,
  assess({ db, conv, now }, { subscriptionId, resumeDate }) {
    const sub = ownSubscription(db, conv.verifiedPatientId!, subscriptionId);
    if (sub.status !== "active") return { ok: false, reason: `Subscription is ${sub.status}; only active subscriptions can be paused.` };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(resumeDate)) return { ok: false, reason: "resumeDate must be YYYY-MM-DD." };
    const days = -daysBetween(`${resumeDate}T12:00:00`, now);
    const max = sopParam("order_change", "maxPauseDays");
    if (days < 1) return { ok: false, reason: "Resume date must be in the future." };
    if (days > max) return { ok: false, reason: `Pauses are limited to ${max} days (SOP OC-E2). Requested ${days} days.` };
    return { ok: true, summary: `Pause ${sub.treatmentName} until ${fmtDate(resumeDate)}`, approvalReasons: [], sopId: "order_change", sopStep: "OC-4" };
  },
  execute({ db }, { subscriptionId, resumeDate }, pid) {
    const sub = ownSubscription(db, pid, subscriptionId);
    sub.status = "paused";
    sub.pausedUntil = resumeDate;
    sub.nextOrderDate = resumeDate;
    for (const o of db.orders)
      if (o.subscriptionId === subscriptionId && o.status === "scheduled" && o.scheduledFor < resumeDate) o.scheduledFor = resumeDate;
    return { paused: subscriptionId, resumes: fmtDate(resumeDate) };
  },
};

// ---------------------------------------------------------------- reschedule

type RescheduleInput = { consultId: string; newTime: string; reason: string };
export const rescheduleConsult: ToolDef<RescheduleInput> = {
  name: "reschedule_consult",
  description:
    "Move a scheduled consult to a new slot returned by get_available_slots. Psychologist sessions changed within 24 hours incur a 50% fee and are sent to the support team for approval automatically.",
  schema: z.object({ consultId: z.string(), newTime: z.string().describe("A slot value from get_available_slots"), reason }),
  permission: "auto_under_threshold",
  requiresVerification: true,
  assess({ db, conv, now }, { consultId, newTime }) {
    const c = ownConsult(db, conv.verifiedPatientId!, consultId);
    if (c.status !== "scheduled") return { ok: false, reason: `Consult is ${c.status}; only scheduled consults can be moved.` };
    if (!availableSlots(db, now, consultId).includes(newTime))
      return { ok: false, reason: "newTime is not an available slot. Call get_available_slots and use one of those values." };
    const hoursUntil = (new Date(c.scheduledAt).getTime() - now.getTime()) / 36e5;
    const lateHours = sopParam("consult_reschedule", "lateChangeHours");
    const feePct = sopParam("consult_reschedule", "lateChangeFeePercent");
    const approvalReasons: string[] = [];
    if (c.type === "psychologist_session" && hoursUntil < lateHours)
      approvalReasons.push(
        `Late change: session is in ${Math.max(0, Math.round(hoursUntil))}h (< ${lateHours}h). ${feePct}% fee (${money((c.priceCents * feePct) / 100)}) applies unless waived (SOP CR-E1).`,
      );
    return {
      ok: true,
      summary: `Move ${c.type.replace(/_/g, " ")} with ${c.practitioner} from ${fmtDateTime(c.scheduledAt)} to ${fmtDateTime(newTime)}`,
      approvalReasons,
      sopId: "consult_reschedule",
      sopStep: approvalReasons.length ? "CR-4" : "CR-5",
    };
  },
  execute({ db }, { consultId, newTime }, pid) {
    const c = ownConsult(db, pid, consultId);
    c.scheduledAt = newTime;
    return { rescheduled: consultId, newTime: fmtDateTime(newTime) };
  },
  approvalMessage: (i, ok, note) =>
    ok
      ? `Good news — our team approved the change. Your session is now booked for **${fmtDateTime(i.newTime)}**.${note ? ` Note from the team: ${note}` : ""}`
      : `Our team reviewed your reschedule request and couldn't approve it, so your original appointment time stands.${note ? ` Reason: ${note}` : ""}`,
};

// ---------------------------------------------------------------- refund

type RefundInput = { paymentId: string; amountCents: number; reason: string; faultReported: boolean };
export const issueRefund: ToolDef<RefundInput> = {
  name: "issue_refund",
  description:
    "Request a refund for a payment. The system decides: within policy and at or under the auto limit → refunded immediately; otherwise sent to the support team for approval with your reasoning. Set faultReported=true only if the patient reports a damaged/missing/wrong item or pricing error.",
  schema: z.object({
    paymentId: z.string(),
    amountCents: z.number().int().positive().describe("Amount in cents"),
    reason,
    faultReported: z.boolean(),
  }),
  permission: "auto_under_threshold",
  requiresVerification: true,
  assess({ db, conv, now }, { paymentId, amountCents, faultReported }) {
    const p = ownPayment(db, conv.verifiedPatientId!, paymentId);
    if (p.status === "declined") return { ok: false, reason: "That payment was declined, so there is nothing to refund." };
    const refundable = p.amountCents - p.refundedCents;
    if (refundable <= 0) return { ok: false, reason: "This payment has already been fully refunded." };
    if (amountCents > refundable) return { ok: false, reason: `Amount exceeds the refundable balance of ${money(refundable)}.` };

    const limit = sopParam("refund_request", "autoRefundLimitCents");
    const windowDays = sopParam("refund_request", "refundWindowDays");
    const age = daysBetween(p.date, now);
    const order = p.orderId ? db.orders.find((o) => o.id === p.orderId) : undefined;
    const approvalReasons: string[] = [];
    if (amountCents > limit) approvalReasons.push(`Amount ${money(amountCents)} is over the ${money(limit)} automatic refund limit (SOP RF-E3).`);
    if (age > windowDays) approvalReasons.push(`Charge was ${age} days ago, outside the ${windowDays}-day refund window (SOP RF-E2).`);
    if (order && ["processing", "dispatched", "delivered"].includes(order.status))
      approvalReasons.push(`Order ${order.id} is already '${order.status}' — not refundable under policy (SOP RF-E1)${faultReported ? ", but the patient reports a fault" : ""}.`);
    return {
      ok: true,
      summary: `Refund ${money(amountCents)} of payment ${paymentId} (${p.description}, ${fmtDate(p.date)})`,
      approvalReasons,
      sopId: "refund_request",
      sopStep: "RF-4",
    };
  },
  execute({ db }, { paymentId, amountCents }, pid) {
    const p = ownPayment(db, pid, paymentId);
    p.refundedCents += amountCents;
    p.status = p.refundedCents >= p.amountCents ? "refunded" : "partially_refunded";
    return { refunded: money(amountCents), paymentId, arrives: "3-5 business days" };
  },
  approvalMessage: (i, ok, note) =>
    ok
      ? `Good news — our team approved your refund of **${money(i.amountCents)}**. It will appear on your original payment method within 3–5 business days.${note ? ` Note from the team: ${note}` : ""}`
      : `Our team reviewed your refund request for ${money(i.amountCents)} and wasn't able to approve it.${note ? ` Reason: ${note}` : ""} If you'd like to discuss it further, just reply here.`,
};

// ---------------------------------------------------------------- cancellation

type OfferInput = { subscriptionId: string };
export const recordRetentionOffer: ToolDef<OfferInput> = {
  name: "record_retention_offer",
  description: "Record that you are offering the patient a pause instead of cancelling (cancellation SOP step CN-4). Call this in the same reply where you make the offer. Required before cancel_subscription.",
  schema: z.object({ subscriptionId: z.string() }),
  permission: "auto",
  requiresVerification: true,
  assess({ db, conv }, { subscriptionId }) {
    const sub = ownSubscription(db, conv.verifiedPatientId!, subscriptionId);
    if (sub.status === "cancelled") return { ok: false, reason: "Subscription is already cancelled." };
    if (conv.flags.retentionOffers.some((r) => r.subscriptionId === subscriptionId))
      return { ok: false, reason: "A pause has already been offered for this subscription — offer only once (SOP CN-4). Proceed with the patient's decision." };
    return { ok: true, summary: `Offer pause instead of cancelling ${sub.treatmentName}`, approvalReasons: [], sopId: "cancellation", sopStep: "CN-4" };
  },
  execute() {
    return { recorded: true }; // conversation flag is set by the gate (it has the conversation)
  },
};

type CancelInput = { subscriptionId: string; reason: string; patientReason: string };
export const cancelSubscription: ToolDef<CancelInput> = {
  name: "cancel_subscription",
  description:
    "Cancel a subscription after the patient confirmed and declined the pause offer (made in an earlier message via record_retention_offer). Standard plans cancel immediately; Commit & Save plans have a termination fee and are sent for approval.",
  schema: z.object({ subscriptionId: z.string(), reason, patientReason: z.string().describe("The patient's stated reason for cancelling") }),
  permission: "auto_under_threshold",
  requiresVerification: true,
  assess({ db, conv }, { subscriptionId }) {
    const sub = ownSubscription(db, conv.verifiedPatientId!, subscriptionId);
    if (sub.status === "cancelled") return { ok: false, reason: "Subscription is already cancelled." };
    const offer = conv.flags.retentionOffers.find((r) => r.subscriptionId === subscriptionId);
    if (!offer) return { ok: false, reason: "SOP CN-4 not done: offer a pause first with record_retention_offer, then wait for the patient's reply." };
    if (offer.turn >= conv.turn) return { ok: false, reason: "The patient has not replied to the pause offer yet. Wait for their answer before cancelling." };
    const approvalReasons: string[] = [];
    if (sub.commitAndSave) approvalReasons.push("Commit & Save plan: early cancellation incurs a termination fee and needs approval (SOP CN-E2).");
    return { ok: true, summary: `Cancel ${sub.treatmentName} (${sub.commitAndSave ? "Commit & Save" : "standard plan"})`, approvalReasons, sopId: "cancellation", sopStep: "CN-5" };
  },
  execute({ db, now }, { subscriptionId }, pid) {
    const sub = ownSubscription(db, pid, subscriptionId);
    sub.status = "cancelled";
    sub.cancelledAt = now.toISOString();
    sub.nextOrderDate = null;
    let inFlight = 0;
    for (const o of db.orders) {
      if (o.subscriptionId !== subscriptionId) continue;
      if (o.status === "scheduled") o.status = "skipped";
      if (o.status === "processing" || o.status === "dispatched") inFlight++;
    }
    return { cancelled: subscriptionId, ordersStillArriving: inFlight };
  },
  approvalMessage: (_i, ok, note) =>
    ok
      ? `Our team has processed your cancellation. Your subscription is now cancelled and you won't be charged again.${note ? ` Note from the team: ${note}` : ""}`
      : `Our team reviewed your cancellation request and needs to discuss your Commit & Save plan with you before it can be cancelled.${note ? ` ${note}` : ""} They'll be in touch shortly.`,
};
