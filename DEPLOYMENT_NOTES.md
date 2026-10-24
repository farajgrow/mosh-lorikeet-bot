# Deployment notes: AI Support Concierge for Mosh

*To: Head of Patient Support, Mosh. From: Faraj Abbasi. This concept is unofficial and runs on mock data. These notes describe how I'd make it real.*

## What the demo already proves
- **SOPs are data, not prompt text.** Each ticket type is a JSON procedure (`data/sops/`) with steps, eligibility rules, escalation conditions and source links. The policy numbers the code enforces come from these files: the $50 auto-refund limit, the 30-day window and the 24h late-change rule.
- **Permissions are enforced in code.** Every tool call passes a gate first. A tool runs automatically, runs automatically under a threshold, or needs human approval. The model can *propose* a refund but cannot *execute* one outside policy. Prompt injection can't get past the gate because it lives outside the model.
- **Clinical safety doesn't depend on the prompt.** A deterministic pre-check runs before the model sees a message. Urgent symptoms get fixed 000 wording and an urgent clinician escalation, and the model is never called. Clinical questions are always escalated, even if the model forgets. An output filter blocks replies that read like medical advice.
- **Everything is auditable.** Each conversation has a live reasoning trace. Every action is logged with timestamp, tool, inputs, outcome and approver. An eval harness of 55+ adversarial tickets has to show zero policy violations and zero clinical safety violations.

## What I'd need from Mosh
1. **System access, read-only first.** I'd need APIs or a read replica for subscriptions, orders and pharmacy status, carrier tracking, consult booking, and payments (Stripe or equivalent). Write access comes later, one action at a time, with scoped service accounts.
2. **Internal SOPs and macros.** The help centre only covers the public part. The real rules matter: refund discretion, Commit & Save exceptions, the cold-chain shipping days for weight management, and pharmacy cut-off times.
3. **Ticket history.** About 3–6 months of de-identified tickets with outcomes. This gives the real ticket-type mix, the phrasings patients use, and an eval set graded against what your best agents actually did.
4. **The clinical escalation policy, signed off by the Medical Director.** That means what counts as clinical, the urgent criteria, triage SLAs, and who on the clinician side owns the queue.
5. **Owners.** A support ops lead to own the SOPs, a clinical lead for the safety rules, and an engineer on your side for integrations.

## Rollout, with a gate between each stage
| Stage | What happens | Gate to move on |
|---|---|---|
| **0. Offline evals** | Replay historical tickets and grade them against your agents' outcomes. | ≥90% agreement on the outcome; 0 clinical misses |
| **1. Shadow mode (2–4 weeks)** | The agent drafts replies and actions on live tickets; humans send everything. | Drafts accepted unedited ≥80%; 0 unsafe drafts |
| **2. One ticket type live** | Start with "Where's my order?". It's read-only, highest volume and lowest risk. | CSAT ≥ human baseline; escalation precision ≥90% |
| **3. Actions behind approval** | Turn on skip, pause and reschedule automatically. Refunds and cancellations always go to approval at first. | Approval rate ≥95%, which shows the thresholds are calibrated |
| **4. Partial traffic → widen** | Run 10% → 50% → 100% per ticket type and raise the auto-thresholds based on the data. | Weekly review of metrics and incidents |

There's a kill switch per ticket type, and an instant fallback to the human queue.

## Healthcare considerations
- **Privacy Act 1988 and the Australian Privacy Principles.** Health information is *sensitive information*. Collect the minimum, verify identity before disclosing anything, keep data onshore (an AU region for hosting and LLM inference, or ensure contractual APP 8 coverage), and require zero-retention terms with the model provider. Redact identifiers from logs and eval sets.
- **Clinical governance (AHPRA, the Medical Board).** The agent never practises medicine. Clinical questions go to registered practitioners, and the Medical Director approves the classifier rules and audits them every quarter. Clinician escalations get SLAs and an on-call path.
- **TGA advertising rules.** Replies can't name or promote prescription-only medicines beyond the patient's own treatment. Retention offers stay non-clinical ("pause"), never "try a different drug".
- **Audit and retention.** Keep the immutable audit log and transcripts in line with health-record retention rules (around 7 years for adults in NSW). Every automated action can be traced to its SOP version and its approver.

## Metrics I'd track
- **Resolution rate:** share resolved with no human touch, per ticket type.
- **Escalation precision and recall:** were escalations needed, and were all the needed ones made?
- **Clinical safety incidents:** the target is **0**. Every miss is reviewed like an incident.
- **CSAT** compared with human agents, and **time to resolution** (median and P90).
- **Cost per ticket:** model spend plus approval time, compared with a fully human ticket.
- **Approval queue health:** approval rate, time to approve, and how often reviewers override the agent.

## Biggest risks and mitigations
| Risk | Mitigation |
|---|---|
| A clinical question is missed or treated as support | Three layers (regex pre-check, model classifier, output filter); OR-ed escalation; clinician audit of samples; the eval set grows with every miss |
| Wrong action on a real account (refund, cancel) | Gate in code, ownership checks, idempotent writes, thresholds start conservative, every action reversible or approved |
| Identity or privacy failure | Verify before disclosing, no switching patient mid-chat, lockout after 3 failed attempts, minimal data in replies |
| SOP drift (the policy changes but the agent doesn't) | SOPs are versioned data owned by support ops; a changed SOP triggers an eval run before deploy |
| Over-escalation erodes the ROI | Track escalation precision; tune the classifiers against labelled tickets; sample review weekly |
| Vendor or model outage | Graceful handoff to the human queue; retries; refusal fallback model |
