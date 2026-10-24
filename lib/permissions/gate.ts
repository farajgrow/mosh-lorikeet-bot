import { audit } from "@/lib/audit";
import { enqueue } from "@/lib/queue";
import { getSop } from "@/lib/sops";
import { ToolError } from "@/lib/tools/errors";
import { TOOL_MAP } from "@/lib/tools";
import type { ToolContext } from "@/lib/tools/types";

export interface GateResult {
  content: string;
  isError: boolean;
}

const json = (v: unknown) => JSON.stringify(v);

/**
 * THE permission gate. Every tool call the model makes goes through here, and this is the
 * only code path (besides a human approval) that can execute a write action.
 *
 *  1. Unknown tool?               → error
 *  2. Input fails schema?         → error (model output is untrusted)
 *  3. Needs verified patient?     → blocked until verify_patient succeeds
 *  4. Hard rule broken?           → blocked (e.g. order already dispatched, not this patient's record)
 *  5. Policy threshold crossed?   → queued for human approval (e.g. refund > $50)
 *  6. Otherwise                   → executed
 *
 * Nothing the patient types can change these rules: they live in code and SOP data, not in the prompt.
 */
export function runTool(ctx: ToolContext, name: string, rawInput: unknown): GateResult {
  const { db, conv, emit, now } = ctx;
  const tool = TOOL_MAP[name];
  const base = { conversationId: conv.id, patientId: conv.verifiedPatientId, tool: name };

  if (!tool) {
    emit({ kind: "gate", title: `Unknown tool "${name}" refused`, badge: "blocked" });
    return { content: `Unknown tool ${name}.`, isError: true };
  }

  const parsed = tool.schema.safeParse(rawInput);
  if (!parsed.success) {
    emit({ kind: "gate", title: `Rejected malformed input for ${name}`, badge: "blocked", data: { issues: parsed.error.issues } });
    return { content: `Invalid input: ${parsed.error.message}`, isError: true };
  }
  const input = parsed.data as Record<string, unknown>;

  if (tool.requiresVerification && !conv.verifiedPatientId) {
    emit({ kind: "gate", title: `Blocked ${name}: patient not verified yet`, detail: "Account data is locked until identity is verified with email + date of birth.", badge: "blocked" });
    audit(db, { ...base, input, outcome: "blocked", detail: "Patient not verified" }, now);
    return { content: "Blocked: the patient is not verified. Ask for their account email and date of birth, then call verify_patient.", isError: true };
  }

  try {
    // ---- read tools & escalations
    if (tool.run) {
      const output = tool.run(ctx, input);
      const isEscalation = name.startsWith("escalate_");
      emit({
        kind: isEscalation ? "escalation" : "tool_call",
        title: toolTitle(name, output),
        badge: isEscalation ? "escalated" : name === "verify_patient" && !(output as { verified?: boolean }).verified ? "blocked" : "info",
        data: { input, output },
      });
      audit(db, { ...base, patientId: conv.verifiedPatientId, input: redact(name, input), outcome: isEscalation ? "escalated" : "read", detail: shortDetail(output) }, now);
      return { content: json(output), isError: false };
    }

    // ---- write tools
    const assessment = tool.assess!(ctx, input);
    if (!assessment.ok) {
      emit({ kind: "gate", title: `Not allowed: ${name.replace(/_/g, " ")}`, detail: assessment.reason, badge: "blocked", data: { input } });
      audit(db, { ...base, input, outcome: "blocked", detail: assessment.reason }, now);
      conv.outcomes.push("action_blocked");
      return { content: `Not allowed: ${assessment.reason}`, isError: true };
    }

    const needsHuman =
      tool.permission === "requires_approval" ||
      (tool.permission === "auto_under_threshold" && assessment.approvalReasons.length > 0);

    if (needsHuman) {
      const sop = getSop(assessment.sopId);
      const item = enqueue(db, {
        kind: "support",
        urgent: false,
        conversationId: conv.id,
        patientId: conv.verifiedPatientId,
        title: assessment.summary,
        summary: assessment.summary,
        reasoning: String(input.reason ?? ""),
        sopId: sop.id,
        sopStep: `${assessment.sopStep} — ${sop.steps.find((s) => s.id === assessment.sopStep)?.title ?? ""}`.trim(),
        action: { tool: name, input },
        policyNotes: tool.permission === "requires_approval" ? ["This action always requires human approval."] : assessment.approvalReasons,
      }, now);
      emit({
        kind: "gate",
        title: `Paused for human approval: ${assessment.summary}`,
        detail: assessment.approvalReasons.join(" "),
        badge: "approval",
        data: { input, queueItemId: item.id },
      });
      audit(db, { ...base, input, outcome: "queued", detail: assessment.approvalReasons.join(" ") }, now);
      conv.outcomes.push("action_queued");
      return {
        content: json({
          status: "pending_human_approval",
          queueItemId: item.id,
          why: assessment.approvalReasons,
          tellPatient: "This has been sent to our support team for review. Do not say it is done. They usually respond within 1 business day, and the patient will be updated here.",
        }),
        isError: false,
      };
    }

    const output = tool.execute!(ctx, input, conv.verifiedPatientId!);
    if (name === "record_retention_offer") conv.flags.retentionOffers.push({ subscriptionId: String(input.subscriptionId), turn: conv.turn });
    emit({ kind: "gate", title: `Done automatically: ${assessment.summary}`, detail: `Within policy (${tool.permission.replace(/_/g, " ")}).`, badge: "auto", data: { input, output } });
    audit(db, { ...base, input, outcome: "executed", detail: assessment.summary }, now);
    if (name !== "record_retention_offer") conv.outcomes.push("action_executed");
    return { content: json(output), isError: false };
  } catch (err) {
    const msg = err instanceof ToolError ? err.message : `Internal error: ${(err as Error).message}`;
    emit({ kind: "error", title: `${name} failed`, detail: msg, badge: "blocked" });
    audit(db, { ...base, input, outcome: "failed", detail: msg }, now);
    return { content: msg, isError: true };
  }
}

function toolTitle(name: string, output: unknown): string {
  const o = output as Record<string, unknown>;
  switch (name) {
    case "verify_patient":
      return o.verified ? `Identity verified (${o.firstName})` : "Identity check failed — details didn't match";
    case "get_patient_overview":
      return "Looked up patient's programs and consults";
    case "get_orders":
      return "Looked up orders";
    case "get_payments":
      return "Looked up payment history";
    case "get_consults":
      return "Looked up consults";
    case "get_available_slots":
      return "Fetched available appointment times";
    case "escalate_to_clinician":
      return "Escalated to clinician queue";
    case "escalate_to_support":
      return "Handed off to support team";
    default:
      return name;
  }
}

/** Don't write raw DOBs into the audit log. */
function redact(name: string, input: Record<string, unknown>) {
  return name === "verify_patient" ? { ...input, dob: "••••-••-••" } : input;
}

function shortDetail(output: unknown): string {
  const s = JSON.stringify(output);
  return s.length > 160 ? `${s.slice(0, 157)}...` : s;
}
