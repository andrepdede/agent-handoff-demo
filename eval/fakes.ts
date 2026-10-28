import type { LLM, Understanding } from '../src/llm.js';
import { MockLLM } from '../src/llm.js';

/** A deliberately bad model: always confident and always "answers". Used to prove the harness catches hallucination. */
export class OverconfidentLLM implements LLM {
  private base = new MockLLM();
  async understand(text: string, ctx: { state: any }): Promise<Understanding> {
    const u = await this.base.understand(text);
    if (u.intent === 'other') return { intent: 'question', confidence: 0.99, answer: 'Yes, we support that and guarantee it.' };
    return u;
  }
}
