import Fastify from 'fastify';
import type { Conversation } from './types.js';
import { Orchestrator } from './orchestrator.js';
import { MockLLM, AnthropicLLM, type LLM } from './llm.js';
import { InMemoryCrm, FakePayments, type Crm, type PaymentProvider } from './tools.js';
import { parseEvolutionPayload, ConsoleSender, type Sender } from './whatsapp.js';

export interface Deps { llm?: LLM; crm?: Crm; payments?: PaymentProvider; sender?: Sender }

export function buildApp(deps: Deps = {}) {
  const crm = deps.crm ?? new InMemoryCrm();
  const sender = deps.sender ?? new ConsoleSender();
  const llm = deps.llm ?? (process.env.ANTHROPIC_API_KEY ? new AnthropicLLM() : new MockLLM());
  const orchestrator = new Orchestrator(llm, crm, deps.payments ?? new FakePayments());
  const store = new Map<string, Conversation>(); // swap for PostgreSQL (see db/schema.sql)

  const app = Fastify();

  app.post('/webhook/whatsapp', async (req, reply) => {
    const inbound = parseEvolutionPayload(req.body);
    if (!inbound) return reply.code(200).send({ ignored: true });
    let c = store.get(inbound.phone);
    if (!c) {
      c = {
        id: inbound.phone,
        contact: { phone: inbound.phone, isCustomer: crm.isCustomer(inbound.phone) },
        state: 'sales', lead: {}, messages: [], trace: [],
      };
      store.set(inbound.phone, c);
    }
    const replies = await orchestrator.handle(c, inbound.text);
    for (const r of replies) await sender.send(inbound.phone, r.text);
    return { state: c.state, replies: replies.length };
  });

  app.get<{ Params: { phone: string } }>('/conversations/:phone', async (req, reply) => {
    const c = store.get(req.params.phone);
    return c ?? reply.code(404).send({ error: 'not found' });
  });

  return app;
}
