import { describe, it, expect } from 'vitest';
import { loadCases, makeLLM, runCases } from '../eval/run.js';
import { compare, summarize } from '../eval/metrics.js';

describe('eval harness', () => {
  it('the shipped mock model passes the whole dataset', async () => {
    const results = await runCases(loadCases(), makeLLM('mock'));
    const failed = results.filter((r) => !r.pass).map((r) => `${r.id}: ${r.failures.join('; ')}`);
    expect(failed).toEqual([]);
  });

  it('catches a hallucinating (overconfident) model: lower recall and a regression vs baseline', async () => {
    const cases = loadCases();
    const good = summarize(await runCases(cases, makeLLM('mock')));
    const bad = summarize(await runCases(cases, makeLLM('overconfident')));
    expect(bad.escalationRecall).toBeLessThan(good.escalationRecall);
    expect(bad.byTag['hallucination'].passed).toBeLessThan(good.byTag['hallucination'].passed);
    expect(compare(bad, good).length).toBeGreaterThan(0);
  });

  it('compare() tolerates equal scores', () => {
    const s = summarize([]);
    expect(compare(s, s)).toEqual([]);
  });
});
