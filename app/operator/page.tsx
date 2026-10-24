"use client";

import { useState } from "react";
import type { QueueActionRequest, QueueActionResponse, QueueItem } from "@/lib/api/contract";
import { fmtDateTime } from "@/lib/format";
import { SOPS } from "@/lib/sops";
import { Badge } from "../components/Badge";
import { fetchJSON } from "../components/api";
import { usePolling } from "../components/usePolling";

type View = "pending" | "done";

function sopLabel(sopId: string, stepId: string) {
  const sop = (SOPS as Record<string, { name: string; steps: { id: string; title: string }[] } | undefined>)[sopId];
  if (!sop) return `${sopId} ${stepId}`;
  const step = sop.steps.find((s) => s.id === stepId);
  return step ? `${sop.name}, step ${step.id}: ${step.title}` : `${sop.name}${stepId ? `, ${stepId}` : ""}`;
}

const STATUS_LABEL: Record<QueueItem["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  resolved: "Resolved",
};

function ItemCard({ item, onDone }: { item: QueueItem; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<QueueActionRequest["action"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAction, setShowAction] = useState(false);
  const pending = item.status === "pending";

  async function act(action: QueueActionRequest["action"]) {
    setBusy(action);
    setError(null);
    try {
      await fetchJSON<QueueActionResponse>(`/api/queue/${item.id}`, {
        method: "POST",
        body: JSON.stringify({ action, note: note.trim() || undefined, approver: "Demo Operator" } satisfies QueueActionRequest),
      });
      setNote("");
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <article
      className={`rounded-lg border bg-surface ${item.urgent && pending ? "border-urgent/50" : "border-line"}`}
      aria-label={item.title}
    >
      {item.urgent && (
        <div className="rounded-t-lg bg-urgent px-4 py-1.5 text-xs font-medium text-white">Urgent: patient was directed to 000</div>
      )}
      <div className="space-y-3 p-4">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold leading-snug">{item.title}</h3>
            <p className="mt-0.5 text-xs text-muted">
              {fmtDateTime(item.createdAt)}
              {item.patientId ? `, patient ${item.patientId}` : ", patient not verified"}
              {", "}
              <span title={item.conversationId}>conversation {item.conversationId.slice(-6)}</span>
            </p>
          </div>
          {!pending && (
            <Badge tone={item.status === "approved" ? "auto" : item.status === "rejected" ? "blocked" : "info"}>
              {STATUS_LABEL[item.status]}
            </Badge>
          )}
        </header>

        <p className="text-sm leading-relaxed">{item.summary}</p>

        <div className="rounded-md bg-canvas px-3 py-2.5 text-[13px] leading-relaxed">
          <p className="text-xs font-medium text-muted">Why the agent paused</p>
          <p className="mt-0.5">{item.reasoning}</p>
          <p className="mt-2 text-xs font-medium text-muted">Procedure it relied on</p>
          <p className="mt-0.5">{sopLabel(item.sopId, item.sopStep)}</p>
          {item.policyNotes && item.policyNotes.length > 0 && (
            <>
              <p className="mt-2 text-xs font-medium text-muted">Policy rules that need a human</p>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                {item.policyNotes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </>
          )}
        </div>

        {item.action && (
          <div className="text-xs">
            <button type="button" onClick={() => setShowAction((s) => !s)} aria-expanded={showAction} className="text-accent hover:underline">
              {showAction ? "Hide drafted action" : `Drafted action: ${item.action.tool}`}
            </button>
            {showAction && (
              <pre className="mt-1.5 overflow-auto rounded-md border border-line bg-canvas p-2.5 font-mono text-[11.5px]">
                {JSON.stringify(item.action, null, 2)}
              </pre>
            )}
          </div>
        )}

        {!pending && (item.resolvedBy || item.resolutionNote) && (
          <p className="text-xs text-muted">
            {STATUS_LABEL[item.status]} by {item.resolvedBy ?? "operator"}
            {item.resolvedAt ? `, ${fmtDateTime(item.resolvedAt)}` : ""}
            {item.resolutionNote ? `: “${item.resolutionNote}”` : ""}
          </p>
        )}

        {pending && (
          <div className="space-y-2 border-t border-line pt-3">
            <label className="block text-xs text-muted" htmlFor={`note-${item.id}`}>
              {item.kind === "clinician" ? "Note to the patient (optional)" : "Note (optional, shared with the patient)"}
            </label>
            <textarea
              id={`note-${item.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-md border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
            />
            {error && <p className="text-xs text-urgent">{error}</p>}
            <div className="flex flex-wrap gap-2">
              {item.action ? (
                <>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => act("approve")}
                    className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
                  >
                    {busy === "approve" ? "Approving…" : "Approve and run"}
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => act("reject")}
                    className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-faint disabled:opacity-50"
                  >
                    {busy === "reject" ? "Rejecting…" : "Reject"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => act("resolve")}
                  className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
                >
                  {busy === "resolve" ? "Resolving…" : "Mark resolved"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function Column({
  title,
  description,
  items,
  emptyText,
  onChange,
}: {
  title: string;
  description: string;
  items: QueueItem[];
  emptyText: string;
  onChange: () => void;
}) {
  return (
    <section aria-label={title} className="min-w-0">
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          {title}
          <span className="text-sm font-normal text-faint">{items.length}</span>
        </h2>
        <p className="text-sm text-muted">{description}</p>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{emptyText}</p>
      ) : (
        <div className="space-y-3">
          {items.map((i) => (
            <ItemCard key={i.id} item={i} onDone={onChange} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function OperatorPage() {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("pending");

  const load = async () => {
    try {
      setItems(await fetchJSON<QueueItem[]>("/api/queue"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  usePolling(load, 2000);

  const visible = (items ?? []).filter((i) => (view === "pending" ? i.status === "pending" : i.status !== "pending"));
  // Urgent first, then newest.
  const sorted = [...visible].sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.createdAt.localeCompare(a.createdAt));
  const support = sorted.filter((i) => i.kind === "support");
  const clinician = sorted.filter((i) => i.kind === "clinician");
  const pendingCount = (items ?? []).filter((i) => i.status === "pending").length;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Operator queues</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Anything the agent isn&rsquo;t allowed to do on its own lands here with its reasoning. Approving runs the drafted action and
            updates the patient&rsquo;s chat.
          </p>
        </div>
        <div role="tablist" aria-label="Filter" className="flex rounded-md border border-line bg-surface p-0.5 text-sm">
          {(
            [
              ["pending", `Pending (${pendingCount})`],
              ["done", "Handled"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={view === k}
              onClick={() => setView(k)}
              className={`rounded px-3 py-1 ${view === k ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mb-4 rounded-md bg-urgent-soft px-3 py-2 text-sm text-urgent">Couldn&rsquo;t load the queues: {error}</p>}
      {!items && !error && <p className="text-sm text-muted">Loading…</p>}

      {items && (
        <div className="grid gap-8 lg:grid-cols-2">
          <Column
            title="Support approvals"
            description="Refunds, cancellations and late changes that cross a policy limit, plus handoffs."
            items={support}
            emptyText={view === "pending" ? "No approvals waiting." : "Nothing handled yet."}
            onChange={load}
          />
          <Column
            title="Clinician escalations"
            description="Clinical questions the agent is not allowed to answer. Urgent items are listed first."
            items={clinician}
            emptyText={view === "pending" ? "No clinical questions waiting." : "Nothing handled yet."}
            onChange={load}
          />
        </div>
      )}
    </div>
  );
}
