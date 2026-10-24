import type { z } from "zod";
import type { Db } from "@/lib/store/db";
import type { Conversation, TraceEvent } from "@/lib/store/types";
import type { SopId } from "@/lib/sops";

/**
 * Permission levels, enforced by the gate (lib/permissions/gate.ts), never by the model.
 *  read                  → no side effects
 *  auto                  → runs automatically once hard checks pass
 *  auto_under_threshold  → runs automatically only if no policy threshold is crossed, otherwise queued for a human
 *  requires_approval     → always queued for a human
 */
export type PermissionLevel = "read" | "auto" | "auto_under_threshold" | "requires_approval";

export interface ToolContext {
  db: Db;
  conv: Conversation;
  now: Date;
  activeSops: SopId[];
  emit: (e: Omit<TraceEvent, "id" | "ts" | "turn">) => void;
}

/** Result of a tool's pre-flight check. */
export type Assessment =
  | { ok: false; reason: string }
  | {
      ok: true;
      /** Plain-language description of what will happen, e.g. "Refund $189.00 to card". */
      summary: string;
      /** Policy rules that stop this running automatically. Empty = within auto limits. */
      approvalReasons: string[];
      /** SOP + step this action relies on (shown to the human reviewer). */
      sopId: SopId;
      sopStep: string;
    };

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- registry holds tools with different input types
export interface ToolDef<I = any> {
  name: string;
  description: string;
  schema: z.ZodType<I>;
  permission: PermissionLevel;
  /** False only for verify_patient and escalations. */
  requiresVerification: boolean;
  /** Read tools and escalations: just run. */
  run?: (ctx: ToolContext, input: I) => unknown;
  /** Write tools: hard checks + policy check. Must not mutate anything. */
  assess?: (ctx: ToolContext, input: I) => Assessment;
  /** Write tools: perform the change. Only ever called by the gate or by a human approval. */
  execute?: (ctx: Pick<ToolContext, "db" | "now">, input: I, patientId: string) => unknown;
  /** Message to the patient when a human approves/rejects (no model call, so it's reliable). */
  approvalMessage?: (input: I, approved: boolean, note?: string) => string;
}
