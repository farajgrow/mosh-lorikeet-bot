import type { Consult, Order, Patient, Payment, Subscription } from "./types";

/**
 * Seed data is generated relative to "now" so the demo never goes stale:
 * an order that "dispatched yesterday" is always yesterday.
 * All people are fictional. Emails use the reserved example.com domain.
 */
export interface SeedData {
  patients: Patient[];
  subscriptions: Subscription[];
  orders: Order[];
  consults: Consult[];
  payments: Payment[];
}

const DAY = 24 * 60 * 60 * 1000;

export function buildSeed(now: Date = new Date()): SeedData {
  const at = (days: number, hour = 10) => {
    const d = new Date(now.getTime() + days * DAY);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const date = (days: number) => at(days).slice(0, 10);
  const hoursFromNow = (h: number) => new Date(now.getTime() + h * 60 * 60 * 1000).toISOString();

  const patients: Patient[] = [];
  const subscriptions: Subscription[] = [];
  const orders: Order[] = [];
  const consults: Consult[] = [];
  const payments: Payment[] = [];

  let orderSeq = 1000;
  let paySeq = 5000;

  const patient = (p: Omit<Patient, "phone" | "address"> & Partial<Patient>) => {
    patients.push({ phone: "0400 000 000", address: "1 Example St, Sydney NSW 2000", ...p });
  };

  const sub = (s: Partial<Subscription> & Pick<Subscription, "id" | "patientId" | "category" | "treatmentName" | "priceCents">) => {
    subscriptions.push({
      status: "active",
      frequencyDays: 30,
      nextOrderDate: date(14),
      commitAndSave: false,
      pausedUntil: null,
      cancelledAt: null,
      startedAt: date(-120),
      ...s,
    });
  };

  /** Creates an order and (if charged) its payment. */
  const order = (o: Partial<Order> & Pick<Order, "patientId" | "subscriptionId" | "status" | "scheduledFor" | "amountCents">) => {
    const id = `ord_${orderSeq++}`;
    const full: Order = {
      id,
      chargedAt: null,
      dispatchedAt: null,
      deliveredAt: null,
      carrier: null,
      trackingNumber: null,
      eta: null,
      holdReason: null,
      ...o,
    };
    orders.push(full);
    if (full.chargedAt) {
      payments.push({
        id: `pay_${paySeq++}`,
        patientId: full.patientId,
        orderId: id,
        consultId: null,
        description: `Treatment order ${id}`,
        amountCents: full.amountCents,
        refundedCents: 0,
        date: full.chargedAt,
        status: "paid",
      });
    }
    return full;
  };

  const delivered = (patientId: string, subscriptionId: string, daysAgo: number, amountCents: number) =>
    order({
      patientId,
      subscriptionId,
      status: "delivered",
      scheduledFor: date(-daysAgo),
      chargedAt: at(-daysAgo),
      dispatchedAt: at(-daysAgo + 3),
      deliveredAt: at(-daysAgo + 5),
      carrier: "Australia Post Express",
      trackingNumber: `AP${100000 + orderSeq}`,
      amountCents,
    });

  // ---------------------------------------------------------------------
  // P01 Liam — happy path: latest order dispatched, next order skippable
  patient({ id: "pat_01", firstName: "Liam", lastName: "Carter", email: "liam.carter@example.com", dob: "1991-03-14", demoScenario: "Order in transit; next order can be skipped (lookup + skip demo)" });
  sub({ id: "sub_01", patientId: "pat_01", category: "hair_loss", treatmentName: "Oral finasteride + minoxidil", priceCents: 4900, nextOrderDate: date(12) });
  delivered("pat_01", "sub_01", 35, 4900);
  order({ patientId: "pat_01", subscriptionId: "sub_01", status: "dispatched", scheduledFor: date(-5), chargedAt: at(-5), dispatchedAt: at(-1), carrier: "Australia Post Express", trackingNumber: "AP7731904", eta: date(1), amountCents: 4900 });
  order({ patientId: "pat_01", subscriptionId: "sub_01", status: "scheduled", scheduledFor: date(12), amountCents: 4900 });

  // P02 Ava — latest order is processing at the pharmacy (cannot be changed)
  patient({ id: "pat_02", firstName: "Ava", lastName: "Nguyen", email: "ava.nguyen@example.com", dob: "1994-07-02", demoScenario: "Order processing at pharmacy (cannot skip/refund it)" });
  sub({ id: "sub_02", patientId: "pat_02", category: "sexual_health", treatmentName: "Sildenafil 50mg (as needed)", priceCents: 4500, nextOrderDate: date(29) });
  delivered("pat_02", "sub_02", 31, 4500);
  order({ patientId: "pat_02", subscriptionId: "sub_02", status: "processing", scheduledFor: date(-1), chargedAt: at(-1), amountCents: 4500 });
  order({ patientId: "pat_02", subscriptionId: "sub_02", status: "scheduled", scheduledFor: date(29), amountCents: 4500 });

  // P03 Noah — next order already dispatched (skip request ineligible)
  patient({ id: "pat_03", firstName: "Noah", lastName: "Patel", email: "noah.patel@example.com", dob: "1988-11-23", demoScenario: "Order already dispatched (skip ineligible)" });
  sub({ id: "sub_03", patientId: "pat_03", category: "weight_management", treatmentName: "Weight management program (GLP-1)", priceCents: 18900, nextOrderDate: date(28) });
  order({ patientId: "pat_03", subscriptionId: "sub_03", status: "dispatched", scheduledFor: date(-2), chargedAt: at(-2), dispatchedAt: at(0, 8), carrier: "StarTrack (cold chain)", trackingNumber: "ST55120873", eta: date(2), amountCents: 18900 });
  order({ patientId: "pat_03", subscriptionId: "sub_03", status: "scheduled", scheduledFor: date(28), amountCents: 18900 });

  // P04 Mia — small refund eligible for auto-approval (order on hold, under $50)
  patient({ id: "pat_04", firstName: "Mia", lastName: "Thompson", email: "mia.thompson@example.com", dob: "1997-01-30", demoScenario: "Refund under $50 on an unprocessed order (auto refund)" });
  sub({ id: "sub_04", patientId: "pat_04", category: "skincare", treatmentName: "Tretinoin 0.05% cream", priceCents: 3900, nextOrderDate: date(30) });
  delivered("pat_04", "sub_04", 33, 3900);
  order({ patientId: "pat_04", subscriptionId: "sub_04", status: "on_hold", scheduledFor: date(-2), chargedAt: at(-2), holdReason: "Renewal check-in not completed — practitioner cannot issue a new script yet", amountCents: 3900 });

  // P05 Ethan — refund above auto threshold (needs human approval)
  patient({ id: "pat_05", firstName: "Ethan", lastName: "Wilson", email: "ethan.wilson@example.com", dob: "1985-05-09", demoScenario: "Refund over $50 limit → human approval queue (refund demo)" });
  sub({ id: "sub_05", patientId: "pat_05", category: "weight_management", treatmentName: "Weight management program (GLP-1)", priceCents: 18900, nextOrderDate: date(28) });
  delivered("pat_05", "sub_05", 32, 18900);
  order({ patientId: "pat_05", subscriptionId: "sub_05", status: "on_hold", scheduledFor: date(-2), chargedAt: at(-2), holdReason: "Waiting for patient consent to updated treatment plan", amountCents: 18900 });

  // P06 Chloe — refund outside policy window, order already delivered
  patient({ id: "pat_06", firstName: "Chloe", lastName: "Martin", email: "chloe.martin@example.com", dob: "1992-09-17", demoScenario: "Refund outside policy window (delivered 45 days ago)" });
  sub({ id: "sub_06", patientId: "pat_06", category: "skincare", treatmentName: "Custom anti-ageing formula", priceCents: 5900, nextOrderDate: date(15) });
  delivered("pat_06", "sub_06", 45, 5900);
  delivered("pat_06", "sub_06", 15, 5900);

  // P07 Lucas — subscription cancelled 3 days ago
  patient({ id: "pat_07", firstName: "Lucas", lastName: "Brown", email: "lucas.brown@example.com", dob: "1990-02-11", demoScenario: "Recently cancelled subscription (no upcoming orders)" });
  sub({ id: "sub_07", patientId: "pat_07", category: "hair_loss", treatmentName: "Topical finasteride + minoxidil spray", priceCents: 5400, status: "cancelled", cancelledAt: at(-3), nextOrderDate: null });
  delivered("pat_07", "sub_07", 20, 5400);

  // P08 Isla — multiple programs (hair loss + skincare + mental health)
  patient({ id: "pat_08", firstName: "Isla", lastName: "Robinson", email: "isla.robinson@example.com", dob: "1996-12-05", demoScenario: "Multiple programs (agent must ask which one)" });
  sub({ id: "sub_08a", patientId: "pat_08", category: "hair_loss", treatmentName: "Oral minoxidil (female)", priceCents: 3900, nextOrderDate: date(9) });
  sub({ id: "sub_08b", patientId: "pat_08", category: "skincare", treatmentName: "Azelaic acid + niacinamide cream", priceCents: 4900, nextOrderDate: date(20) });
  sub({ id: "sub_08c", patientId: "pat_08", category: "mental_health", treatmentName: "Psychology sessions", priceCents: 0, frequencyDays: 14, nextOrderDate: null });
  delivered("pat_08", "sub_08a", 21, 3900);
  order({ patientId: "pat_08", subscriptionId: "sub_08a", status: "scheduled", scheduledFor: date(9), amountCents: 3900 });
  order({ patientId: "pat_08", subscriptionId: "sub_08b", status: "dispatched", scheduledFor: date(-4), chargedAt: at(-4), dispatchedAt: at(-1), carrier: "Australia Post", trackingNumber: "AP7790221", eta: date(2), amountCents: 4900 });
  order({ patientId: "pat_08", subscriptionId: "sub_08b", status: "scheduled", scheduledFor: date(20), amountCents: 4900 });
  consults.push({ id: "con_08", patientId: "pat_08", subscriptionId: "sub_08c", type: "psychologist_session", practitioner: "Psychologist R. Hale", mode: "video", scheduledAt: at(3, 17), status: "scheduled", priceCents: 12000 });

  // P09 Jack — psychologist session in <24h (reschedule fee applies → approval)
  patient({ id: "pat_09", firstName: "Jack", lastName: "Lee", email: "jack.lee@example.com", dob: "1993-04-27", demoScenario: "Psychologist session within 24h (late-change fee → approval)" });
  sub({ id: "sub_09", patientId: "pat_09", category: "mental_health", treatmentName: "Psychology sessions", priceCents: 0, frequencyDays: 14, nextOrderDate: null });
  consults.push({ id: "con_09", patientId: "pat_09", subscriptionId: "sub_09", type: "psychologist_session", practitioner: "Psychologist T. Moreau", mode: "video", scheduledAt: hoursFromNow(10), status: "scheduled", priceCents: 12000 });

  // P10 Grace — doctor follow-up in 2 days (reschedule auto)
  patient({ id: "pat_10", firstName: "Grace", lastName: "Walker", email: "grace.walker@example.com", dob: "1989-08-08", demoScenario: "Doctor follow-up in 2 days (reschedule demo)" });
  sub({ id: "sub_10", patientId: "pat_10", category: "weight_management", treatmentName: "Weight management program (GLP-1)", priceCents: 18900, nextOrderDate: date(18) });
  delivered("pat_10", "sub_10", 12, 18900);
  order({ patientId: "pat_10", subscriptionId: "sub_10", status: "scheduled", scheduledFor: date(18), amountCents: 18900 });
  consults.push({ id: "con_10", patientId: "pat_10", subscriptionId: "sub_10", type: "doctor_follow_up", practitioner: "Dr. S. Okafor", mode: "phone", scheduledAt: at(2, 11), status: "scheduled", priceCents: 0 });

  // P11 Oliver — Commit & Save plan (cancellation needs approval: termination fee)
  patient({ id: "pat_11", firstName: "Oliver", lastName: "Harris", email: "oliver.harris@example.com", dob: "1987-06-21", demoScenario: "Commit & Save plan — cancellation needs approval" });
  sub({ id: "sub_11", patientId: "pat_11", category: "hair_loss", treatmentName: "Oral finasteride + minoxidil", priceCents: 3900, commitAndSave: true, startedAt: date(-40), nextOrderDate: date(20) });
  delivered("pat_11", "sub_11", 40, 3900);
  delivered("pat_11", "sub_11", 10, 3900);
  order({ patientId: "pat_11", subscriptionId: "sub_11", status: "scheduled", scheduledFor: date(20), amountCents: 3900 });

  // P12 Zoe — standard cancellation (no commitment)
  patient({ id: "pat_12", firstName: "Zoe", lastName: "Clarke", email: "zoe.clarke@example.com", dob: "1995-10-03", demoScenario: "Standard cancellation (pause offered first)" });
  sub({ id: "sub_12", patientId: "pat_12", category: "sexual_health", treatmentName: "Tadalafil 5mg (daily)", priceCents: 5500, nextOrderDate: date(16) });
  delivered("pat_12", "sub_12", 14, 5500);
  order({ patientId: "pat_12", subscriptionId: "sub_12", status: "scheduled", scheduledFor: date(16), amountCents: 5500 });

  // P13 Henry — order dispatched 10 days ago, never delivered (late → escalate)
  patient({ id: "pat_13", firstName: "Henry", lastName: "Scott", email: "henry.scott@example.com", dob: "1983-01-19", demoScenario: "Late order (dispatched 10 days ago) → support investigation" });
  sub({ id: "sub_13", patientId: "pat_13", category: "hair_loss", treatmentName: "Oral finasteride", priceCents: 2900, nextOrderDate: date(20) });
  order({ patientId: "pat_13", subscriptionId: "sub_13", status: "dispatched", scheduledFor: date(-13), chargedAt: at(-13), dispatchedAt: at(-10), carrier: "Australia Post", trackingNumber: "AP7612288", eta: date(-6), amountCents: 2900 });

  // P14 Ruby — used for identity-mismatch tests (wrong DOB supplied in chat)
  patient({ id: "pat_14", firstName: "Ruby", lastName: "Adams", email: "ruby.adams@example.com", dob: "1998-02-14", demoScenario: "Identity mismatch test (try a wrong date of birth)" });
  sub({ id: "sub_14", patientId: "pat_14", category: "skincare", treatmentName: "Tretinoin 0.025% cream", priceCents: 3900, nextOrderDate: date(8) });
  order({ patientId: "pat_14", subscriptionId: "sub_14", status: "scheduled", scheduledFor: date(8), amountCents: 3900 });

  // P15 Leo — latest order on hold because the payment was declined
  patient({ id: "pat_15", firstName: "Leo", lastName: "Mitchell", email: "leo.mitchell@example.com", dob: "1990-12-28", demoScenario: "Order on hold: payment declined" });
  sub({ id: "sub_15", patientId: "pat_15", category: "sexual_health", treatmentName: "Sildenafil 100mg (as needed)", priceCents: 5000, nextOrderDate: date(-1) });
  order({ patientId: "pat_15", subscriptionId: "sub_15", status: "on_hold", scheduledFor: date(-1), holdReason: "Payment declined — card needs updating in Payment Info", amountCents: 5000 });
  payments.push({ id: `pay_${paySeq++}`, patientId: "pat_15", orderId: orders[orders.length - 1].id, consultId: null, description: "Declined charge", amountCents: 5000, refundedCents: 0, date: at(-1), status: "declined" });

  return { patients, subscriptions, orders, consults, payments };
}
