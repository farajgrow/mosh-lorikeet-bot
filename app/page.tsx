"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConversationView, PatientCard, TraceEvent, TranscriptMessage } from "@/lib/api/contract";
import { fetchJSON, streamChat } from "./components/api";
import { PatientDataPanel } from "./components/PatientDataPanel";
import { PatientPicker } from "./components/PatientPicker";
import { RichText } from "./components/RichText";
import { TraceTimeline } from "./components/TraceTimeline";
import { usePolling } from "./components/usePolling";

const STORAGE_KEY = "concierge.conversationId";

const SUGGESTIONS = [
  "Where is my medication delivery?",
  "Can I skip my next shipment?",
  "I need to reschedule my follow-up.",
  "I'd like a refund for my last order.",
  "Please cancel my subscription.",
  "Can I take two tablets instead of one?",
];

function readStoredId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function storeId(id: string | null) {
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

function Bubble({ m }: { m: TranscriptMessage }) {
  if (m.role === "patient") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-[14.5px] leading-relaxed text-white">
          <RichText text={m.text} />
        </div>
      </div>
    );
  }
  const operator = m.role === "operator";
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="pl-1 text-[11px] text-faint">{operator ? "Support team" : "Support agent (AI)"}</span>
      <div
        className={`max-w-[85%] rounded-2xl rounded-bl-md border px-3.5 py-2 text-[14.5px] leading-relaxed ${
          operator ? "border-escalated/30 bg-escalated-soft" : "border-line bg-surface"
        }`}
      >
        <RichText text={m.text} />
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [verified, setVerified] = useState<ConversationView["verifiedPatient"]>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<"reasoning" | "data">("reasoning");
  const [refreshKey, setRefreshKey] = useState(0);
  const [startedAs, setStartedAs] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const transcriptLen = useRef(0);
  useEffect(() => {
    transcriptLen.current = transcript.length;
  }, [transcript.length]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const applyConversation = useCallback((c: ConversationView) => {
    setConversationId(c.id);
    setTranscript(c.transcript);
    setTrace(c.trace);
    setVerified(c.verifiedPatient);
  }, []);

  // Restore the last conversation after a reload.
  useEffect(() => {
    const id = readStoredId();
    if (!id) return;
    fetchJSON<ConversationView>(`/api/conversations/${id}`)
      .then(applyConversation)
      .catch(() => storeId(null));
  }, [applyConversation]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript.length, busy]);

  // Pick up messages added by the operator queue (approvals, clinician replies).
  usePolling(
    async () => {
      if (!conversationId) return;
      try {
        const c = await fetchJSON<ConversationView>(`/api/conversations/${conversationId}`);
        if (c.transcript.length > transcriptLen.current) {
          setTranscript(c.transcript);
          setRefreshKey((k) => k + 1);
        }
        setTrace((prev) => (c.trace.length >= prev.length ? c.trace : prev));
        setVerified(c.verifiedPatient);
      } catch {
        /* polling is best-effort */
      }
    },
    conversationId && !busy ? 3000 : null,
  );

  function newConversation() {
    if (busy) return;
    storeId(null);
    setConversationId(null);
    setTranscript([]);
    setTrace([]);
    setVerified(null);
    setError(null);
    setStartedAs(null);
    setTab("reasoning");
  }

  function startAs(p: PatientCard) {
    newConversation();
    setStartedAs(p.id);
    setDraft(`Hi, it's ${p.name.split(" ")[0]}. My email is ${p.email} and my date of birth is ${p.dob}. `);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    setDraft("");
    const optimistic: TranscriptMessage = { id: `local-${Date.now()}`, role: "patient", text: message, ts: new Date().toISOString() };
    setTranscript((t) => [...t, optimistic]);

    await streamChat(
      { conversationId, message },
      {
        onTrace: (e) =>
          setTrace((t) => (t.some((x) => x.id === e.id) ? t : [...t, e])),
        onDone: (d) => {
          applyConversation(d.conversation);
          storeId(d.conversationId);
          setRefreshKey((k) => k + 1);
        },
        onError: (msg) => setError(msg),
      },
    );
    setBusy(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_minmax(380px,460px)]">
      {/* Patients */}
      <aside className="hidden min-h-0 border-r border-line bg-surface lg:block">
        <PatientPicker onStart={startAs} activePatientId={verified?.id ?? startedAs} />
      </aside>

      {/* Chat */}
      <section aria-label="Patient chat" className="flex min-h-[70vh] flex-col lg:min-h-0">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2.5 sm:px-6">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold">Patient chat</h1>
            <p className="truncate text-xs text-muted">
              {verified ? `Verified as ${verified.name}` : "Not verified yet. The agent asks for email and date of birth before sharing anything."}
            </p>
          </div>
          <button
            type="button"
            onClick={newConversation}
            disabled={busy}
            className="shrink-0 rounded-md border border-line px-2.5 py-1.5 text-sm text-muted hover:border-faint hover:text-ink disabled:opacity-50"
          >
            New conversation
          </button>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {transcript.length === 0 && !busy ? (
            <div className="mx-auto mt-10 max-w-md text-center">
              <p className="text-base font-medium">Ask about an order, a subscription, a consult or a refund.</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Pick a demo patient on the left to fill in their login details, or type as yourself. Everything the agent decides shows up
                in the reasoning panel.
              </p>
            </div>
          ) : (
            <div className="mx-auto flex max-w-2xl flex-col gap-4">
              {transcript.map((m) => (
                <Bubble key={m.id} m={m} />
              ))}
              {busy && (
                <div className="flex items-center gap-1 pl-1" aria-label="Agent is typing">
                  <span className="typing-dot size-1.5 rounded-full bg-faint" />
                  <span className="typing-dot size-1.5 rounded-full bg-faint" />
                  <span className="typing-dot size-1.5 rounded-full bg-faint" />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-line bg-surface px-4 pb-4 pt-3 sm:px-6">
          {error && (
            <p role="alert" className="mx-auto mb-2 max-w-2xl rounded-md bg-urgent-soft px-3 py-2 text-sm text-urgent">
              {error}
            </p>
          )}
          <div className="mx-auto max-w-2xl">
            <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setDraft((d) => (d.trim() ? `${d.trimEnd()} ${s}` : s));
                    inputRef.current?.focus();
                  }}
                  className="shrink-0 whitespace-nowrap rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:border-faint hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(draft);
              }}
              className="flex items-end gap-2"
            >
              <label htmlFor="composer" className="sr-only">
                Message
              </label>
              <textarea
                id="composer"
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(draft);
                  }
                }}
                rows={2}
                placeholder="Write a message as the patient…"
                className="min-h-[44px] flex-1 resize-none rounded-lg border border-line bg-surface px-3 py-2 text-[14.5px] leading-relaxed outline-none placeholder:text-faint focus:border-accent"
              />
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                className="h-[44px] rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-40"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Reasoning + data */}
      <aside aria-label="Agent reasoning" className="flex min-h-[60vh] flex-col border-l border-line bg-surface lg:min-h-0">
        <div role="tablist" aria-label="Side panel" className="flex border-b border-line px-3">
          {(
            [
              ["reasoning", "Reasoning"],
              ["data", "Patient data"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm ${
                tab === key ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "reasoning" ? (
            <TraceTimeline events={trace} busy={busy} />
          ) : (
            <PatientDataPanel patientId={verified?.id ?? null} refreshKey={refreshKey} />
          )}
        </div>
      </aside>
    </div>
  );
}
