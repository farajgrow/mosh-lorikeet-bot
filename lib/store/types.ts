// Domain types for the mock Mosh backend.
// Money is stored in cents to avoid floating point errors.

export type ProgramCategory =
  | "hair_loss"
  | "sexual_health"
  | "skincare"
  | "mental_health"
  | "weight_management";

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  dob: string; // YYYY-MM-DD
  phone: string;
  address: string;
  /** Short note for the demo picker describing the edge case this patient covers. */
  demoScenario: string;
}

export type SubscriptionStatus = "active" | "paused" | "cancelled";

/** A treatment program the patient is subscribed to (one subscription per program). */
export interface Subscription {
  id: string;
  patientId: string;
  category: ProgramCategory;
  treatmentName: string;
  status: SubscriptionStatus;
  priceCents: number;
  frequencyDays: number;
  nextOrderDate: string | null; // ISO date
  commitAndSave: boolean; // 3-month commitment plan with a termination fee
  pausedUntil: string | null;
  cancelledAt: string | null;
  startedAt: string;
}

/**
 * Order lifecycle (mirrors Mosh's public help centre):
 * scheduled  → upcoming, can still be skipped/changed
 * on_hold    → blocked (renewal check-in, consent, payment)
 * processing → charged and awaiting shipment with the pharmacy (no changes / refunds)
 * dispatched → with the carrier
 * delivered  → done
 * skipped    → patient skipped this order
 */
export type OrderStatus =
  | "scheduled"
  | "on_hold"
  | "processing"
  | "dispatched"
  | "delivered"
  | "skipped";

export interface Order {
  id: string;
  patientId: string;
  subscriptionId: string;
  status: OrderStatus;
  scheduledFor: string; // date the order is created/charged
  chargedAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  eta: string | null;
  holdReason: string | null;
  amountCents: number;
}

export type ConsultType = "doctor_follow_up" | "psychologist_session";

export interface Consult {
  id: string;
  patientId: string;
  subscriptionId: string | null;
  type: ConsultType;
  practitioner: string;
  mode: "video" | "phone";
  scheduledAt: string; // ISO datetime
  status: "scheduled" | "completed" | "cancelled";
  priceCents: number;
}

export type PaymentStatus = "paid" | "refunded" | "partially_refunded" | "declined";

export interface Payment {
  id: string;
  patientId: string;
  orderId: string | null;
  consultId: string | null;
  description: string;
  amountCents: number;
  refundedCents: number;
  date: string; // ISO datetime
  status: PaymentStatus;
}

// ---------- Support-side records ----------

export type QueueKind = "support_approval" | "clinician";
export type QueueStatus = "pending" | "approved" | "rejected" | "resolved";

export interface QueueItem {
  id: string;
  kind: QueueKind;
  urgent: boolean;
  status: QueueStatus;
  conversationId: string;
  patientId: string | null;
  createdAt: string;
  title: string;
  /** Summary written for the human reviewer. */
  summary: string;
  /** Why the agent paused, in plain language. */
  reasoning: string;
  sopId: string;
  sopStep: string;
  /** The action to run if approved (support approvals only). */
  action?: { tool: string; input: Record<string, unknown> };
  /** Which policy rules blocked automatic execution. */
  policyNotes?: string[];
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
}

export type AuditOutcome = "executed" | "queued" | "blocked" | "failed" | "escalated" | "read";

export interface AuditEntry {
  id: string;
  ts: string;
  conversationId: string;
  patientId: string | null;
  tool: string;
  input: Record<string, unknown>;
  outcome: AuditOutcome;
  detail: string;
  approver?: string;
}

// ---------- Conversations & trace ----------

export type TraceKind =
  | "message"
  | "safety"
  | "sop"
  | "step"
  | "tool_call"
  | "gate"
  | "escalation"
  | "reply"
  | "error";

export type TraceBadge = "auto" | "approval" | "escalated" | "urgent" | "blocked" | "info";

/** One line in the reasoning panel. Written for a non-engineer to read at a glance. */
export interface TraceEvent {
  id: string;
  ts: string;
  turn: number;
  kind: TraceKind;
  title: string;
  detail?: string;
  badge?: TraceBadge;
  data?: Record<string, unknown>;
}

export interface TranscriptMessage {
  id: string;
  role: "patient" | "agent" | "operator";
  text: string;
  ts: string;
}

export interface Conversation {
  id: string;
  createdAt: string;
  turn: number;
  /** Set only after verify_patient succeeds. Every other tool requires it. */
  verifiedPatientId: string | null;
  failedVerifications: number;
  transcript: TranscriptMessage[];
  trace: TraceEvent[];
  /** Raw model history (SDK message params). Append-only. */
  modelHistory: unknown[];
  /** Notes for the model to see on the next turn (e.g. safety filter replaced a reply). */
  pendingNotes: string[];
  /** SOP state the code enforces, e.g. cancellation flow steps. */
  flags: {
    pauseOfferedFor: string[];
    cancelIntentConfirmedFor: string[];
  };
  /** Outcome labels collected during the conversation (used by evals). */
  outcomes: string[];
}
