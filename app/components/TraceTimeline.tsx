"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TraceEvent } from "@/lib/api/contract";
import type { TraceKind } from "@/lib/store/types";
import { DOT, TraceBadgePill, type Tone } from "./Badge";

/** Plain-English name for each kind of step, shown above the title. */
const KIND_LABEL: Record<TraceKind, string> = {
  message: "Patient said",
  safety: "Safety check",
  sop: "Procedure chosen",
  step: "Procedure step",
  tool_call: "Action",
  gate: "Permission check",
  escalation: "Handed to a human",
  reply: "Agent replied",
  error: "Problem",
};

const KIND_TONE: Partial<Record<TraceKind, Tone>> = {
  message: "neutral",
  sop: "info",
  step: "neutral",
  reply: "neutral",
  error: "urgent",
};

function toneFor(e: TraceEvent): Tone {
  return e.badge ?? KIND_TONE[e.kind] ?? "neutral";
}

function timeOf(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

function EventRow({ e, isLast }: { e: TraceEvent; isLast: boolean }) {
  const [open, setOpen] = useState(false);
  const tone = toneFor(e);
  const hasData = e.data && Object.keys(e.data).length > 0;

  return (
    <li className="trace-in relative flex gap-3 pb-4">
      {/* rail */}
      <div className="relative flex w-3 shrink-0 justify-center">
        {!isLast && <span aria-hidden className="absolute top-3.5 bottom-[-4px] w-px bg-line" />}
        <span aria-hidden className={`relative mt-1.5 size-2.5 rounded-full ring-4 ring-surface ${DOT[tone]}`} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-faint">{KIND_LABEL[e.kind] ?? e.kind}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-faint">{timeOf(e.ts)}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-start gap-x-2 gap-y-1">
          <p className={`text-sm leading-snug ${e.kind === "message" || e.kind === "reply" ? "text-muted" : "font-medium text-ink"}`}>
            {e.kind === "message" ? <>&ldquo;{e.title}&rdquo;</> : e.title}
          </p>
          {e.badge && <TraceBadgePill badge={e.badge} />}
        </div>
        {e.detail && <p className="mt-1 text-[13px] leading-relaxed text-muted">{e.detail}</p>}
        {hasData && (
          <div className="mt-1.5">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="text-xs text-accent hover:underline"
            >
              {open ? "Hide technical details" : "Show technical details"}
            </button>
            {open && (
              <pre className="mt-1.5 max-h-72 overflow-auto rounded-md border border-line bg-canvas p-2.5 font-mono text-[11.5px] leading-relaxed text-ink">
                {JSON.stringify(e.data, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export function TraceTimeline({ events, busy }: { events: TraceEvent[]; busy: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);

  const turns = useMemo(() => {
    const map = new Map<number, TraceEvent[]>();
    for (const e of events) {
      const list = map.get(e.turn) ?? [];
      list.push(e);
      map.set(e.turn, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [events]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [events.length, busy]);

  if (!events.length && !busy) {
    return (
      <div className="px-5 py-8 text-sm leading-relaxed text-muted">
        <p className="font-medium text-ink">Nothing yet.</p>
        <p className="mt-1">
          Send a message and every decision the agent makes will appear here: the safety check, the procedure it chose, each
          action it took, and why it paused or handed off to a person.
        </p>
      </div>
    );
  }

  return (
    <div className="px-5 py-4">
      {turns.map(([turn, list]) => (
        <section key={turn} aria-label={`Message ${turn}`} className="mb-2">
          <h3 className="mb-2 flex items-center gap-2 text-xs font-medium text-muted">
            <span>Message {turn}</span>
            <span aria-hidden className="h-px flex-1 bg-line" />
          </h3>
          <ol>
            {list.map((e, i) => (
              <EventRow key={e.id} e={e} isLast={i === list.length - 1 && !(busy && turn === turns[turns.length - 1][0])} />
            ))}
          </ol>
        </section>
      ))}
      {busy && (
        <p className="flex items-center gap-2 pb-2 pl-6 text-xs text-muted">
          <span className="flex gap-0.5" aria-hidden>
            <span className="typing-dot size-1 rounded-full bg-muted" />
            <span className="typing-dot size-1 rounded-full bg-muted" />
            <span className="typing-dot size-1 rounded-full bg-muted" />
          </span>
          Working…
        </p>
      )}
      <div ref={endRef} />
    </div>
  );
}
