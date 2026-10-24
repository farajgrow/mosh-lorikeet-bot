import { z } from "zod";
import cancellation from "@/data/sops/cancellation.json";
import clinicalSafety from "@/data/sops/clinical_safety.json";
import consultReschedule from "@/data/sops/consult_reschedule.json";
import generalEnquiry from "@/data/sops/general_enquiry.json";
import orderChange from "@/data/sops/order_change.json";
import orderStatus from "@/data/sops/order_status.json";
import refundRequest from "@/data/sops/refund_request.json";

/** SOPs are data. This schema validates every file at startup so a bad edit fails loudly. */
export const SopSchema = z.object({
  id: z.string(),
  name: z.string(),
  summary: z.string(),
  riskLevel: z.enum(["low", "medium", "high", "safety"]),
  triggers: z.array(z.string()),
  sources: z.array(z.object({ title: z.string(), url: z.string().url() })),
  parameters: z.record(z.string(), z.number()),
  steps: z.array(z.object({ id: z.string(), title: z.string(), instruction: z.string() })),
  eligibility: z.array(z.object({ id: z.string(), rule: z.string(), assumed: z.boolean() })),
  escalation: z.array(z.object({ id: z.string(), when: z.string(), then: z.string() })),
  tools: z.array(z.string()),
});

export type Sop = z.infer<typeof SopSchema>;

export const SOP_IDS = [
  "order_status",
  "order_change",
  "consult_reschedule",
  "refund_request",
  "cancellation",
  "clinical_safety",
  "general_enquiry",
] as const;
export type SopId = (typeof SOP_IDS)[number];

const raw: Record<SopId, unknown> = {
  order_status: orderStatus,
  order_change: orderChange,
  consult_reschedule: consultReschedule,
  refund_request: refundRequest,
  cancellation,
  clinical_safety: clinicalSafety,
  general_enquiry: generalEnquiry,
};

export const SOPS: Record<SopId, Sop> = Object.fromEntries(
  SOP_IDS.map((id) => [id, SopSchema.parse(raw[id])]),
) as Record<SopId, Sop>;

export function getSop(id: SopId): Sop {
  return SOPS[id];
}

/** Numeric policy parameter read straight from SOP data, so editing the SOP changes enforcement. */
export function sopParam(id: SopId, key: string): number {
  const v = SOPS[id].parameters[key];
  if (typeof v !== "number") throw new Error(`SOP ${id} missing parameter ${key}`);
  return v;
}

/** Render an SOP as compact text for the model. */
export function renderSop(sop: Sop): string {
  const lines = [
    `## SOP: ${sop.name} (${sop.id})`,
    sop.summary,
    "Steps:",
    ...sop.steps.map((s) => `- [${s.id}] ${s.title}: ${s.instruction}`),
  ];
  if (sop.eligibility.length) lines.push("Eligibility rules:", ...sop.eligibility.map((e) => `- [${e.id}] ${e.rule}`));
  if (sop.escalation.length) lines.push("Escalate when:", ...sop.escalation.map((e) => `- [${e.id}] ${e.when} → ${e.then}`));
  return lines.join("\n");
}
