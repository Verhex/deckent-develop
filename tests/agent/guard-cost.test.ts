// tests/agent/guard-cost.test.ts
import { describe, it, expect } from 'vitest';
import { createCostGuard, accrue, costExceeded, COST_GATE_EXCEEDED } from '../../src/agent/guards/cost.js';

describe('cost guard', () => {
  it('accrues tokens across turns and reports spentUsd', () => {
    const g = createCostGuard({ usdPerMillionTokens: 10 }); // $10 / 1M tokens
    accrue(g, { inputTokens: 400_000, outputTokens: 100_000 });
    accrue(g, { inputTokens: 0, outputTokens: 500_000 });
    expect(g.spentTokens).toBe(1_000_000);
    expect(costExceeded(g).spentUsd).toBeCloseTo(10, 5);
  });
  it('does not trip when no ceiling is set (advisory-only default)', () => {
    const g = createCostGuard({ usdPerMillionTokens: 10 });
    accrue(g, { inputTokens: 10_000_000, outputTokens: 0 });
    expect(costExceeded(g).exceeded).toBe(false);
  });
  it('trips with the COST_GATE_EXCEEDED reason once a hard ceiling is crossed', () => {
    const g = createCostGuard({ usdPerMillionTokens: 10, ceilingUsd: 5 });
    accrue(g, { inputTokens: 600_000, outputTokens: 0 }); // $6 > $5
    const r = costExceeded(g);
    expect(r.exceeded).toBe(true);
    expect(r.reason).toBe(COST_GATE_EXCEEDED);
  });
});
