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
