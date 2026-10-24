import type { Db } from "@/lib/store/db";
import { ToolError } from "./errors";

export function ownSubscription(db: Db, patientId: string, subscriptionId: string) {
  const sub = db.subscriptions.find((s) => s.id === subscriptionId);
  if (!sub || sub.patientId !== patientId) throw new ToolError(`Subscription ${subscriptionId} not found for this patient.`);
  return sub;
}
export function ownOrder(db: Db, patientId: string, orderId: string) {
  const o = db.orders.find((x) => x.id === orderId);
  if (!o || o.patientId !== patientId) throw new ToolError(`Order ${orderId} not found for this patient.`);
  return o;
}
export function ownPayment(db: Db, patientId: string, paymentId: string) {
  const p = db.payments.find((x) => x.id === paymentId);
  if (!p || p.patientId !== patientId) throw new ToolError(`Payment ${paymentId} not found for this patient.`);
  return p;
}
export function ownConsult(db: Db, patientId: string, consultId: string) {
  const c = db.consults.find((x) => x.id === consultId);
  if (!c || c.patientId !== patientId) throw new ToolError(`Consult ${consultId} not found for this patient.`);
  return c;
}
