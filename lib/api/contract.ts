/**
 * API contract between the backend (lib/agent, app/api) and the UI (app/*).
 * The UI depends only on this file + lib/store/types.ts. Keep it stable.
 *
 * Endpoints
 *  POST /api/chat                 body ChatRequest → Server-Sent Events stream:
 *                                   event: trace  data: TraceEvent   (live, one per reasoning step)
 *                                   event: done   data: ChatDone
 *                                   event: error  data: { message: string }
 *  GET  /api/conversations/:id    → ConversationView      (UI polls every ~3s to pick up approval updates)
 *  GET  /api/patients             → PatientCard[]         (demo picker)
 *  GET  /api/patients/:id         → PatientDetail         ("live data" panel: shows changes after actions)
 *  GET  /api/queue                → QueueItem[]           (operator view, newest first)
 *  POST /api/queue/:id            body QueueActionRequest → QueueActionResponse
 *  GET  /api/audit                → AuditEntry[]          (newest first)
 *  POST /api/reset                → { ok: true }          (reseeds data, clears conversations/queue/audit)
 *  GET  /api/evals                → EvalReport | null     (latest results from evals/results.json)
 */
import type {
  AuditEntry,
  Consult,
  Order,
  Payment,
  QueueItem,
  Subscription,
  TraceEvent,
  TranscriptMessage,
} from "@/lib/store/types";

export type { AuditEntry, QueueItem, TraceEvent, TranscriptMessage };

export interface ChatRequest {
  conversationId?: string | null;
  message: string;
}

export interface ConversationView {
  id: string;
  verifiedPatient: { id: string; name: string } | null;
  transcript: TranscriptMessage[];
  trace: TraceEvent[];
}

export interface ChatDone {
  conversationId: string;
  reply: string;
  conversation: ConversationView;
}

export interface PatientCard {
  id: string;
  name: string;
  email: string;
  dob: string;
  demoScenario: string;
  programs: string[];
}

export interface PatientDetail {
  patient: PatientCard;
  subscriptions: Subscription[];
  orders: Order[];
  consults: Consult[];
  payments: Payment[];
}

export interface QueueActionRequest {
  action: "approve" | "reject" | "resolve";
  note?: string;
  approver?: string; // defaults to "Demo Operator"
}

export interface QueueActionResponse {
  item: QueueItem;
  conversation: ConversationView | null;
}

// ---------------------------------------------------------------- evals

export type ExpectedOutcome =
  | "resolved"
  | "escalated_support"
  | "escalated_clinician"
  | "urgent_escalation"
  | "refused"
  | "asked_for_info";

export interface EvalTicket {
  id: string;
  category: string; // e.g. lookup, action, risky, clinical, urgent, injection, multi_intent, vague
  persona?: string; // polite, frustrated, ...
  /** Patient used for verification; omitted for tickets that should never get that far. */
  patientId?: string;
  /** One or more patient messages, sent in order. Use {{email}} / {{dob}} placeholders for verification details. */
  messages: string[];
  expected: ExpectedOutcome;
  /** Optional extra expectations, e.g. a clinician escalation must ALSO happen on a multi-intent ticket. */
  alsoExpect?: ExpectedOutcome[];
  notes?: string;
}

export interface EvalCaseResult {
  ticket: EvalTicket;
  actual: ExpectedOutcome[];
  passed: boolean;
  policyViolations: string[];
  clinicalSafetyViolations: string[];
  transcript: TranscriptMessage[];
  trace: TraceEvent[];
  durationMs: number;
  error?: string;
}

export interface EvalReport {
  runAt: string;
  model: string;
  total: number;
  passed: number;
  resolutionRate: number; // of tickets expected "resolved", share actually resolved
  correctEscalationRate: number; // of tickets expecting any escalation, share escalated to the right queue
  policyViolations: number; // must be 0
  clinicalSafetyViolations: number; // must be 0
  byCategory: Record<string, { total: number; passed: number }>;
  cases: EvalCaseResult[];
}

// ---------------------------------------------------------------- agent entry point (implemented in lib/agent/runTurn.ts)

export interface TurnResult {
  conversationId: string;
  reply: string;
  conversation: ConversationView;
}
/*
 * export async function runTurn(
 *   conversationId: string | null,
 *   message: string,
 *   opts?: { emit?: (e: TraceEvent) => void; now?: Date },
 * ): Promise<TurnResult>
 *
 * The Conversation record (lib/store/types.ts) also carries `outcomes: OutcomeLabel[]`,
 * read it via getDb().conversations.get(id) in the eval runner.
 */
