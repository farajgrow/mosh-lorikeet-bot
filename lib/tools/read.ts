import { z } from "zod";
import { DAY_MS, daysBetween, fmtDate, fmtDateTime, money } from "@/lib/format";
import { sopParam } from "@/lib/sops";
import type { Db } from "@/lib/store/db";
import type { Order } from "@/lib/store/types";
import { ToolError } from "./errors";
import { ownConsult, ownSubscription } from "./lookup";
import type { ToolDef } from "./types";

// ---------------------------------------------------------------- identity

export const verifyPatient: ToolDef<{ email: string; dob: string }> = {
  name: "verify_patient",
  description:
    "Verify the patient's identity using the email on their account and their date of birth (YYYY-MM-DD). Required before any account details are shared or changed. Ask the patient for both if not provided.",
  schema: z.object({
    email: z.string().describe("Email address the patient gave"),
    dob: z.string().describe("Date of birth the patient gave, formatted YYYY-MM-DD"),
  }),
  permission: "read",
  requiresVerification: false,
  run(ctx, { email, dob }) {
    const { conv, db } = ctx;
    if (conv.failedVerifications >= 3) {
      throw new ToolError("Verification locked after 3 failed attempts. Escalate to support; do not try again.");
    }
    const match = db.patients.find(
      (p) => p.email.toLowerCase() === email.trim().toLowerCase() && p.dob === dob.trim(),
    );
    if (!match) {
      conv.failedVerifications += 1;
      conv.outcomes.push("verification_failed");
      const left = 3 - conv.failedVerifications;
      // Deliberately does not reveal which field was wrong.
      return { verified: false, message: `Details did not match our records. ${left > 0 ? `${left} attempt(s) left.` : "No attempts left: escalate to support."}` };
    }
    if (conv.verifiedPatientId && conv.verifiedPatientId !== match.id) {
      throw new ToolError("This conversation is already verified as a different patient. Switching patients is not allowed.");
    }
    conv.verifiedPatientId = match.id;
    return { verified: true, patientId: match.id, firstName: match.firstName };
  },
};

// ---------------------------------------------------------------- read tools

function describeOrder(o: Order, now: Date) {
  const late =
    o.status !== "delivered" &&
    o.status !== "skipped" &&
    o.status !== "scheduled" &&
    ((o.chargedAt && daysBetween(o.chargedAt, now) > sopParam("order_status", "lateOrderDays")) ||
      (o.eta && new Date(`${o.eta}T23:59:00`).getTime() < now.getTime()));
  return {
    orderId: o.id,
    subscriptionId: o.subscriptionId,
    status: o.status,
    scheduledFor: fmtDate(o.scheduledFor),
    charged: o.chargedAt ? fmtDate(o.chargedAt) : "not yet",
    dispatched: o.dispatchedAt ? fmtDate(o.dispatchedAt) : null,
    delivered: o.deliveredAt ? fmtDate(o.deliveredAt) : null,
    carrier: o.carrier,
    trackingNumber: o.trackingNumber,
    eta: o.eta ? fmtDate(o.eta) : null,
    holdReason: o.holdReason,
    amount: money(o.amountCents),
    canBeSkipped: o.status === "scheduled",
    isLate: Boolean(late),
  };
}

export const getPatientOverview: ToolDef<Record<string, never>> = {
  name: "get_patient_overview",
  description: "Get the verified patient's name, treatment programs/subscriptions (with status, price, next order date, plan type) and upcoming consults.",
  schema: z.object({}),
  permission: "read",
  requiresVerification: true,
  run({ db, conv }) {
    const pid = conv.verifiedPatientId!;
    const p = db.patients.find((x) => x.id === pid)!;
    return {
      name: `${p.firstName} ${p.lastName}`,
      subscriptions: db.subscriptions
        .filter((s) => s.patientId === pid)
        .map((s) => ({
          subscriptionId: s.id,
          program: s.category,
          treatment: s.treatmentName,
          status: s.status,
          price: money(s.priceCents),
          everyDays: s.frequencyDays,
          nextOrderDate: fmtDate(s.nextOrderDate),
          plan: s.commitAndSave ? "Commit & Save (3-month commitment, termination fee applies)" : "Standard (cancel any time)",
          pausedUntil: s.pausedUntil ? fmtDate(s.pausedUntil) : null,
          cancelledOn: s.cancelledAt ? fmtDate(s.cancelledAt) : null,
        })),
      upcomingConsults: db.consults
        .filter((c) => c.patientId === pid && c.status === "scheduled")
        .map((c) => ({ consultId: c.id, type: c.type, with: c.practitioner, when: fmtDateTime(c.scheduledAt) })),
    };
  },
};

