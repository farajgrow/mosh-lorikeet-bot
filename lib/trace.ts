import { newId } from "@/lib/store/db";
import type { Conversation, TraceEvent } from "@/lib/store/types";

export type Emit = (e: Omit<TraceEvent, "id" | "ts" | "turn">) => void;

/** Records a trace event on the conversation and forwards it to a live listener (SSE). */
export function makeEmitter(conv: Conversation, listener?: (e: TraceEvent) => void): Emit {
  return (e) => {
    const full: TraceEvent = { id: newId("tr"), ts: new Date().toISOString(), turn: conv.turn, ...e };
    conv.trace.push(full);
    listener?.(full);
  };
}
