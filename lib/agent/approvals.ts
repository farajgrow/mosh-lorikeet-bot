import { audit } from "@/lib/audit";
import { getDb, newId } from "@/lib/store/db";
import type { QueueItem } from "@/lib/store/types";
import { makeEmitter } from "@/lib/trace";
import { TOOL_MAP } from "@/lib/tools";
import { ToolError } from "@/lib/tools/errors";

/**
 * A human decision on a queue item. Approval re-runs the tool's hard checks (state may have
 * changed since it was queued), then executes. The patient's conversation is updated with a
 * templated message — no model call, so it is instant and predictable.
 */
export function decideQueueItem(
  id: string,
  action: "approve" | "reject" | "resolve",
  opts: { note?: string; approver?: string; now?: Date } = {},
): QueueItem {
  const db = getDb();
  const now = opts.now ?? new Date();
  const approver = opts.approver?.trim() || "Demo Operator";
  const item = db.queue.find((q) => q.id === id);
  if (!item) throw new Error("Queue item not found");
  if (item.status !== "pending") throw new Error(`Item already ${item.status}`);

  const conv = db.conversations.get(item.conversationId) ?? null;
  const emit = conv ? makeEmitter(conv) : () => {};
  const say = (text: string) => {
    if (!conv) return;
    conv.transcript.push({ id: newId("m"), role: "agent", text, ts: now.toISOString() });
    conv.pendingNotes.push(`A human operator (${approver}) ${item.status} the queued item "${item.title}". The patient was told: ${text}`);
  };

  item.resolvedAt = now.toISOString();
  item.resolvedBy = approver;
  item.resolutionNote = opts.note;

  if (item.action && (action === "approve" || action === "reject")) {
    const tool = TOOL_MAP[item.action.tool];
    const input = item.action.input;
    if (action === "approve") {
      try {
        if (!conv || !item.patientId) throw new ToolError("Conversation or patient missing.");
        const check = tool.assess!({ db, conv, now, activeSops: [], emit }, input);
        if (!check.ok) throw new ToolError(check.reason);
        const output = tool.execute!({ db, now }, input, item.patientId);
        item.status = "approved";
        audit(db, { conversationId: item.conversationId, patientId: item.patientId, tool: tool.name, input, outcome: "executed", detail: `Approved by human. ${JSON.stringify(output)}`, approver }, now);
        emit({ kind: "gate", title: `Approved by ${approver}: ${item.title}`, detail: opts.note, badge: "auto", data: { output } });
        say(tool.approvalMessage?.(input as never, true, opts.note) ?? "Our team approved your request.");
      } catch (err) {
        item.status = "rejected";
        item.resolutionNote = `Could not execute: ${(err as Error).message}`;
        audit(db, { conversationId: item.conversationId, patientId: item.patientId, tool: tool.name, input, outcome: "failed", detail: item.resolutionNote, approver }, now);
        emit({ kind: "error", title: "Approved action could not run", detail: item.resolutionNote, badge: "blocked" });
        say("Our team tried to complete your request but something has changed on your account. A team member will contact you directly.");
      }
    } else {
      item.status = "rejected";
      audit(db, { conversationId: item.conversationId, patientId: item.patientId, tool: tool.name, input, outcome: "blocked", detail: `Rejected by human. ${opts.note ?? ""}`.trim(), approver }, now);
      emit({ kind: "gate", title: `Rejected by ${approver}: ${item.title}`, detail: opts.note, badge: "blocked" });
      say(tool.approvalMessage?.(input as never, false, opts.note) ?? "Our team reviewed your request and couldn't approve it.");
    }
    return item;
  }

  // Handoffs and clinician escalations are "resolved".
  item.status = "resolved";
  audit(db, { conversationId: item.conversationId, patientId: item.patientId, tool: item.kind === "clinician" ? "clinician_review" : "support_handoff", input: {}, outcome: "executed", detail: `Resolved. ${opts.note ?? ""}`.trim(), approver }, now);
  emit({ kind: "escalation", title: `${item.kind === "clinician" ? "Clinician" : "Support"} resolved: ${item.title}`, detail: opts.note, badge: "escalated" });
  if (item.kind === "clinician") {
    say(`A member of our medical team has reviewed your question${opts.note ? `: ${opts.note}` : " and will follow up with you in the Medical Care tab"}.`);
  } else {
    say(`Our support team has picked this up${opts.note ? `: ${opts.note}` : " and will be in touch shortly"}.`);
  }
  return item;
}
