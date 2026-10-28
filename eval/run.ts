import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Orchestrator } from '../src/orchestrator.js';
import { AnthropicLLM, MockLLM, type LLM } from '../src/llm.js';
import { FakePayments, InMemoryCrm } from '../src/tools.js';
import type { Conversation } from '../src/types.js';
import { compare, judge, summarize, type Case, type CaseResult, type Summary } from './metrics.js';
import { OverconfidentLLM } from './fakes.js';

const here = dirname(fileURLToPath(import.meta.url));

export function loadCases(path = join(here, 'dataset.jsonl')): Case[] {
  return readFileSync(path, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

export function makeLLM(name: string): LLM {
  if (name === 'anthropic') return new AnthropicLLM(); // untested here: needs ANTHROPIC_API_KEY
  if (name === 'overconfident') return new OverconfidentLLM();
  return new MockLLM();
}

export async function runCases(cases: Case[], llm: LLM): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  for (const c of cases) {
    const phone = `eval-${c.id}`;
    const orch = new Orchestrator(llm, new InMemoryCrm(c.customer ? new Set([phone]) : new Set()), new FakePayments());
    const conv: Conversation = { id: phone, contact: { phone, isCustomer: c.customer }, state: 'sales', lead: {}, messages: [], trace: [] };
    const replies: string[][] = [];
    for (const t of c.turns) replies.push((await orch.handle(conv, t)).map((r) => r.text));
    results.push(judge(c, { conv, replies }));
  }
  return results;
}

export function report(llmName: string, results: CaseResult[], s: Summary): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const lines = [
    `# Agent eval report`, '',
    `Model adapter: \`${llmName}\` | cases: ${s.total} | passed: ${s.passed} (${pct(s.passRate)})`, '',
    `- Escalation precision: ${pct(s.escalationPrecision)} (escalated only when it should)`,
    `- Escalation recall: ${pct(s.escalationRecall)} (escalated every time it should; low recall = hallucination risk)`, '',
    `## By tag`, '', '| tag | passed | total |', '|---|---|---|',
    ...Object.entries(s.byTag).sort().map(([t, v]) => `| ${t} | ${v.passed} | ${v.total} |`), '',
    `## Failures`, '',
    ...(results.filter((r) => !r.pass).map((r) => `- **${r.id}**: ${r.failures.join('; ')}`)),
  ];
  if (!results.some((r) => !r.pass)) lines.push('_none_');
  return lines.join('\n') + '\n';
}

async function main() {
  const llmName = process.env.EVAL_LLM ?? 'mock';
  const cases = loadCases();
  const results = await runCases(cases, makeLLM(llmName));
  const s = summarize(results);
  writeFileSync(join(here, 'results.json'), JSON.stringify({ llm: llmName, summary: s, results }, null, 2));
  writeFileSync(join(here, 'report.md'), report(llmName, results, s));
  console.log(report(llmName, results, s));

  const basePath = join(here, 'baseline.json');
  if (process.argv.includes('--update-baseline')) {
    writeFileSync(basePath, JSON.stringify(s, null, 2));
    console.log('baseline updated');
    return;
  }
  if (existsSync(basePath)) {
    const problems = compare(s, JSON.parse(readFileSync(basePath, 'utf8')));
    if (problems.length) { console.error('REGRESSION vs baseline:\n' + problems.join('\n')); process.exit(1); }
    console.log('no regression vs baseline');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) void main();
