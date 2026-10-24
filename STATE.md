# STATE

Living log of what's built, why, and what's next. Updated at the end of every phase.

## Current phase
Phases 0–4 done ✅ · eval 69/69, 0 policy violations, 0 clinical safety violations · Phase 5 (deploy) next

## Decisions (plain language)

| Decision | Why |
|---|---|
| **Next.js 15 + TypeScript** | One codebase for the UI and the API routes, deploys to Vercel in one step. TypeScript catches mistakes in tool inputs and data shapes before runtime. |
| **Claude via the official Anthropic SDK, manual tool loop** | Writing the loop myself means *my code* sees every tool call before it runs. That is where permission checks, verification and safety rules live — the model proposes, the code decides. |
| **Agent model: `claude-sonnet-5-5` at low effort** (override with `ANTHROPIC_MODEL`) | Good balance of speed, quality and cost for a live demo. Opus 5.5 is available for maximum care; Haiku 5.5 for cheap eval runs. Safety and permissions don't depend on the model, so a cheaper model can only make conversations worse, never unsafe. |
| **Router model: `claude-haiku-5-5`** | Picking the SOP is a classification task — the cheapest model is enough. Its answer is constrained to a fixed list of SOP ids (structured output), so it can't invent a procedure. It also gives a second, model-based opinion on clinical/urgent content. |
| **Considered Gemini; stayed on Claude** | Haiku 5.5 is already in the cheap tier, and one provider means one SDK, one loop, one set of behaviours to test. |
| **Server-side refusal fallback enabled** | If the primary model declines a request for safety-classifier reasons, the API automatically retries on a fallback model in the same call, so the demo never dead-ends. |
| **In-memory mock backend (`lib/store/db.ts`)** | Fast, zero setup, instant reset. All access goes through `getDb()`. |
| **Deployed state: Neon Postgres via the Vercel Marketplace** | Vercel runs each request on whichever instance is free, so memory isn't shared — state must live in a database. Considered Supabase (out of free projects) and Upstash Redis (key-value, weaker story); Neon is free Postgres, one click from Vercel, sets `DATABASE_URL` automatically, and its HTTP driver suits serverless. |
| **One versioned JSON document + optimistic locking + per-record merge** (`lib/store/persist.ts`) | Each request loads state, works on a private copy (AsyncLocalStorage), and saves only if the version hasn't moved. If it has, only the records this request changed are merged onto the latest — so an operator approval and a chat turn at the same time both survive. Table is auto-created. In production these would be proper tables; a single document keeps the demo resettable. |
| **Public-demo hardening** | Per-IP rate limit (40 msgs / 10 min), 30 turns per conversation, 2,000-char messages, 60s function limit for chat. Real budget guard: Anthropic console spend limit. |
| **Zod for schemas** | Every tool input from the model is validated before it touches data — model output is treated as untrusted. |
| **SOPs stored as JSON in `data/sops/`, validated by Zod** | Ops teams can read and edit procedures without touching code. Policy numbers (refund limit, 30-day window, 24h late-change rule) live in the SOP and the code reads them — editing the SOP changes enforcement. |
| **Seed data generated relative to today** | An order that "dispatched yesterday" is always yesterday, so the demo never goes stale. |
| **Order lifecycle: scheduled → on_hold → processing → dispatched → delivered** | Mirrors Mosh's help centre. "Processing" = awaiting shipment with the pharmacy, after which Mosh's terms say no refund or change. |
| **The permission gate (`lib/permissions/gate.ts`)** | Every tool call passes 6 checks in order: known tool → valid input → verified patient → hard rules (ownership, order already dispatched…) → policy thresholds (→ human queue) → execute. It's the only code path that can change data, apart from a human approval. Prompt injection can't reach it. |
| **Tools split into `assess()` and `execute()`** | `assess` is pure (no side effects) and returns either "not allowed + reason" or "allowed + which policy rules need a human". The gate decides. On human approval, `assess` re-runs (state may have changed) before `execute`. |
| **Safety in three layers** | (1) Regex classifier before the model — urgent → fixed 000 reply, model never called. (2) Router model as second opinion, OR-ed in code. (3) Output filter on every reply — catches advice like "you can take two tablets" and replaces it. Plus: if clinical content was detected and the model didn't escalate, the code escalates anyway. |
| **SOP steps enforced in code where it matters** | Cancellation: `cancel_subscription` refuses unless `record_retention_offer` ran in an *earlier* turn — the patient must actually get the chance to say no to the pause. Reschedule: only real slots from `get_available_slots` are accepted. |
| **Per-turn context as a mid-conversation system message** | The main system prompt stays identical every request (cheap via prompt caching); the selected SOP, today's date and safety flags arrive as a system message after the patient's message. Patient text stays in the user role, so it never carries system authority. |
| **Human approvals post templated messages** | When an operator approves, the patient's chat updates instantly with fixed wording — no model call, so it can't fail or say the wrong thing. |
| **Live trace over Server-Sent Events** | The reasoning panel fills in step by step while the agent works, which is the centrepiece of the demo. |
| **Thinking display "summarized"** | The model's reasoning summary appears in the trace as "Agent reasoning", so a viewer sees *why*, not just *what*. |
| **Server-side refusal fallback** | On Sonnet/Opus the API retries a safety-classifier refusal on a fallback model inside the same call, so the demo doesn't dead-end. |
| **All times in Sydney** | The server pins `TZ=Australia/Sydney` so seed data and appointment slots read correctly even on Vercel (UTC). |
| **Vitest for tests** | Safety and permission rules are tested deterministically without calling the model. |

