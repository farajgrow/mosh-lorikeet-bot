# Mosh Support Concierge (concept)

> **Unofficial concept built by Faraj Abbasi. Not affiliated with Mosh. Uses mock data.**

**Live demo:** https://mosh-lorikeet-bot.vercel.app · **Eval results:** https://mosh-lorikeet-bot.vercel.app/evals (69/69, zero policy and clinical-safety violations)

An AI support agent for a subscription telehealth platform that **resolves** patient tickets instead of linking help articles. It follows written standard operating procedures (SOPs), takes real actions against a mock backend, pauses for human approval on risky actions, and never gives medical advice.

## What it demonstrates
1. **SOPs as data** — each ticket type has a structured, editable procedure (`data/sops/`).
2. **Real actions through tools** — look up shipments, skip/pause deliveries, reschedule consults, refund, cancel.
3. **Permission gating in code** — each tool is `auto`, `auto_under_threshold` or `requires_approval`. The model cannot bypass it, even via prompt injection.
4. **Clinical safety outside the model** — clinical questions go to a clinician queue; urgent symptoms trigger an immediate 000 response before the model is ever called.
5. **Auditability** — live reasoning trace next to the chat, plus a full audit log.

## Run locally
```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
npm test                     # safety + permission tests (no API key needed)
npm run smoke                # end-to-end flows from the CLI
npm run eval                 # synthetic ticket evaluation
npm run db:check             # Postgres persistence check (needs DATABASE_URL)
```

## Stack
Next.js 15 · TypeScript · Claude (Sonnet 5.5 agent, Haiku 5.5 router) via the Anthropic SDK · Zod · Vitest · Neon Postgres · Vercel

See [STATE.md](STATE.md) for design decisions, [DEPLOYMENT_NOTES.md](DEPLOYMENT_NOTES.md) for how this would roll out at a real telehealth company, and [DEMO_SCRIPT.md](DEMO_SCRIPT.md) for the 2-minute walkthrough.
