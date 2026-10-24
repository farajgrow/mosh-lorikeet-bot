"use client";

import { Fragment, useState } from "react";
import type { AuditEntry } from "@/lib/api/contract";
import { AuditBadge } from "../components/Badge";
import { fetchJSON } from "../components/api";
import { usePolling } from "../components/usePolling";

function when(ts: string) {
  return new Date(ts).toLocaleString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", second: "2-digit" });
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [hideReads, setHideReads] = useState(false);

  usePolling(async () => {
    try {
      setEntries(await fetchJSON<AuditEntry[]>("/api/audit"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, 3000);

  const rows = (entries ?? []).filter((e) => !hideReads || e.outcome !== "read");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Audit log</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Every tool the agent called, what happened, and who approved it. Newest first.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={hideReads} onChange={(e) => setHideReads(e.target.checked)} className="accent-accent" />
          Hide read-only lookups
        </label>
      </div>

      {error && <p className="mb-4 rounded-md bg-urgent-soft px-3 py-2 text-sm text-urgent">Couldn&rsquo;t load the audit log: {error}</p>}
      {!entries && !error && <p className="text-sm text-muted">Loading…</p>}
      {entries && rows.length === 0 && (
        <p className="rounded-lg border border-dashed border-line bg-surface px-4 py-10 text-center text-sm text-muted">
          No activity yet. Start a conversation on the patient chat page.
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Time</th>
                <th className="px-4 py-2.5 font-medium">Conversation</th>
                <th className="px-4 py-2.5 font-medium">Tool</th>
                <th className="px-4 py-2.5 font-medium">Outcome</th>
                <th className="px-4 py-2.5 font-medium">Detail</th>
                <th className="px-4 py-2.5 font-medium">Approver</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const isOpen = open === e.id;
                return (
                  <Fragment key={e.id}>
                    <tr
                      className="cursor-pointer border-t border-line align-top first:border-t-0 hover:bg-canvas"
                      onClick={() => setOpen(isOpen ? null : e.id)}
                      aria-expanded={isOpen}
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted">{when(e.ts)}</td>
                      <td className="px-4 py-2.5 text-muted" title={e.conversationId}>
                        {e.conversationId.slice(-6)}
                        {e.patientId && <span className="block text-xs text-faint">{e.patientId}</span>}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[12.5px]">{e.tool}</td>
                      <td className="px-4 py-2.5">
                        <AuditBadge outcome={e.outcome} />
                      </td>
                      <td className="px-4 py-2.5 leading-snug">{e.detail}</td>
                      <td className="px-4 py-2.5 text-muted">{e.approver ?? (e.outcome === "executed" ? "Automatic" : "")}</td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-canvas">
                        <td colSpan={6} className="px-4 pb-3">
                          <p className="pt-1 text-xs text-muted">Input</p>
                          <pre className="mt-1 overflow-auto rounded-md border border-line bg-surface p-2.5 font-mono text-[11.5px]">
                            {JSON.stringify(e.input, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
