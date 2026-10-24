"use client";

import { useEffect, useState } from "react";
import type { EvalCaseResult, EvalReport } from "@/lib/api/contract";

const pct = (x: number) => `${Math.round(x * 100)}%`;

function Tile({ label, value, sub, tone = "neutral", big = false }: { label: string; value: string; sub?: string; tone?: "neutral" | "good" | "bad"; big?: boolean }) {
  const toneCls =
    tone === "good"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
      : tone === "bad"
        ? "border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100"
        : "border-neutral-200 bg-white text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100";
  return (
    <div className={`rounded-xl border p-4 ${toneCls} ${big ? "sm:col-span-2" : ""}`}>
      <div className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</div>
      <div className={`mt-1 font-semibold tabular-nums ${big ? "text-5xl" : "text-3xl"}`}>{value}</div>
      {sub && <div className="mt-1 text-xs opacity-70">{sub}</div>}
    </div>
  );
}

function CaseDetail({ c }: { c: EvalCaseResult }) {
  const problems = [...c.policyViolations, ...c.clinicalSafetyViolations, ...(c.error ? [c.error] : [])];
  return (
    <details className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
        <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${c.passed ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100"}`}>
          {c.passed ? "PASS" : "FAIL"}
        </span>
        <span className="font-mono text-xs">{c.ticket.id}</span>
        <span className="text-neutral-500">
          expected <b>{[c.ticket.expected, ...(c.ticket.alsoExpect ?? [])].join(" + ")}</b> · got <b>{c.actual.join(", ") || "—"}</b>
        </span>
        <span className="ml-auto text-xs text-neutral-400">{(c.durationMs / 1000).toFixed(1)}s</span>
      </summary>
      <div className="grid gap-4 border-t border-neutral-200 p-4 text-sm md:grid-cols-2 dark:border-neutral-800">
        <div>
          {problems.length > 0 && (
            <ul className="mb-3 list-disc rounded bg-red-50 py-2 pl-6 pr-3 text-red-800 dark:bg-red-950 dark:text-red-200">
              {problems.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          )}
          {c.ticket.notes && <p className="mb-3 text-xs text-neutral-500">Note: {c.ticket.notes}</p>}
          <h4 className="mb-2 text-xs font-semibold uppercase text-neutral-500">Transcript</h4>
          <div className="space-y-2">
            {c.transcript.map((m) => (
              <div key={m.id} className={`rounded-lg px-3 py-2 ${m.role === "patient" ? "bg-neutral-100 dark:bg-neutral-800" : "bg-sky-50 dark:bg-sky-950"}`}>
                <div className="text-[10px] font-semibold uppercase text-neutral-500">{m.role}</div>
                <div className="whitespace-pre-wrap">{m.text}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase text-neutral-500">Trace</h4>
          <ol className="space-y-1.5">
            {c.trace.map((e) => (
              <li key={e.id} className="rounded border border-neutral-100 px-2 py-1.5 dark:border-neutral-800">
                <div className="flex items-center gap-2">
                  {e.badge && <span className="rounded bg-neutral-100 px-1 text-[10px] uppercase dark:bg-neutral-800">{e.badge}</span>}
                  <span className="font-medium">{e.title}</span>
                </div>
                {e.detail && <div className="text-xs text-neutral-500">{e.detail}</div>}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </details>
  );
}

export default function EvalsPage() {
  const [report, setReport] = useState<EvalReport | null | undefined>(undefined);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetch("/api/evals")
      .then((r) => r.json())
      .then(setReport)
      .catch(() => setReport(null));
  }, []);

  if (report === undefined) return <main className="p-8 text-sm text-neutral-500">Loading eval results…</main>;
  if (report === null)
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-semibold">Evaluation results</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          No results yet. Run <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">npm run eval</code> to generate them.
        </p>
      </main>
    );

  const failures = report.cases.filter((c) => !c.passed);
  const shown = showAll ? report.cases : failures;

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-semibold">Evaluation results</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {report.total} synthetic patient tickets · model {report.model} · run {new Date(report.runAt).toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile big label="Policy violations" value={String(report.policyViolations)} sub="Actions taken outside SOP or permission rules" tone={report.policyViolations === 0 ? "good" : "bad"} />
        <Tile big label="Clinical safety violations" value={String(report.clinicalSafetyViolations)} sub="Missed escalations or medical advice given" tone={report.clinicalSafetyViolations === 0 ? "good" : "bad"} />
        <Tile label="Tickets passed" value={pct(report.passed / Math.max(1, report.total))} sub={`${report.passed} of ${report.total}`} />
        <Tile label="Resolution rate" value={pct(report.resolutionRate)} sub="Resolvable tickets fully resolved" />
        <Tile label="Correct escalation" value={pct(report.correctEscalationRate)} sub="Escalated to the right queue" />
        <Tile label="Avg time / ticket" value={`${(report.cases.reduce((n, c) => n + c.durationMs, 0) / Math.max(1, report.total) / 1000).toFixed(1)}s`} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">By ticket type</h2>
        <div className="space-y-2">
          {Object.entries(report.byCategory).map(([k, v]) => (
            <div key={k} className="grid grid-cols-[120px_1fr_60px] items-center gap-3 text-sm">
              <span className="truncate font-medium capitalize">{k.replace("_", " ")}</span>
              <div className="h-3 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: pct(v.passed / Math.max(1, v.total)) }} />
              </div>
              <span className="text-right tabular-nums text-neutral-500">{v.passed}/{v.total}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{showAll ? "All tickets" : `Failures (${failures.length})`}</h2>
          <button onClick={() => setShowAll((s) => !s)} className="rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800">
            {showAll ? "Show failures only" : "Show all tickets"}
          </button>
        </div>
        {shown.length === 0 ? (
          <p className="text-sm text-neutral-500">No failures 🎉</p>
        ) : (
          <div className="space-y-2">{shown.map((c) => <CaseDetail key={c.ticket.id} c={c} />)}</div>
        )}
      </section>
    </main>
  );
}
