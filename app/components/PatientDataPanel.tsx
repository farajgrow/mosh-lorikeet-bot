"use client";

import { useEffect, useRef, useState } from "react";
import type { PatientDetail } from "@/lib/api/contract";
import { fmtDate, fmtDateTime, money } from "@/lib/format";
import { Badge, type Tone } from "./Badge";
import { fetchJSON } from "./api";

const STATUS_TONE: Record<string, Tone> = {
  active: "auto",
  paused: "approval",
  cancelled: "blocked",
  scheduled: "info",
  on_hold: "approval",
  processing: "info",
  dispatched: "auto",
  delivered: "neutral",
  skipped: "blocked",
  completed: "neutral",
  paid: "neutral",
  refunded: "auto",
  partially_refunded: "auto",
  declined: "urgent",
};

const PROGRAM: Record<string, string> = {
  hair_loss: "Hair loss",
  sexual_health: "Sexual health",
  skincare: "Skincare",
  mental_health: "Mental health",
  weight_management: "Weight management",
};

function Status({ s }: { s: string }) {
  return <Badge tone={STATUS_TONE[s] ?? "neutral"}>{s.replace(/_/g, " ")}</Badge>;
}

/** Fingerprint of each record so we can flash rows that changed since the last fetch. */
function fingerprints(d: PatientDetail): Map<string, string> {
  const m = new Map<string, string>();
  d.subscriptions.forEach((s) => m.set(s.id, `${s.status}|${s.nextOrderDate}|${s.pausedUntil}`));
  d.orders.forEach((o) => m.set(o.id, `${o.status}|${o.scheduledFor}`));
  d.consults.forEach((c) => m.set(c.id, `${c.status}|${c.scheduledAt}`));
  d.payments.forEach((p) => m.set(p.id, `${p.status}|${p.refundedCents}`));
  return m;
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-5 py-4 last:border-b-0">
      <h3 className="mb-2 text-sm font-semibold">
        {title} <span className="font-normal text-faint">{count}</span>
      </h3>
      {count === 0 ? <p className="text-sm text-faint">None</p> : children}
    </section>
  );
}

export function PatientDataPanel({ patientId, refreshKey }: { patientId: string | null; refreshKey: number }) {
  const [data, setData] = useState<PatientDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const prev = useRef<Map<string, string> | null>(null);
  const prevPatient = useRef<string | null>(null);

  useEffect(() => {
    if (!patientId) {
      setData(null);
      prev.current = null;
      return;
    }
    let cancelled = false;
    fetchJSON<PatientDetail>(`/api/patients/${patientId}`)
      .then((d) => {
        if (cancelled) return;
        const next = fingerprints(d);
        const diff = new Set<string>();
        if (prev.current && prevPatient.current === patientId) {
          next.forEach((v, k) => {
            if (prev.current!.get(k) !== v) diff.add(k);
          });
        }
        prev.current = next;
        prevPatient.current = patientId;
        setChanged(diff);
        setData(d);
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [patientId, refreshKey]);

  if (!patientId) {
    return (
      <div className="px-5 py-8 text-sm leading-relaxed text-muted">
        <p className="font-medium text-ink">No verified patient yet.</p>
        <p className="mt-1">Once the agent verifies who it&rsquo;s talking to, their subscriptions, orders, consults and payments appear here and update as the agent acts.</p>
      </div>
    );
  }
  if (error) return <p className="px-5 py-6 text-sm text-urgent">Couldn&rsquo;t load patient data: {error}</p>;
  if (!data) return <p className="px-5 py-6 text-sm text-muted">Loading patient data…</p>;

  const flash = (id: string) => (changed.has(id) ? "changed-flash" : "");
  const orders = [...data.orders].sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor));

  return (
    <div>
      <div className="border-b border-line px-5 py-3">
        <p className="text-sm font-semibold">{data.patient.name}</p>
        <p className="text-xs text-muted">{data.patient.email}</p>
        {changed.size > 0 && <p className="mt-1 text-xs text-approval">Highlighted rows changed after the last message.</p>}
      </div>

      <Section title="Subscriptions" count={data.subscriptions.length}>
        <ul className="space-y-2">
          {data.subscriptions.map((s) => (
            <li key={s.id} className={`rounded-md border border-line p-2.5 ${flash(s.id)}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{s.treatmentName}</p>
                  <p className="text-xs text-muted">
                    {PROGRAM[s.category] ?? s.category}, {money(s.priceCents)} every {s.frequencyDays} days
                    {s.commitAndSave && ", Commit & Save"}
                  </p>
                </div>
                <Status s={s.status} />
              </div>
              <p className="mt-1 text-xs text-muted">
                {s.status === "cancelled"
                  ? `Cancelled ${fmtDate(s.cancelledAt)}`
                  : s.status === "paused"
                    ? `Paused until ${fmtDate(s.pausedUntil)}`
                    : `Next order ${fmtDate(s.nextOrderDate)}`}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Orders" count={orders.length}>
        <table className="w-full text-left text-xs">
          <thead className="text-faint">
            <tr>
              <th className="pb-1 font-normal">Date</th>
              <th className="pb-1 font-normal">Status</th>
              <th className="pb-1 font-normal">Detail</th>
              <th className="pb-1 text-right font-normal">Amount</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className={`border-t border-line align-top ${flash(o.id)}`}>
                <td className="py-1.5 pr-2 whitespace-nowrap">{fmtDate(o.scheduledFor)}</td>
                <td className="py-1.5 pr-2">
                  <Status s={o.status} />
                </td>
                <td className="py-1.5 pr-2 text-muted">
                  {o.status === "dispatched" && o.eta ? `ETA ${fmtDate(o.eta)}` : o.holdReason ?? o.carrier ?? ""}
                </td>
                <td className="py-1.5 text-right tabular-nums">{money(o.amountCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Consults" count={data.consults.length}>
        <ul className="space-y-1.5">
          {data.consults.map((c) => (
            <li key={c.id} className={`flex items-start justify-between gap-2 text-xs ${flash(c.id)}`}>
              <span>
                <span className="font-medium">{c.type === "psychologist_session" ? "Psychologist session" : "Doctor follow-up"}</span>{" "}
                <span className="text-muted">
                  with {c.practitioner}, {fmtDateTime(c.scheduledAt)}
                </span>
              </span>
              <Status s={c.status} />
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Payments" count={data.payments.length}>
        <table className="w-full text-left text-xs">
          <tbody>
            {[...data.payments]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((p) => (
                <tr key={p.id} className={`border-t border-line first:border-t-0 ${flash(p.id)}`}>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{fmtDate(p.date)}</td>
                  <td className="py-1.5 pr-2">
                    <Status s={p.status} />
                  </td>
                  <td className="py-1.5 pr-2 text-muted">{p.refundedCents > 0 ? `${money(p.refundedCents)} refunded` : ""}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(p.amountCents)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
