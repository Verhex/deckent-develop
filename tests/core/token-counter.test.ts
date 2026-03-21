import { describe, it, expect, beforeEach } from 'vitest';
import { TokenCounter } from '../../src/core/token-counter.js';
import type { ModelName, BudgetWarning } from '../../src/core/token-counter.js';

describe('TokenCounter', () => {
  let counter: TokenCounter;

  beforeEach(() => {
    counter = new TokenCounter();
  });

  // ─── countTokens ──────────────────────────────────────────────

  it('estimates tokens from text using words/0.75', () => {
    // "hello world" = 2 words, 2/0.75 = 2.67, ceil = 3
    expect(counter.countTokens('hello world')).toBe(3);
  });

  it('returns 0 for empty string', () => {
    expect(counter.countTokens('')).toBe(0);
  });

  it('returns 0 for null/undefined input', () => {
    expect(counter.countTokens(null as unknown as string)).toBe(0);
    expect(counter.countTokens(undefined as unknown as string)).toBe(0);
  });

  it('returns 0 for whitespace-only string', () => {
    expect(counter.countTokens('   ')).toBe(0);
  });

  it('handles multi-word text correctly', () => {
    // 10 words -> 10/0.75 = 13.33 -> 14
    const text = 'one two three four five six seven eight nine ten';
    expect(counter.countTokens(text)).toBe(14);
  });

  it('handles text with extra whitespace', () => {
    const text = '  hello   world  ';
    expect(counter.countTokens(text)).toBe(3); // 2 words
  });

  // ─── estimatePromptSize ────────────────────────────────────────

  it('estimates full prompt size', () => {
    const estimate = counter.estimatePromptSize(
      'You are a coding agent',     // ~5 words
      ['Use TypeScript patterns'],   // ~3 words
      'Add login page with OAuth',  // ~5 words
      'opus',
    );
    expect(estimate.agentTokens).toBeGreaterThan(0);
    expect(estimate.skillTokens).toBeGreaterThan(0);
    expect(estimate.taskTokens).toBeGreaterThan(0);
    expect(estimate.totalTokens).toBe(estimate.agentTokens + estimate.skillTokens + estimate.taskTokens);
    expect(estimate.model).toBe('opus');
    expect(estimate.withinBudget).toBe(true);
  });

  it('handles empty skills array', () => {
    const estimate = counter.estimatePromptSize('agent', [], 'task', 'sonnet');
    expect(estimate.skillTokens).toBe(0);
  });

  it('combines multiple skills', () => {
    const estimate = counter.estimatePromptSize(
      'agent',
      ['skill one content', 'skill two content'],
      'task',
      'haiku',
    );
    expect(estimate.skillTokens).toBeGreaterThan(0);
  });

  it('detects when exceeding budget', () => {
    const tinyBudget = new TokenCounter({ opus: 5 });
    const estimate = tinyBudget.estimatePromptSize(
      'This is a very long agent prompt with many words that will exceed the budget',
      [],
      'task',
      'opus',
    );
    expect(estimate.withinBudget).toBe(false);
  });

  // ─── isWithinBudget ────────────────────────────────────────────

  it('returns true when within budget', () => {
    expect(counter.isWithinBudget(100, 'opus')).toBe(true);
  });

  it('returns true at exact budget', () => {
    expect(counter.isWithinBudget(200000, 'opus')).toBe(true);
  });

  it('returns false when exceeding budget', () => {
    expect(counter.isWithinBudget(200001, 'opus')).toBe(false);
  });

  // ─── warnIfExceeding ──────────────────────────────────────────

  it('returns null when within budget', () => {
    expect(counter.warnIfExceeding(100, 'opus')).toBeNull();
  });

  it('returns warning when exceeding budget', () => {
    const warning = counter.warnIfExceeding(250000, 'opus');
    expect(warning).not.toBeNull();
    expect(warning!.model).toBe('opus');
    expect(warning!.estimated).toBe(250000);
    expect(warning!.budget).toBe(200000);
    expect(warning!.overBy).toBe(50000);
    expect(warning!.percentOver).toBe(25);
  });

  // ─── formatWarning ────────────────────────────────────────────

  it('formats warning message', () => {
    const warning: BudgetWarning = {
      model: 'opus' as ModelName,
      estimated: 250000,
      budget: 200000,
      overBy: 50000,
      percentOver: 25,
    };
    const msg = counter.formatWarning(warning);
    expect(msg).toContain('opus');
    expect(msg).toContain('250000');
    expect(msg).toContain('200000');
    expect(msg).toContain('25%');
  });

  // ─── getBudget / setBudget ─────────────────────────────────────

  it('gets default budget', () => {
    expect(counter.getBudget('opus')).toBe(200000);
    expect(counter.getBudget('sonnet')).toBe(200000);
    expect(counter.getBudget('haiku')).toBe(200000);
  });

  it('sets custom budget', () => {
    counter.setBudget('haiku', 50000);
    expect(counter.getBudget('haiku')).toBe(50000);
  });

  it('custom budgets affect isWithinBudget', () => {
    counter.setBudget('haiku', 100);
    expect(counter.isWithinBudget(150, 'haiku')).toBe(false);
  });

  // ─── Constructor custom budgets ────────────────────────────────

  it('accepts custom budgets in constructor', () => {
    const custom = new TokenCounter({ opus: 1000, sonnet: 500 });
    expect(custom.getBudget('opus')).toBe(1000);
    expect(custom.getBudget('sonnet')).toBe(500);
    expect(custom.getBudget('haiku')).toBe(200000); // default
  });
});
