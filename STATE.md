# STATE

Living log of what's built, why, and what's next. Updated at the end of every phase.

## Current phase
Phase 1 — Data & SOPs ✅

## Decisions (plain language)

| Decision | Why |
|---|---|
| **Next.js 15 + TypeScript** | One codebase for the UI and the API routes, deploys to Vercel in one step. TypeScript catches mistakes in tool inputs and data shapes before runtime. |
| **Claude via the official Anthropic SDK, manual tool loop** | Writing the loop myself means *my code* sees every tool call before it runs. That is where permission checks, verification and safety rules live — the model proposes, the code decides. |
| **Model: `claude-opus-5-5` at low effort** (override with `ANTHROPIC_MODEL`) | Strongest instruction-following for a safety-sensitive healthcare flow; low effort keeps replies fast for a live demo. Switch to `claude-sonnet-5-5` if latency matters more. |
| **Server-side refusal fallback enabled** | If the primary model declines a request for safety-classifier reasons, the API automatically retries on a fallback model in the same call, so the demo never dead-ends. |
| **In-memory mock backend behind a `Store` interface** | Fast, zero setup, instant reset. Swappable for Redis/Postgres later without touching agent code. |
| **Zod for schemas** | Every tool input from the model is validated before it touches data — model output is treated as untrusted. |
| **SOPs stored as JSON in `data/sops/`, validated by Zod** | Ops teams can read and edit procedures without touching code. Policy numbers (refund limit, 30-day window, 24h late-change rule) live in the SOP and the code reads them — editing the SOP changes enforcement. |
| **Seed data generated relative to today** | An order that "dispatched yesterday" is always yesterday, so the demo never goes stale. |
| **Order lifecycle: scheduled → on_hold → processing → dispatched → delivered** | Mirrors Mosh's help centre. "Processing" = awaiting shipment with the pharmacy, after which Mosh's terms say no refund or change. |
| **Vitest for tests** | Safety and permission rules are tested deterministically without calling the model. |

## Research → policy mapping
- Refunds: no refund once an order is processing with the pharmacy (Mosh T&Cs, refund policy page). **Assumed:** 30-day window, $50 auto-refund limit.
- Cancellation: portal flow, doesn't cancel in-flight orders, snooze offered as alternative; Commit & Save has a termination fee (cancel help page, T&Cs). **Assumed:** pause offered exactly once, enforced in code.
- Psychologist sessions: <24h change = 50% fee (missed-appointment page). **Assumed:** doctor follow-ups move free.
- Orders: pharmacy prep 3–4 days; contact support if >7 days (order help pages).
- Emergencies: 000 (cancel help page).

## Mock patients (15, fictional, @example.com)
Each covers a scenario — see `demoScenario` in `lib/store/seed.ts`: in-transit order, processing order, already-dispatched, small refund, large refund, outside-window refund, recently cancelled, multiple programs, <24h psychologist reschedule, doctor reschedule, Commit & Save cancel, standard cancel, late order, identity mismatch, declined payment.

## Known issues
- None yet.

## Next step
Phase 2 — agent loop, tools, permission gate, safety classifier, tests.
