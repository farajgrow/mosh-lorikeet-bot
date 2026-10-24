import Anthropic from "@anthropic-ai/sdk";
import type { ConversationView, TurnResult } from "@/lib/api/contract";
import { audit } from "@/lib/audit";
import { runTool } from "@/lib/permissions/gate";
import { enqueue } from "@/lib/queue";
import { classifyMessage } from "@/lib/safety/classifier";
import { CLINICAL_HOLDING, URGENT_RESPONSE } from "@/lib/safety/messages";
import { detectMedicalAdvice } from "@/lib/safety/postcheck";
import { getSop, type SopId } from "@/lib/sops";
import { getDb, newId } from "@/lib/store/db";
import type { Conversation, TraceEvent } from "@/lib/store/types";
import { makeEmitter, type Emit } from "@/lib/trace";
import { toolDefinitionsForModel } from "@/lib/tools";
import { AGENT_MODEL, getClient, supportsFallback } from "./model";
import { SYSTEM_PROMPT, turnContext } from "./prompts";
import { selectSop } from "./selectSop";

type Msg = Anthropic.Beta.Messages.BetaMessageParam;
const MAX_STEPS = 8;

export function createConversation(now = new Date()): Conversation {
  const conv: Conversation = {
    id: newId("conv"),
    createdAt: now.toISOString(),
    turn: 0,
    verifiedPatientId: null,
    failedVerifications: 0,
    transcript: [],
    trace: [],
    modelHistory: [],
    pendingNotes: [],
    flags: { retentionOffers: [] },
    sopHistory: [],
    outcomes: [],
  };
  getDb().conversations.set(conv.id, conv);
  return conv;
}

export function conversationView(conv: Conversation): ConversationView {
  const p = conv.verifiedPatientId ? getDb().patients.find((x) => x.id === conv.verifiedPatientId) : undefined;
  return {
    id: conv.id,
    verifiedPatient: p ? { id: p.id, name: `${p.firstName} ${p.lastName}` } : null,
    transcript: conv.transcript,
    trace: conv.trace,
  };
}

/**
 * One patient message → one agent reply.
 *
 *  1. Deterministic safety check (code). Urgent → fixed 000 reply + urgent escalation, model never called.
 *  2. SOP routing (cheap model, enum-constrained) + second safety opinion.
 *  3. Agent loop: model proposes tool calls, the permission gate decides.
 *  4. Code-enforced clinical escalation + output filter for medical advice.
 */
