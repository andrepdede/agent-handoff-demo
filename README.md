# agent-handoff-demo

Small TypeScript reference for a **multi-agent WhatsApp assistant**: a sales agent answers questions and collects data, a legal agent produces the contract, a finance agent creates the payment link, and existing customers are routed to support. Low-confidence turns escalate to a human.

A sanitized, simplified version of patterns I use in production systems (no client data, no secrets).

## Flow

```
WhatsApp (Evolution API webhook)
        |
   POST /webhook/whatsapp  -> parse -> Orchestrator
                                         |
   customer?  -- yes --> support agent (answers or escalates)
        | no
   sales agent -- question --> answer
        | purchase intent
   collect name/company/email/plan (validated)
        |
   sales -> legal (contract) -> finance (payment link) -> legal sends contract + link
        |
   confidence < 0.5 at any point -> state "human": agents go silent
```

## Design decisions
- **LLM behind an interface** (`src/llm.ts`): Mock for offline tests, Anthropic adapter optional. Swapping vendors touches one file.
- **Ports for CRM and payments** (`src/tools.ts`): agents never call vendors directly, so tests need no network.
- **Explicit state machine + trace**: every hand-off and escalation is recorded (`trace`), which makes the flow auditable.
- **Human escalation as a guardrail**, not an afterthought.
- Persistence target is PostgreSQL (`db/schema.sql`); the demo keeps state in memory to stay small.

## Run
```bash
npm install
npm test        # 4 end-to-end tests through the real webhook route
npm run dev     # http://localhost:3000
curl -X POST localhost:3000/webhook/whatsapp -H 'content-type: application/json' \
  -d '{"event":"messages.upsert","data":{"key":{"remoteJid":"5541999990000@s.whatsapp.net","fromMe":false},"message":{"conversation":"I want to buy"}}}'
```

## Limits (honest)
In-memory store, no auth on the webhook, no queue/retries, Anthropic adapter not covered by tests. Production adds PostgreSQL, Redis/BullMQ, signature verification and observability.

## Agent evaluation harness (`eval/`)

A small, vendor-neutral way to answer "did my change make the agents better or worse?" without training anything.

- `eval/dataset.jsonl`: scripted conversations with expected outcomes (final state, hand-offs, escalation, forbidden content). Includes hallucination traps (questions the knowledge base cannot answer must escalate, not invent).
- `eval/metrics.ts`: per-case judge, escalation precision/recall, per-tag breakdown, regression gate.
- `npm run eval`: runs the dataset, writes `eval/report.md` + `eval/results.json`, exits 1 if a headline metric drops below `eval/baseline.json`.
- `npm run eval:baseline`: accepts the current scores as the new baseline.
- `EVAL_LLM=mock|overconfident|anthropic`. `overconfident` is a deliberately bad model that proves the harness catches hallucination (recall drops from 100% to ~14%). `anthropic` is the real adapter and is untested here (needs `ANTHROPIC_API_KEY`).

What it found when first run: the keyword matcher in `MockLLM` answered a price question with the generic "how it works" text because it took the first match; now best-match wins.

Honest scope: this is evaluation of an LLM *application* (behavior regression testing). It is not model training or fine-tuning. Dataset is synthetic (15 cases), so treat the percentages as a regression signal, not a quality claim.
