"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { QueueItem } from "@/lib/api/contract";
import { fetchJSON } from "./api";
import { usePolling } from "./usePolling";

const LINKS = [
  { href: "/", label: "Patient chat" },
  { href: "/operator", label: "Operator queues" },
  { href: "/audit", label: "Audit log" },
  { href: "/evals", label: "Evals" },
];

export function TopNav() {
  const pathname = usePathname();
  const [pending, setPending] = useState<{ total: number; urgent: number }>({ total: 0, urgent: 0 });
  const [resetting, setResetting] = useState(false);

  usePolling(async () => {
    try {
      const q = await fetchJSON<QueueItem[]>("/api/queue");
      const open = q.filter((i) => i.status === "pending");
      setPending({ total: open.length, urgent: open.filter((i) => i.urgent).length });
    } catch {
      /* nav badge is best-effort */
    }
  }, 4000);

  async function reset() {
    if (!window.confirm("Reset all demo data? Conversations, queues and the audit log will be cleared.")) return;
    setResetting(true);
    try {
      await fetchJSON("/api/reset", { method: "POST" });
      try {
        window.localStorage.removeItem("concierge.conversationId");
      } catch {
        /* storage unavailable */
      }
      window.location.reload();
    } catch (e) {
      window.alert(`Reset failed: ${(e as Error).message}`);
      setResetting(false);
    }
  }

  return (
    <header className="border-b border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold tracking-tight">Support Concierge</span>
          <span className="text-xs text-faint">for subscription telehealth</span>
        </Link>
        <nav aria-label="Main" className="flex flex-1 flex-wrap items-center gap-1">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                  active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-canvas hover:text-ink"
                }`}
              >
                {l.label}
                {l.href === "/operator" && pending.total > 0 && (
                  <span
                    className={`min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold leading-5 text-white ${
                      pending.urgent > 0 ? "bg-urgent" : "bg-approval"
                    }`}
                    aria-label={`${pending.total} pending`}
                  >
                    {pending.total}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={reset}
          disabled={resetting}
          className="rounded-md border border-line px-2.5 py-1.5 text-sm text-muted transition-colors hover:border-faint hover:text-ink disabled:opacity-50"
        >
          {resetting ? "Resetting…" : "Reset demo data"}
        </button>
      </div>
    </header>
  );
}
