import type { State } from './types.js';

export interface Understanding {
  intent: 'question' | 'purchase' | 'other';
  confidence: number; // 0..1
  answer?: string;
}

/** Any model provider plugs in here. Agents never talk to a vendor SDK directly. */
export interface LLM {
  understand(text: string, ctx: { state: State }): Promise<Understanding>;
}

const KNOWLEDGE: { keys: string[]; answer: string }[] = [
  { keys: ['how does', 'work'], answer: 'The platform adapts to your operation: AI agents answer customers, schedule and hand work to the right team.' },
  { keys: ['plan', 'price', 'cost'], answer: 'We offer Starter and Pro plans. Final pricing is confirmed in the contract.' },
  { keys: ['integrat', 'whatsapp', 'crm'], answer: 'It connects to WhatsApp and to your CRM through APIs.' },
  { keys: ['reset', 'password', 'error', 'help'], answer: 'I can help with that. Please describe what you see on screen.' },
];

/** Deterministic stand-in so the demo and the tests run offline. */
export class MockLLM implements LLM {
  async understand(text: string): Promise<Understanding> {
    const t = text.toLowerCase();
    if (/(buy|purchase|subscribe|sign up|contract|i want to hire|acquire)/.test(t)) {
      return { intent: 'purchase', confidence: 0.95 };
    }
    // Best match wins (most keywords hit), not first match: found by the eval harness (price question hit the generic entry).
    let best: { score: number; answer: string } | null = null;
    for (const k of KNOWLEDGE) {
      const score = k.keys.filter((w) => t.includes(w)).length;
      if (score > 0 && (!best || score > best.score)) best = { score, answer: k.answer };
    }
    if (best) return { intent: 'question', confidence: 0.8, answer: best.answer };
    return { intent: 'other', confidence: 0.2 };
  }
}

/**
 * Optional real adapter (UNTESTED here; needs ANTHROPIC_API_KEY). It asks the model to return JSON
 * and falls back to low confidence on any parse problem so the guardrail escalates to a human.
 */
export class AnthropicLLM implements LLM {
  constructor(private apiKey = process.env.ANTHROPIC_API_KEY ?? '', private model = process.env.LLM_MODEL ?? 'claude-sonnet-5-5') {}

  async understand(text: string, ctx: { state: State }): Promise<Understanding> {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 300,
          system: 'Classify the customer message. Reply ONLY with JSON: {"intent":"question|purchase|other","confidence":0..1,"answer":"short answer or empty"}.',
          messages: [{ role: 'user', content: `state=${ctx.state}\nmessage=${text}` }],
        }),
      });
      const data: any = await res.json();
      const parsed = JSON.parse(data?.content?.[0]?.text ?? '{}');
      return { intent: parsed.intent ?? 'other', confidence: Number(parsed.confidence ?? 0), answer: parsed.answer || undefined };
    } catch {
      return { intent: 'other', confidence: 0 };
    }
  }
}
