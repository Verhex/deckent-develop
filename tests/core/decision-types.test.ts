import { describe, it, expect } from 'vitest';
import {
  createDefaultAnalysis,
  isValidTaskType,
  createDecisionLogEntry,
} from '../../src/core/decision-types.js';
import type {
  TaskType,
  TaskAnalysis,
  DecisionLogEntry,
  DecisionResult,
  DecisionContext,
} from '../../src/core/decision-types.js';

// ─── createDefaultAnalysis ─────────────────────────────────────────────────

describe('createDefaultAnalysis', () => {
  it('returns a TaskAnalysis with type code', () => {
    const analysis = createDefaultAnalysis();
    expect(analysis.type).toBe('code');
  });

  it('returns complexity 0', () => {
    const analysis = createDefaultAnalysis();
    expect(analysis.complexity).toBe(0);
  });

  it('returns empty keywords', () => {
    const analysis = createDefaultAnalysis();
    expect(analysis.keywords).toEqual([]);
  });

  it('returns scopeWeight 0', () => {
    const analysis = createDefaultAnalysis();
    expect(analysis.scopeWeight).toBe(0);
  });

  it('returns estimatedDurationMs 0', () => {
    const analysis = createDefaultAnalysis();
    expect(analysis.estimatedDurationMs).toBe(0);
  });

  it('returns a new object on every call', () => {
    const a = createDefaultAnalysis();
    const b = createDefaultAnalysis();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('keywords array is independently mutable', () => {
    const a = createDefaultAnalysis();
    a.keywords.push('test');
    const b = createDefaultAnalysis();
    expect(b.keywords).toEqual([]);
  });
});

// ─── isValidTaskType ───────────────────────────────────────────────────────

describe('isValidTaskType', () => {
  it('returns true for code', () => {
    expect(isValidTaskType('code')).toBe(true);
  });

  it('returns true for test', () => {
    expect(isValidTaskType('test')).toBe(true);
  });

  it('returns true for doc', () => {
    expect(isValidTaskType('doc')).toBe(true);
  });

  it('returns true for security', () => {
    expect(isValidTaskType('security')).toBe(true);
  });

  it('returns true for refactor', () => {
    expect(isValidTaskType('refactor')).toBe(true);
  });

  it('returns true for devops', () => {
    expect(isValidTaskType('devops')).toBe(true);
  });

  it('returns true for config', () => {
    expect(isValidTaskType('config')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isValidTaskType('')).toBe(false);
  });

  it('returns false for unknown type', () => {
    expect(isValidTaskType('unknown')).toBe(false);
  });

  it('returns false for uppercase CODE', () => {
    expect(isValidTaskType('CODE')).toBe(false);
  });

  it('returns false for number as string', () => {
    expect(isValidTaskType('123')).toBe(false);
  });
});

// ─── createDecisionLogEntry ────────────────────────────────────────────────

describe('createDecisionLogEntry', () => {
  it('creates entry with given step number', () => {
    const entry = createDecisionLogEntry(1, 'Test', 'reason');
    expect(entry.step).toBe(1);
  });

  it('creates entry with given name', () => {
    const entry = createDecisionLogEntry(2, 'AgentSelection', 'matched');
    expect(entry.name).toBe('AgentSelection');
  });

  it('creates entry with given reasoning', () => {
    const entry = createDecisionLogEntry(3, 'Skill', 'Found vitest skill');
    expect(entry.reasoning).toBe('Found vitest skill');
  });

  it('defaults input to empty object', () => {
    const entry = createDecisionLogEntry(1, 'A', 'B');
    expect(entry.input).toEqual({});
  });

  it('defaults output to empty object', () => {
    const entry = createDecisionLogEntry(1, 'A', 'B');
    expect(entry.output).toEqual({});
  });

  it('defaults durationMs to 0', () => {
    const entry = createDecisionLogEntry(1, 'A', 'B');
    expect(entry.durationMs).toBe(0);
  });

  it('returns a new object each time', () => {
    const a = createDecisionLogEntry(1, 'A', 'B');
    const b = createDecisionLogEntry(1, 'A', 'B');
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('input object is independently mutable', () => {
    const entry = createDecisionLogEntry(1, 'A', 'B');
    entry.input['key'] = 'value';
    const entry2 = createDecisionLogEntry(1, 'A', 'B');
    expect(entry2.input).toEqual({});
  });

  it('supports step numbers 1 through 6', () => {
    for (let s = 1; s <= 6; s++) {
      const entry = createDecisionLogEntry(s, `Step${s}`, `reason${s}`);
      expect(entry.step).toBe(s);
    }
  });
});

// ─── TaskAnalysis interface ────────────────────────────────────────────────

describe('TaskAnalysis interface', () => {
  it('supports all TaskType values', () => {
    const types: TaskType[] = ['code', 'test', 'doc', 'security', 'refactor', 'devops', 'config'];
    for (const t of types) {
      const analysis: TaskAnalysis = {
        type: t,
        complexity: 5,
        keywords: ['keyword'],
        scopeWeight: 10,
        estimatedDurationMs: 300000,
      };
      expect(analysis.type).toBe(t);
    }
  });

  it('allows complexity range 0-10', () => {
    const low: TaskAnalysis = { ...createDefaultAnalysis(), complexity: 0 };
    const high: TaskAnalysis = { ...createDefaultAnalysis(), complexity: 10 };
    expect(low.complexity).toBe(0);
    expect(high.complexity).toBe(10);
  });
});

// ─── DecisionLogEntry interface ────────────────────────────────────────────

describe('DecisionLogEntry interface', () => {
  it('allows arbitrary input/output records', () => {
    const entry: DecisionLogEntry = {
      step: 1,
      name: 'Test',
      input: { title: 'foo', nested: { a: 1 } },
      output: { model: 'opus', score: 7 },
      durationMs: 15,
      reasoning: 'matched keywords',
    };
    expect(entry.input['title']).toBe('foo');
    expect(entry.output['model']).toBe('opus');
  });
});

// ─── DecisionResult interface ──────────────────────────────────────────────

describe('DecisionResult interface', () => {
  it('can hold null agent', () => {
    const result: DecisionResult = {
      analysis: createDefaultAnalysis(),
      agent: null,
      skills: [],
      model: 'sonnet',
      effort: 'normal',
      scope: { directories: [], filesRead: [], filesWrite: [] },
      decisionLog: [],
    };
    expect(result.agent).toBeNull();
  });

  it('can hold populated fields', () => {
    const result: DecisionResult = {
      analysis: { ...createDefaultAnalysis(), type: 'test', complexity: 7 },
      agent: null,
      skills: [],
      model: 'opus',
      effort: 'high',
      scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/a.ts'] },
      decisionLog: [createDecisionLogEntry(1, 'A', 'B')],
    };
    expect(result.model).toBe('opus');
    expect(result.decisionLog).toHaveLength(1);
  });
});
