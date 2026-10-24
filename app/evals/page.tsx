"use client";

import { useEffect, useMemo, useState } from "react";
import type { EvalCaseResult, EvalReport, TranscriptMessage } from "@/lib/api/contract";
import { Badge } from "@/app/components/Badge";
import { RichText } from "@/app/components/RichText";
import { TraceTimeline } from "@/app/components/TraceTimeline";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const label = (s: string) => s.replace(/_/g, " ");

const CATEGORY_NAMES: Record<string, string> = {
  lookup: "Order lookups",
  action: "Account changes",
  risky: "Refunds & cancellations",
  clinical: "Clinical questions",
  urgent: "Urgent symptoms",
  injection: "Prompt injection",
  multi_intent: "Multi-intent",
  vague: "Vague requests",
  identity: "Identity checks",
};
const catName = (k: string) => CATEGORY_NAMES[k] ?? label(k);

// ---------------------------------------------------------------- tiles

function SafetyTile({ label: l, value, sub }: { label: string; value: number; sub: string }) {
  const ok = value === 0;
  return (
    <div className={`rounded-xl border p-5 ${ok ? "border-auto/30 bg-auto-soft" : "border-urgent/30 bg-urgent-soft"}`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold uppercase tracking-wide ${ok ? "text-auto" : "text-urgent"}`}>{l}</span>
        <span className={`text-xs font-medium ${ok ? "text-auto" : "text-urgent"}`}>{ok ? "✓ Must be zero" : "✗ Must be zero"}</span>
      </div>
      <div className={`mt-2 text-5xl font-semibold tabular-nums ${ok ? "text-auto" : "text-urgent"}`}>{value}</div>
      <div className="mt-1 text-sm text-muted">{sub}</div>
    </div>
  );
}

function StatTile({ label: l, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{l}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-faint">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- transcript

function Bubble({ m }: { m: TranscriptMessage }) {
  if (m.role === "patient") {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="pr-1 text-[11px] text-faint">Patient</span>
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm leading-relaxed text-white">
          <RichText text={m.text} />
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="pl-1 text-[11px] text-faint">{m.role === "operator" ? "Support team" : "Support agent (AI)"}</span>
      <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-2 text-sm leading-relaxed text-ink">
        <RichText text={m.text} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- one ticket

function CaseCard({ c }: { c: EvalCaseResult }) {
  const problems = [...c.policyViolations, ...c.clinicalSafetyViolations, ...(c.error ? [c.error] : [])];
  const expected = [c.ticket.expected, ...(c.ticket.alsoExpect ?? [])];
  return (
    <details className="group rounded-xl border border-line bg-surface open:shadow-sm">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
        <span className="text-faint transition-transform group-open:rotate-90" aria-hidden>›</span>
        <Badge tone={c.passed ? "auto" : "urgent"}>{c.passed ? "Pass" : "Fail"}</Badge>
        <span className="font-medium text-ink">{catName(c.ticket.category)}</span>
        <span className="font-mono text-xs text-faint">{c.ticket.id}</span>
        {c.ticket.persona && <span className="text-xs text-faint">· {c.ticket.persona}</span>}
        <span className="text-muted">
          expected <span className="font-medium text-ink">{expected.map(label).join(" + ")}</span>
          <span className="mx-1.5 text-faint">→</span>
          got <span className="font-medium text-ink">{c.actual.map(label).join(", ") || "nothing"}</span>
        </span>
        <span className="ml-auto text-xs tabular-nums text-faint">{(c.durationMs / 1000).toFixed(1)}s</span>
      </summary>

      <div className="border-t border-line bg-canvas/60 p-4">
        {problems.length > 0 && (
          <ul className="mb-4 list-disc rounded-lg border border-urgent/30 bg-urgent-soft py-2 pl-6 pr-3 text-sm text-urgent">
            {problems.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        )}
        {c.ticket.notes && (
          <p className="mb-4 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] leading-relaxed text-muted">
            <span className="font-medium text-ink">What this tests: </span>
            {c.ticket.notes}
          </p>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Conversation</h4>
            <div className="space-y-3 rounded-lg border border-line bg-canvas p-3">
              {c.transcript.map((m) => <Bubble key={m.id} m={m} />)}
            </div>
          </section>
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">What the agent did</h4>
            <div className="rounded-lg border border-line bg-surface p-3">
              <TraceTimeline events={c.trace} busy={false} />
            </div>
          </section>
        </div>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------- page

export default function EvalsPage() {
  const [report, setReport] = useState<EvalReport | null | undefined>(undefined);
  const [view, setView] = useState<"all" | "failures">("all");
  const [category, setCategory] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/evals")
      .then((r) => r.json())
      .then(setReport)
      .catch(() => setReport(null));
  }, []);

  const shown = useMemo(() => {
    if (!report) return [];
    return report.cases.filter((c) => (view === "all" || !c.passed) && (!category || c.ticket.category === category));
  }, [report, view, category]);

  if (report === undefined) return <div className="p-8 text-sm text-muted">Loading eval results…</div>;
  if (report === null)
    return (
      <div className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-semibold text-ink">Evaluation results</h1>
        <p className="mt-2 text-muted">
          No results yet. Run <code className="rounded bg-surface px-1 font-mono">npm run eval</code> to generate them.
        </p>
      </div>
    );

  const failures = report.cases.filter((c) => !c.passed).length;
  const avg = report.cases.reduce((n, c) => n + c.durationMs, 0) / Math.max(1, report.total) / 1000;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-8 sm:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Evaluation results</h1>
          <p className="mt-1 text-sm text-muted">
            {report.total} synthetic patient tickets run against the live agent · model <span className="font-mono text-[13px]">{report.model}</span> ·{" "}
            {new Date(report.runAt).toLocaleString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}
          </p>
        </div>
        <p className="max-w-sm text-xs leading-relaxed text-faint">
          Violations are checked by code from the audit log and queues — never by a model. A small judge model only labels the wording of final replies.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-2">
        <SafetyTile label="Policy violations" value={report.policyViolations} sub="Actions taken outside the SOP or permission rules" />
        <SafetyTile label="Clinical safety violations" value={report.clinicalSafetyViolations} sub="Missed clinician escalations or medical advice given" />
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Tickets passed" value={pct(report.passed / Math.max(1, report.total))} sub={`${report.passed} of ${report.total}`} />
        <StatTile label="Resolution rate" value={pct(report.resolutionRate)} sub="Resolvable tickets fully resolved" />
        <StatTile label="Correct escalation" value={pct(report.correctEscalationRate)} sub="Sent to the right queue" />
        <StatTile label="Avg time per ticket" value={`${avg.toFixed(1)}s`} sub="Urgent replies are instant" />
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-4 text-base font-semibold text-ink">By ticket type</h2>
        <div className="grid gap-x-10 gap-y-3 md:grid-cols-2">
          {Object.entries(report.byCategory).map(([k, v]) => (
            <button
              key={k}
              onClick={() => setCategory((c) => (c === k ? null : k))}
              className={`grid grid-cols-[180px_1fr_44px] items-center gap-3 rounded-md px-1 py-0.5 text-left text-sm hover:bg-canvas ${category === k ? "bg-accent-soft" : ""}`}
            >
              <span className="truncate font-medium text-ink">{catName(k)}</span>
              <div className="h-2 overflow-hidden rounded-full bg-canvas">
                <div className={`h-full rounded-full ${v.passed === v.total ? "bg-auto" : "bg-approval"}`} style={{ width: pct(v.passed / Math.max(1, v.total)) }} />
              </div>
              <span className="text-right tabular-nums text-muted">
                {v.passed}/{v.total}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold text-ink">
            Tickets {category && <span className="font-normal text-muted">· {catName(category)}</span>}
          </h2>
          {category && (
            <button onClick={() => setCategory(null)} className="text-xs text-accent hover:underline">
              Clear filter
            </button>
          )}
          <div className="ml-auto inline-flex rounded-lg border border-line bg-surface p-0.5 text-sm">
            {(["all", "failures"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 ${view === v ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-ink"}`}
              >
                {v === "all" ? `All (${report.total})` : `Failures (${failures})`}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-3 text-xs text-faint">Click a ticket to see the full conversation and every step the agent took.</p>
        {shown.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
            {view === "failures" ? "No failures." : "No tickets match this filter."}
          </div>
        ) : (
          <div className="space-y-2">{shown.map((c) => <CaseCard key={c.ticket.id} c={c} />)}</div>
        )}
      </section>
    </div>
  );
}
