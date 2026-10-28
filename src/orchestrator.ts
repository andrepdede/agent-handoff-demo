import type { Conversation, LeadData, Reply, Role, State } from './types.js';
import type { LLM } from './llm.js';
import { buildContract, type Crm, type PaymentProvider } from './tools.js';

const CONFIDENCE_FLOOR = 0.5;
const FIELDS: (keyof LeadData)[] = ['name', 'company', 'email', 'plan'];
const PROMPTS: Record<keyof LeadData, string> = {
  name: 'Great! To prepare your contract, what is your full name?',
  company: 'Thanks. What is your company name?',
  email: 'What e-mail should receive the contract?',
  plan: 'Which plan do you want: Starter or Pro?',
};

export class Orchestrator {
  constructor(private llm: LLM, private crm: Crm, private payments: PaymentProvider) {}

  private log(c: Conversation, type: 'handoff' | 'escalation' | 'tool', detail: string) {
    c.trace.push({ at: new Date().toISOString(), type, detail });
  }

  private handoff(c: Conversation, from: Role, to: Role, state: State) {
    c.state = state;
    this.log(c, 'handoff', `${from} -> ${to}`);
  }

  private escalate(c: Conversation, role: Role, reason: string): Reply[] {
    c.state = 'human';
    this.log(c, 'escalation', `${role}: ${reason}`);
    return [{ from: role, text: 'I want to get this right, so a team member will take over this conversation shortly.' }];
  }

  async handle(c: Conversation, text: string): Promise<Reply[]> {
    c.messages.push({ from: 'contact', text, at: new Date().toISOString() });
    const replies = await this.route(c, text);
    for (const r of replies) c.messages.push({ from: r.from, text: r.text, at: new Date().toISOString() });
    return replies;
  }

  private async route(c: Conversation, text: string): Promise<Reply[]> {
    if (c.state === 'human') return []; // a person owns the conversation now
    // Existing customers always go to support, never to sales.
    if (c.contact.isCustomer || this.crm.isCustomer(c.contact.phone)) {
      if (c.state !== 'support') this.handoff(c, 'sales', 'support', 'support');
      return this.answer(c, 'support', text);
    }
    if (c.state === 'collecting') return this.collect(c, text);
    if (c.state === 'contract_sent') return [{ from: 'sales', text: 'Your contract and payment link were sent. Tell me if you need anything else.' }];

    const u = await this.llm.understand(text, { state: c.state });
    if (u.confidence < CONFIDENCE_FLOOR) return this.escalate(c, 'sales', `low confidence (${u.confidence})`);
    if (u.intent === 'purchase') {
      this.handoff(c, 'sales', 'sales', 'collecting');
      return [{ from: 'sales', text: PROMPTS[FIELDS[0]] }];
    }
    return [{ from: 'sales', text: u.answer ?? 'Happy to help. What would you like to know?' }];
  }

  private async answer(c: Conversation, role: Role, text: string): Promise<Reply[]> {
    const u = await this.llm.understand(text, { state: c.state });
    if (u.confidence < CONFIDENCE_FLOOR || !u.answer) return this.escalate(c, role, `low confidence (${u.confidence})`);
    return [{ from: role, text: u.answer }];
  }

  private async collect(c: Conversation, text: string): Promise<Reply[]> {
    const field = FIELDS.find((f) => !c.lead[f])!;
    const value = text.trim();
    if (field === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      return [{ from: 'sales', text: 'That e-mail looks invalid. Could you check it?' }];
    }
    if (field === 'plan' && !/^(starter|pro)$/i.test(value)) {
      return [{ from: 'sales', text: 'Please answer Starter or Pro.' }];
    }
    c.lead[field] = field === 'plan' ? value[0].toUpperCase() + value.slice(1).toLowerCase() : value;

    const next = FIELDS.find((f) => !c.lead[f]);
    if (next) return [{ from: 'sales', text: PROMPTS[next] }];

    // Data complete: sales -> legal -> finance -> legal sends the contract.
    this.handoff(c, 'sales', 'legal', 'collecting');
    const contract = buildContract(c.lead);
    this.handoff(c, 'legal', 'finance', 'collecting');
    const link = await this.payments.createLink(c.lead);
    this.log(c, 'tool', `finance.createPaymentLink -> ${link}`);
    this.handoff(c, 'finance', 'legal', 'contract_sent');
    return [
      { from: 'sales', text: 'Thank you! I passed your details to our legal team.' },
      { from: 'legal', text: `${contract}\n\nPayment link: ${link}` },
    ];
  }
}
