import type { AuditOutcome, TraceBadge } from "@/lib/store/types";

export type Tone = "auto" | "approval" | "escalated" | "urgent" | "blocked" | "info" | "neutral";

const TONES: Record<Tone, string> = {
  auto: "bg-auto-soft text-auto",
  approval: "bg-approval-soft text-approval",
  escalated: "bg-escalated-soft text-escalated",
  urgent: "bg-urgent-soft text-urgent",
  blocked: "bg-blocked-soft text-blocked",
  info: "bg-info-soft text-info",
  neutral: "bg-canvas text-muted",
};

export const DOT: Record<Tone, string> = {
  auto: "bg-auto",
  approval: "bg-approval",
  escalated: "bg-escalated",
  urgent: "bg-urgent",
  blocked: "bg-blocked",
  info: "bg-info",
  neutral: "bg-faint",
};

const TRACE_LABEL: Record<TraceBadge, string> = {
  auto: "Automatic",
  approval: "Needs approval",
  escalated: "Escalated",
  urgent: "Urgent",
  blocked: "Blocked",
  info: "Info",
};

export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function TraceBadgePill({ badge }: { badge: TraceBadge }) {
  return <Badge tone={badge}>{TRACE_LABEL[badge]}</Badge>;
}

const AUDIT_TONE: Record<AuditOutcome, Tone> = {
  executed: "auto",
  queued: "approval",
  blocked: "blocked",
  failed: "urgent",
  escalated: "escalated",
  read: "info",
};

const AUDIT_LABEL: Record<AuditOutcome, string> = {
  executed: "Executed",
  queued: "Queued for approval",
  blocked: "Blocked",
  failed: "Failed",
  escalated: "Escalated",
  read: "Read",
};

export function AuditBadge({ outcome }: { outcome: AuditOutcome }) {
  return <Badge tone={AUDIT_TONE[outcome] ?? "neutral"}>{AUDIT_LABEL[outcome] ?? outcome}</Badge>;
}
