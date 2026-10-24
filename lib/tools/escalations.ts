import { z } from "zod";
import { enqueue } from "@/lib/queue";
import type { ToolDef } from "./types";

export const escalateToClinician: ToolDef<{ patientQuestion: string; summary: string }> = {
  name: "escalate_to_clinician",
  description:
    "Send a clinical question (dosage, side effects, symptoms, interactions, whether to start/stop/change treatment) to the medical team. Use for ANY clinical content. Does not require verification. Never answer the clinical question yourself.",
  schema: z.object({
    patientQuestion: z.string().describe("The patient's clinical question in their own words"),
    summary: z.string().describe("Neutral one-paragraph summary for the clinician, no advice or interpretation"),
  }),
  permission: "auto",
  requiresVerification: false,
  run({ db, conv, now }, { patientQuestion, summary }) {
    const existing = db.queue.find((q) => q.conversationId === conv.id && q.kind === "clinician" && q.status === "pending" && q.title.endsWith(`#${conv.turn}`));
    if (existing) return { escalated: true, queueItemId: existing.id, note: "Already escalated this turn." };
    const item = enqueue(db, {
      kind: "clinician",
      urgent: false,
      conversationId: conv.id,
      patientId: conv.verifiedPatientId,
      title: `Clinical question #${conv.turn}`,
      summary: `Patient asked: "${patientQuestion}"\n\n${summary}`,
      reasoning: "Clinical question detected. Support agents cannot give medical advice (clinical safety rule CS-2), so this is routed to a practitioner.",
      sopId: "clinical_safety",
      sopStep: "CS-3",
    }, now);
    conv.outcomes.push("escalated_clinician");
    return { escalated: true, queueItemId: item.id };
  },
};

export const escalateToSupport: ToolDef<{ category: string; summary: string; reason: string }> = {
  name: "escalate_to_support",
  description:
    "Hand the conversation to the human support team for anything you cannot resolve within your SOPs: late/lost order investigation, failed identity verification, out-of-scope requests, complaints, or a patient asking for an exception. Does not require verification.",
  schema: z.object({
    category: z.enum(["late_order", "identity_verification", "out_of_scope", "complaint", "exception_request", "other"]),
    summary: z.string().describe("What the patient needs, what you checked, and what is left to do"),
    reason: z.string().describe("Which SOP rule says to escalate"),
  }),
  permission: "auto",
  requiresVerification: false,
  run({ db, conv, now, activeSops }, { category, summary, reason }) {
    const item = enqueue(db, {
      kind: "support",
      urgent: false,
      conversationId: conv.id,
      patientId: conv.verifiedPatientId,
      title: `Handoff: ${category.replace(/_/g, " ")}`,
      summary,
      reasoning: reason,
      sopId: activeSops[0] ?? "general_enquiry",
      sopStep: category === "late_order" ? "OS-4" : "escalation",
    }, now);
    conv.outcomes.push("escalated_support");
    return { escalated: true, queueItemId: item.id, tellPatient: "A support team member will follow up, usually within 1 business day." };
  },
};