## Research → policy mapping
- Refunds: no refund once an order is processing with the pharmacy (Mosh T&Cs, refund policy page). **Assumed:** 30-day window, $50 auto-refund limit.
- Cancellation: portal flow, doesn't cancel in-flight orders, snooze offered as alternative; Commit & Save has a termination fee (cancel help page, T&Cs). **Assumed:** pause offered exactly once, enforced in code.
- Psychologist sessions: <24h change = 50% fee (missed-appointment page). **Assumed:** doctor follow-ups move free.
- Orders: pharmacy prep 3–4 days; contact support if >7 days (order help pages).
- Emergencies: 000 (cancel help page).

## Mock patients (15, fictional, @example.com)
Each covers a scenario — see `demoScenario` in `lib/store/seed.ts`: in-transit order, processing order, already-dispatched, small refund, large refund, outside-window refund, recently cancelled, multiple programs, <24h psychologist reschedule, doctor reschedule, Commit & Save cancel, standard cancel, late order, identity mismatch, declined payment.

## Tests (no API key needed) — `npm test`
141 tests: 98 safety classifier/output-filter cases, 20 gate/permission cases (verification, ownership, refund thresholds, cancellation flow, reschedule), 6 full-loop tests with a scripted fake model (urgent short-circuit, forced clinical escalation, output filter, injection can't refund, happy path, model outage), 17 eval-grader tests.

## Evals — `npm run eval`
69 synthetic tickets in `evals/tickets.json` (lookup 11, action 12, risky 11, clinical 9, injection 9, urgent 7, vague 4, multi-intent 3, identity 3). Results page at `/evals`.

**Grading:** hard signals (actions executed, items queued, audit log) come from code. When there's no hard signal, a Haiku judge labels the final reply as resolved / refused / asked_for_info, seeing both the request and the reply (`--no-judge` falls back to keyword rules). **Violations are only ever checked by code, never by a model.**

**Latest run (Sonnet 5.5):** 69/69 passed · resolution 100% · correct escalation 100% · policy violations 0 · clinical safety violations 0 · ~6.5s per ticket.

**What the first run taught us (62/69):** all 7 failures were grading errors, not agent errors — keyword rules read polite follow-up offers ("Would you like me to…?") as asking for info, and "I can't advise on dosing" as refusing the whole request. Fixed by the judge. Also tightened SOP OC-3: when the latest order is still in transit, confirm which order to skip before skipping (editing SOP data changed the behaviour, no code change).

## How this was built
Core (data, SOPs, gate, tools, agent loop, API) written first; UI, eval harness and safety tests/docs built in parallel by helper agents against a fixed contract (`lib/api/contract.ts`), then integrated and verified.

## Known issues
- Narrow windows (< ~1000px) switch the chat page to a stacked layout; record the demo in a full-width window.

## Next step
Phase 5: import the repo on Vercel, add Neon storage + `ANTHROPIC_API_KEY`, verify the live URL, record the Loom using DEMO_SCRIPT.md, then make the repo public.
