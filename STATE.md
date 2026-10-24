# STATE

Living log of what's built, why, and what's next. Updated at the end of every phase.

## Current phase
Phase 0 — Setup ✅

## Decisions (plain language)

| Decision | Why |
|---|---|
| **Next.js 15 + TypeScript** | One codebase for the UI and the API routes, deploys to Vercel in one step. TypeScript catches mistakes in tool inputs and data shapes before runtime. |
| **Claude via the official Anthropic SDK, manual tool loop** | Writing the loop myself means *my code* sees every tool call before it runs. That is where permission checks, verification and safety rules live — the model proposes, the code decides. |
| **Model: `claude-opus-5-5` at low effort** (override with `ANTHROPIC_MODEL`) | Strongest instruction-following for a safety-sensitive healthcare flow; low effort keeps replies fast for a live demo. Switch to `claude-sonnet-5-5` if latency matters more. |
| **Server-side refusal fallback enabled** | If the primary model declines a request for safety-classifier reasons, the API automatically retries on a fallback model in the same call, so the demo never dead-ends. |
| **In-memory mock backend behind a `Store` interface** | Fast, zero setup, instant reset. Swappable for Redis/Postgres later without touching agent code. |
| **Zod for schemas** | Every tool input from the model is validated before it touches data — model output is treated as untrusted. |
| **Vitest for tests** | Safety and permission rules are tested deterministically without calling the model. |

## Known issues
- None yet.

## Next step
Phase 1 — research Mosh's public help centre, write SOPs as JSON, seed mock patients with edge cases.
