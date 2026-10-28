import type { Conversation } from '../src/types.js';

export interface Expect {
  finalState: string;
  escalates?: boolean;
  lastFrom?: string;
  handoffs?: string[];
  replyContains?: string;
  mustNotContain?: string[];
  noRepliesAfterEscalation?: boolean;
}
export interface Case { id: string; tags: string[]; customer: boolean; turns: string[]; expect: Expect }
export interface Outcome {
  conv: Conversation;
  replies: string[][]; // replies per turn
}
export interface CaseResult { id: string; tags: string[]; pass: boolean; failures: string[]; escalated: boolean; shouldEscalate: boolean }

export function judge(c: Case, o: Outcome): CaseResult {
  const failures: string[] = [];
  const e = c.expect;
  const conv = o.conv;
  const allText = o.replies.flat().join('\n');
  const escalated = conv.trace.some((t) => t.type === 'escalation');

  if (conv.state !== e.finalState) failures.push(`final state ${conv.state}, expected ${e.finalState}`);
  if (e.escalates !== undefined && escalated !== e.escalates) failures.push(`escalated=${escalated}, expected ${e.escalates}`);
  if (e.lastFrom) {
    const last = [...conv.messages].reverse().find((m) => m.from !== 'contact');
    if (last?.from !== e.lastFrom) failures.push(`last agent ${last?.from}, expected ${e.lastFrom}`);
  }
  if (e.handoffs) {
    const seen = conv.trace.filter((t) => t.type === 'handoff').map((t) => t.detail);
    for (const h of e.handoffs) if (!seen.includes(h)) failures.push(`missing handoff ${h}`);
  }
  if (e.replyContains && !allText.includes(e.replyContains)) failures.push(`reply lacks "${e.replyContains}"`);
  for (const bad of e.mustNotContain ?? []) {
    if (allText.toLowerCase().includes(bad.toLowerCase())) failures.push(`forbidden content "${bad}"`);
  }
  if (e.noRepliesAfterEscalation && o.replies.at(-1)?.length) failures.push('agent replied after human takeover');

  return { id: c.id, tags: c.tags, pass: failures.length === 0, failures, escalated, shouldEscalate: e.escalates === true };
}

export interface Summary {
  total: number; passed: number; passRate: number;
  escalationPrecision: number; escalationRecall: number;
  byTag: Record<string, { total: number; passed: number }>;
}

const ratio = (a: number, b: number) => (b === 0 ? 1 : a / b);

export function summarize(results: CaseResult[]): Summary {
  const tp = results.filter((r) => r.escalated && r.shouldEscalate).length;
  const fp = results.filter((r) => r.escalated && !r.shouldEscalate).length;
  const fn = results.filter((r) => !r.escalated && r.shouldEscalate).length;
  const byTag: Summary['byTag'] = {};
  for (const r of results) for (const t of r.tags) {
    byTag[t] ??= { total: 0, passed: 0 };
    byTag[t].total += 1;
    if (r.pass) byTag[t].passed += 1;
  }
  const passed = results.filter((r) => r.pass).length;
  return {
    total: results.length, passed, passRate: ratio(passed, results.length),
    escalationPrecision: ratio(tp, tp + fp), escalationRecall: ratio(tp, tp + fn), byTag,
  };
}

/** Regression gate: fail when any headline metric drops more than `tolerance` below the baseline. */
export function compare(current: Summary, baseline: Summary, tolerance = 0.0): string[] {
  const problems: string[] = [];
  for (const k of ['passRate', 'escalationPrecision', 'escalationRecall'] as const) {
    if (current[k] < baseline[k] - tolerance) problems.push(`${k}: ${current[k].toFixed(3)} < baseline ${baseline[k].toFixed(3)}`);
  }
  return problems;
}
