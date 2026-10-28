import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { InMemoryCrm } from '../src/tools.js';
import { ConsoleSender, parseEvolutionPayload } from '../src/whatsapp.js';

const payload = (phone: string, text: string) => ({
  event: 'messages.upsert',
  data: { key: { remoteJid: `${phone}@s.whatsapp.net`, fromMe: false }, message: { conversation: text } },
});

async function send(app: ReturnType<typeof buildApp>, phone: string, text: string) {
  const res = await app.inject({ method: 'POST', url: '/webhook/whatsapp', payload: payload(phone, text) });
  return res.json();
}

describe('agent hand-off flow', () => {
  it('sales answers questions, collects data, then legal sends contract + finance payment link', async () => {
    const sender = new ConsoleSender();
    const app = buildApp({ sender });
    await send(app, '5541000001', 'How does it work?');
    await send(app, '5541000001', 'I want to buy');
    await send(app, '5541000001', 'Maria Souza');
    await send(app, '5541000001', 'Acme Ltd');
    await send(app, '5541000001', 'not-an-email');
    await send(app, '5541000001', 'maria@acme.test');
    await send(app, '5541000001', 'Pro');

    const conv = (await app.inject({ method: 'GET', url: '/conversations/5541000001' })).json();
    expect(conv.state).toBe('contract_sent');
    expect(conv.lead).toMatchObject({ name: 'Maria Souza', company: 'Acme Ltd', email: 'maria@acme.test', plan: 'Pro' });
    const handoffs = conv.trace.filter((t: any) => t.type === 'handoff').map((t: any) => t.detail);
    expect(handoffs).toContain('sales -> legal');
    expect(handoffs).toContain('legal -> finance');
    expect(handoffs).toContain('finance -> legal');
    const last = sender.outbox.at(-1)!.text;
    expect(last).toContain('SERVICE AGREEMENT');
    expect(last).toContain('https://pay.example.test/checkout/');
  });

  it('existing customers are answered by support, not sales', async () => {
    const app = buildApp({ crm: new InMemoryCrm(new Set(['5541000002'])) });
    await send(app, '5541000002', 'I need help with an error');
    const conv = (await app.inject({ method: 'GET', url: '/conversations/5541000002' })).json();
    expect(conv.state).toBe('support');
    expect(conv.messages.at(-1).from).toBe('support');
  });

  it('low confidence escalates to a human and the agents stop replying', async () => {
    const app = buildApp();
    await send(app, '5541000003', 'asdf qwer');
    const conv = (await app.inject({ method: 'GET', url: '/conversations/5541000003' })).json();
    expect(conv.state).toBe('human');
    const again = await send(app, '5541000003', 'hello?');
    expect(again.replies).toBe(0);
  });

  it('ignores outgoing messages and non-message events', () => {
    expect(parseEvolutionPayload({ event: 'connection.update' })).toBeNull();
    const own = payload('5541000004', 'hi');
    (own.data.key as any).fromMe = true;
    expect(parseEvolutionPayload(own)).toBeNull();
  });
});
