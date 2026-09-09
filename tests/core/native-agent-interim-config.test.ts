// tests/core/native-agent-interim-config.test.ts
// 7114 — execution_budget.native_agent interaction-flow keys: defaults,
// validation like every other native_agent field (positive safe integers,
// unknown keys loud), and the cadence invariant.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_NATIVE_AGENT_BUDGET, ExecutionBudgetPolicyError, resolveNativeAgentBudget,
} from '../../src/core/execution-budget-policy.js';

const resolve = (native_agent: Record<string, unknown>) =>
  resolveNativeAgentBudget({ policy: { roles: {}, native_agent } as never });

describe('execution_budget.native_agent — 7114 interaction-flow keys', () => {
  it('defaults: progress note every 5, interim answer after 12 calls / 90 000 ms, 200-char floor', () => {
    expect(DEFAULT_NATIVE_AGENT_BUDGET.progressNoteEveryToolCalls).toBe(5);
    expect(DEFAULT_NATIVE_AGENT_BUDGET.interimAnswerAfterToolCalls).toBe(12);
    expect(DEFAULT_NATIVE_AGENT_BUDGET.interimAnswerAfterMs).toBe(90_000);
    expect(DEFAULT_NATIVE_AGENT_BUDGET.interimAnswerMinChars).toBe(200);
    expect(resolveNativeAgentBudget({})).toBe(DEFAULT_NATIVE_AGENT_BUDGET);
  });

  it('owner overrides merge over the defaults', () => {
    const merged = resolve({ progressNoteEveryToolCalls: 3, interimAnswerAfterToolCalls: 6, interimAnswerAfterMs: 30_000, interimAnswerMinChars: 120 });
    expect(merged).toMatchObject({ progressNoteEveryToolCalls: 3, interimAnswerAfterToolCalls: 6, interimAnswerAfterMs: 30_000, interimAnswerMinChars: 120 });
    expect(merged.maxToolCalls).toBe(DEFAULT_NATIVE_AGENT_BUDGET.maxToolCalls);
    expect(Object.isFrozen(merged)).toBe(true);
  });

  it.each([
    ['progressNoteEveryToolCalls', 0],
    ['interimAnswerAfterToolCalls', -1],
    ['interimAnswerAfterMs', 1.5],
    ['interimAnswerMinChars', '200'],
  ])('rejects a non-positive / non-integer %s loudly', (field, value) => {
    expect(() => resolve({ [field]: value })).toThrow(ExecutionBudgetPolicyError);
    expect(() => resolve({ [field]: value })).toThrow(`execution_budget.native_agent.${field} must be a positive safe integer`);
  });

  it('rejects a progress-note cadence looser than the enforced deliverable bound', () => {
    expect(() => resolve({ progressNoteEveryToolCalls: 13 })).toThrow('progressNoteEveryToolCalls <= interimAnswerAfterToolCalls');
    expect(() => resolve({ interimAnswerAfterToolCalls: 4 })).toThrow('progressNoteEveryToolCalls <= interimAnswerAfterToolCalls');
    expect(resolve({ progressNoteEveryToolCalls: 4, interimAnswerAfterToolCalls: 4 }).interimAnswerAfterToolCalls).toBe(4);
  });

  it('a tighter session cap than the deliverable bound is legitimate (the budget terminates first)', () => {
    expect(resolve({ maxToolCalls: 10 }).interimAnswerAfterToolCalls).toBe(12);
    expect(resolve({ maxWallTimeMs: 60_000 }).interimAnswerAfterMs).toBe(90_000);
  });

  it('unknown keys next to the new ones still fail loudly', () => {
    expect(() => resolve({ interimAnswerAfterSec: 90 })).toThrow(ExecutionBudgetPolicyError);
  });
});