export async function runTurn(
  conversationId: string | null,
  message: string,
  opts: { emit?: (e: TraceEvent) => void; now?: Date } = {},
): Promise<TurnResult> {
  const db = getDb();
  const now = opts.now ?? new Date();
  const conv = (conversationId && db.conversations.get(conversationId)) || createConversation(now);
  conv.turn += 1;
  conv.transcript.push({ id: newId("m"), role: "patient", text: message, ts: now.toISOString() });
  const emit = makeEmitter(conv, opts.emit);
  const history = conv.modelHistory as Msg[];

  const finish = (reply: string): TurnResult => {
    conv.transcript.push({ id: newId("m"), role: "agent", text: reply, ts: new Date().toISOString() });
    emit({ kind: "reply", title: "Replied to patient", badge: "info" });
    return { conversationId: conv.id, reply, conversation: conversationView(conv) };
  };

  // ---- 1. Deterministic safety check
  const safety = classifyMessage(message);
  if (safety.urgent) {
    return finish(urgentShortCircuit(conv, message, `Matched: ${safety.matches.urgent.join(", ")}`, emit, now));
  }
  emit(
    safety.clinical
      ? { kind: "safety", title: "Clinical topic detected — must go to a clinician", detail: `Matched: ${safety.matches.clinical.join(", ")}. The agent is not allowed to advise.`, badge: "escalated" }
      : { kind: "safety", title: "Safety check passed", detail: "No urgent or clinical content found by the rule-based check.", badge: "info" },
  );
  if (safety.injection)
    emit({ kind: "safety", title: "Possible prompt-injection attempt", detail: `Matched: ${safety.matches.injection.join(", ")}. Permissions are enforced in code, so this cannot unlock anything.`, badge: "blocked" });

  // ---- 2. SOP routing (+ model-based safety second opinion)
  const route = await selectSop(conv, message, safety);
  if (route.urgent) {
    return finish(urgentShortCircuit(conv, message, "Flagged urgent by the model-based safety check.", emit, now));
  }
  const clinicalRequired = safety.clinical || route.clinical;
  if (route.clinical && !safety.clinical)
    emit({ kind: "safety", title: "Clinical topic detected by second check", detail: "The model-based check flagged clinical content the keyword check missed.", badge: "escalated" });
  const sops: SopId[] = [...route.sops];
  if (clinicalRequired && !sops.includes("clinical_safety")) sops.push("clinical_safety");
  conv.sopHistory.push(sops[0]);
  emit({
    kind: "sop",
    title: `Following SOP: ${sops.map((s) => getSop(s).name).join(" + ")}`,
    detail: route.summary,
    badge: "info",
    data: { sops, router: route.source, sources: sops.flatMap((s) => getSop(s).sources.map((x) => x.url)) },
  });

  // ---- 3. Agent loop
  history.push({ role: "user", content: message });
  history.push({ role: "system", content: turnContext(conv, sops, { ...safety, modelClinical: route.clinical }, now) } as Msg);
  conv.pendingNotes = [];
  const queueBefore = db.queue.length;
  let reply = "";

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await getClient().beta.messages.create({
        model: AGENT_MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: toolDefinitionsForModel(),
        messages: history,
        cache_control: { type: "ephemeral" },
        thinking: { type: "adaptive", display: "summarized" },
        output_config: { effort: "low" },
        ...(supportsFallback(AGENT_MODEL) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      });
      history.push({ role: "assistant", content: res.content as Anthropic.Beta.Messages.BetaContentBlockParam[] });

      for (const b of res.content) {
        if (b.type === "thinking" && b.thinking.trim()) emit({ kind: "step", title: "Agent reasoning", detail: b.thinking.trim(), badge: "info" });
      }
      const toolUses = res.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use");
      reply = res.content
        .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      if (res.stop_reason === "pause_turn") continue;
      if (res.stop_reason !== "tool_use" || toolUses.length === 0) {
        if (res.stop_reason === "refusal") reply = "";
        break;
      }
      const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = toolUses.map((tu) => {
        const r = runTool({ db, conv, now, activeSops: sops, emit }, tu.name, tu.input);
        return { type: "tool_result", tool_use_id: tu.id, content: r.content, is_error: r.isError };
      });
      history.push({ role: "user", content: results });
      if (step === MAX_STEPS - 1) reply = "";
    }
  } catch (err) {
    emit({ kind: "error", title: "Model call failed", detail: (err as Error).message, badge: "blocked" });
    reply = "";
  }

  // ---- 4a. Clinical escalation is enforced by code, not trusted to the model
  const newItems = db.queue.slice(0, db.queue.length - queueBefore);
  if (clinicalRequired && !newItems.some((q) => q.kind === "clinician")) {
    enqueue(db, {
      kind: "clinician",
      urgent: false,
      conversationId: conv.id,
      patientId: conv.verifiedPatientId,
      title: `Clinical question #${conv.turn}`,
      summary: `Patient asked: "${message}"`,
      reasoning: "Clinical content detected by the safety check. The agent did not escalate, so the system escalated automatically (clinical safety rule CS-3).",
      sopId: "clinical_safety",
      sopStep: "CS-3",
    }, now);
    conv.outcomes.push("escalated_clinician");
    audit(db, { conversationId: conv.id, patientId: conv.verifiedPatientId, tool: "escalate_to_clinician", input: { enforcedBy: "system" }, outcome: "escalated", detail: "Auto-escalated by safety rule" }, now);
    emit({ kind: "escalation", title: "Safety rule enforced by code: escalated to clinician", detail: "The model did not escalate a clinical question, so the system did it.", badge: "escalated" });
  }
  if (clinicalRequired && !/medical team|clinician|practitioner|doctor/i.test(reply)) {
    reply = reply ? `${reply}\n\n${CLINICAL_HOLDING}` : CLINICAL_HOLDING;
  }

  // ---- 4b. Output filter: no medical advice leaves the system
  const advice = detectMedicalAdvice(reply);
  if (advice.length) {
    const replaced = reply;
    reply = CLINICAL_HOLDING;
    conv.outcomes.push("safety_filter_triggered");
    if (!db.queue.some((q) => q.conversationId === conv.id && q.kind === "clinician" && q.status === "pending")) {
      enqueue(db, { kind: "clinician", urgent: false, conversationId: conv.id, patientId: conv.verifiedPatientId, title: `Clinical question #${conv.turn}`, summary: `Patient asked: "${message}"`, reasoning: "Output filter caught possible medical advice in the draft reply.", sopId: "clinical_safety", sopStep: "CS-2" }, now);
      conv.outcomes.push("escalated_clinician");
    }
    conv.pendingNotes.push("Your previous reply was blocked by the safety filter because it looked like medical advice. The patient received the standard clinical holding message instead.");
    emit({ kind: "safety", title: "Output filter blocked possible medical advice", detail: `Matched: ${advice.join(", ")}`, badge: "blocked", data: { draft: replaced } });
  }

  if (!reply) {
    reply = "Sorry, I couldn't complete that just now. I've let our support team know and someone will follow up with you shortly.";
    enqueue(db, { kind: "support", urgent: false, conversationId: conv.id, patientId: conv.verifiedPatientId, title: "Handoff: agent could not complete", summary: `Patient message: "${message}"`, reasoning: "The agent hit an error or step limit.", sopId: sops[0], sopStep: "escalation" }, now);
    conv.outcomes.push("escalated_support");
  }
  return finish(reply);
}

function urgentShortCircuit(conv: Conversation, message: string, why: string, emit: Emit, now: Date): string {
  const db = getDb();
  emit({ kind: "safety", title: "URGENT: possible emergency — 000 guidance sent", detail: `${why}. The AI model was not used for this reply; a fixed, pre-approved message was sent.`, badge: "urgent" });
  enqueue(db, {
    kind: "clinician",
    urgent: true,
    conversationId: conv.id,
    patientId: conv.verifiedPatientId,
    title: "URGENT: possible emergency",
    summary: `Patient wrote: "${message}"`,
    reasoning: `Urgent symptom or safety risk detected (${why}). Patient directed to 000. Clinician to contact ASAP.`,
    sopId: "clinical_safety",
    sopStep: "CS-5",
  }, now);
  conv.outcomes.push("urgent_escalation", "escalated_clinician");
  audit(db, { conversationId: conv.id, patientId: conv.verifiedPatientId, tool: "urgent_escalation", input: {}, outcome: "escalated", detail: why }, now);
  emit({ kind: "escalation", title: "Urgent escalation to clinician queue", badge: "urgent" });
  const history = conv.modelHistory as Msg[];
  history.push({ role: "user", content: message }, { role: "assistant", content: URGENT_RESPONSE });
  return URGENT_RESPONSE;
}