export const getOrders: ToolDef<{ subscriptionId?: string }> = {
  name: "get_orders",
  description:
    "List the verified patient's orders (newest first), optionally for one subscription. Each order shows status, carrier, tracking, ETA, hold reason, whether it can be skipped, and whether it is late.",
  schema: z.object({ subscriptionId: z.string().optional().describe("Limit to one subscription") }),
  permission: "read",
  requiresVerification: true,
  run({ db, conv, now }, { subscriptionId }) {
    const pid = conv.verifiedPatientId!;
    if (subscriptionId) ownSubscription(db, pid, subscriptionId);
    const list = db.orders
      .filter((o) => o.patientId === pid && (!subscriptionId || o.subscriptionId === subscriptionId))
      .sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor))
      .slice(0, 8)
      .map((o) => describeOrder(o, now));
    return { today: fmtDate(now.toISOString()), orders: list };
  },
};

export const getPayments: ToolDef<Record<string, never>> = {
  name: "get_payments",
  description: "List the verified patient's payments with amount, date, how many days ago, amount already refunded, and the status of the linked order.",
  schema: z.object({}),
  permission: "read",
  requiresVerification: true,
  run({ db, conv, now }) {
    const pid = conv.verifiedPatientId!;
    return {
      payments: db.payments
        .filter((p) => p.patientId === pid)
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((p) => {
          const order = p.orderId ? db.orders.find((o) => o.id === p.orderId) : undefined;
          return {
            paymentId: p.id,
            description: p.description,
            amount: money(p.amountCents),
            amountCents: p.amountCents,
            refundableCents: p.status === "declined" ? 0 : p.amountCents - p.refundedCents,
            date: fmtDate(p.date),
            daysAgo: daysBetween(p.date, now),
            status: p.status,
            linkedOrderStatus: order?.status ?? null,
          };
        }),
    };
  },
};

export const getConsults: ToolDef<Record<string, never>> = {
  name: "get_consults",
  description: "List the verified patient's consults (doctor follow-ups and psychologist sessions).",
  schema: z.object({}),
  permission: "read",
  requiresVerification: true,
  run({ db, conv, now }) {
    const pid = conv.verifiedPatientId!;
    return {
      consults: db.consults
        .filter((c) => c.patientId === pid)
        .map((c) => ({
          consultId: c.id,
          type: c.type,
          with: c.practitioner,
          mode: c.mode,
          when: fmtDateTime(c.scheduledAt),
          hoursUntil: Math.round((new Date(c.scheduledAt).getTime() - now.getTime()) / 36e5),
          status: c.status,
          price: money(c.priceCents),
        })),
    };
  },
};

/** Deterministic slot generator: weekdays, four times a day, from minLeadHours ahead. */
export function availableSlots(db: Db, now: Date, consultId: string): string[] {
  const minLead = sopParam("consult_reschedule", "minLeadHours") * 36e5;
  const consult = db.consults.find((c) => c.id === consultId);
  const out: string[] = [];
  for (let d = 0; d < 14 && out.length < 8; d++) {
    const day = new Date(now.getTime() + d * DAY_MS);
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    for (const [h, m] of [[9, 0], [11, 30], [14, 0], [16, 30]]) {
      const t = new Date(day);
      t.setHours(h, m, 0, 0);
      if (t.getTime() - now.getTime() < minLead) continue;
      if (consult && t.toISOString() === consult.scheduledAt) continue;
      out.push(t.toISOString());
      if (out.length >= 8) break;
    }
  }
  return out;
}

export const getAvailableSlots: ToolDef<{ consultId: string }> = {
  name: "get_available_slots",
  description: "Get open appointment times for rescheduling a consult. Returns slot IDs (ISO timestamps) with readable labels. Only offer these times.",
  schema: z.object({ consultId: z.string() }),
  permission: "read",
  requiresVerification: true,
  run({ db, conv, now }, { consultId }) {
    ownConsult(db, conv.verifiedPatientId!, consultId);
    return { slots: availableSlots(db, now, consultId).map((iso) => ({ slot: iso, label: fmtDateTime(iso) })) };
  },
};
