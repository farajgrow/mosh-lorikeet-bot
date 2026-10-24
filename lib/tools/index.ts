import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { cancelSubscription, issueRefund, pauseSubscription, recordRetentionOffer, rescheduleConsult, skipNextOrder } from "./actions";
import { escalateToClinician, escalateToSupport } from "./escalations";
import { getAvailableSlots, getConsults, getOrders, getPatientOverview, getPayments, verifyPatient } from "./read";
import type { ToolDef } from "./types";

export const TOOLS: ToolDef[] = [
  verifyPatient,
  getPatientOverview,
  getOrders,
  getPayments,
  getConsults,
  getAvailableSlots,
  skipNextOrder,
  pauseSubscription,
  rescheduleConsult,
  issueRefund,
  recordRetentionOffer,
  cancelSubscription,
  escalateToClinician,
  escalateToSupport,
];

export const TOOL_MAP: Record<string, ToolDef> = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

/** Tool definitions sent to the model, generated from the Zod schemas. Order is fixed for prompt caching. */
export function toolDefinitionsForModel(): Anthropic.Beta.Messages.BetaTool[] {
  return TOOLS.map((t) => {
    const schema = z.toJSONSchema(t.schema) as Record<string, unknown>;
    delete schema.$schema;
    return {
      name: t.name,
      description: `${t.description} [permission: ${t.permission}]`,
      input_schema: { type: "object", ...schema } as Anthropic.Beta.Messages.BetaTool.InputSchema,
    };
  });
}
