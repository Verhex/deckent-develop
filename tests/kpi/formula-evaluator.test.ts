import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluateFormula, FormulaError } from '../../src/core/kpi/formula-evaluator.js';

// Representative measure map used across the arithmetic tests.
const M = {
  cost: 10,
  lines: 5000,
  tasks_done: 8,
  tasks_total: 10,
  no_go: 0,
  zero: 0,
} as const;

// ─── Basic arithmetic ──────────────────────────────────────────────────────────

describe('evaluateFormula — arithmetic', () => {
  it('evaluates the four operators', () => {
    expect(evaluateFormula('2 + 3', {})).toBe(5);
    expect(evaluateFormula('10 - 4', {})).toBe(6);
    expect(evaluateFormula('3 * 4', {})).toBe(12);
    expect(evaluateFormula('12 / 4', {})).toBe(3);
  });

  it('parses decimal literals', () => {
    expect(evaluateFormula('1.5 + 2.5', {})).toBe(4);
    expect(evaluateFormula('10 / 2.5', {})).toBe(4);
  });

  it('ignores arbitrary whitespace', () => {
    expect(evaluateFormula('  2\t+\n3 ', {})).toBe(5);
  });
});

// ─── Operator precedence & associativity ────────────────────────────────────────

describe('evaluateFormula — precedence', () => {
  it('multiplies before adding', () => {
    expect(evaluateFormula('2 + 3 * 4', {})).toBe(14);
    expect(evaluateFormula('2 * 3 + 4', {})).toBe(10);
  });

  it('honours parentheses over default precedence', () => {
    expect(evaluateFormula('(2 + 3) * 4', {})).toBe(20);
    expect(evaluateFormula('2 * (3 + 4)', {})).toBe(14);
  });

  it('left-associates subtraction and division', () => {
    expect(evaluateFormula('10 - 3 - 2', {})).toBe(5);
    expect(evaluateFormula('100 / 5 / 2', {})).toBe(10);
  });
});

// ─── Measure identifiers (the real use case) ────────────────────────────────────

describe('evaluateFormula — measures', () => {
  it('resolves a simple a/b ratio', () => {
    expect(evaluateFormula('tasks_done / tasks_total', M)).toBe(0.8);
  });

  it('resolves a parenthesised ratio', () => {
    expect(evaluateFormula('(tasks_done) / (tasks_total)', M)).toBe(0.8);
  });

  it('resolves the nested cost/(lines/1000) KLoC formula', () => {
    // 10 / (5000 / 1000) = 10 / 5 = 2
    expect(evaluateFormula('cost / (lines / 1000)', M)).toBe(2);
  });

  it('treats 0-valued measures as legitimate zeros', () => {
    expect(evaluateFormula('no_go + tasks_done', M)).toBe(8);
  });
});

// ─── Unary minus ────────────────────────────────────────────────────────────────

describe('evaluateFormula — unary minus', () => {
  it('negates literals and identifiers', () => {
    expect(evaluateFormula('-5', {})).toBe(-5);
    expect(evaluateFormula('-cost', M)).toBe(-10);
  });

  it('applies inside terms and parentheses', () => {
    expect(evaluateFormula('2 * -3', {})).toBe(-6);
    expect(evaluateFormula('-(2 + 3)', {})).toBe(-5);
  });

  it('supports doubled unary minus', () => {
    expect(evaluateFormula('--5', {})).toBe(5);
  });
});

// ─── Division-by-zero → null (+ null propagation) ───────────────────────────────

describe('evaluateFormula — division by zero', () => {
  it('returns null on direct division by zero', () => {
    expect(evaluateFormula('cost / 0', M)).toBeNull();
    expect(evaluateFormula('cost / zero', M)).toBeNull();
  });

  it('returns null when a denominator expression evaluates to zero', () => {
    expect(evaluateFormula('cost / (no_go)', M)).toBeNull();
    expect(evaluateFormula('1 / (cost - cost)', M)).toBeNull();
  });

  it('propagates null through every surrounding operator', () => {
    expect(evaluateFormula('(cost / 0) + 5', M)).toBeNull();
    expect(evaluateFormula('5 + (cost / 0)', M)).toBeNull();
    expect(evaluateFormula('2 * (3 / 0)', {})).toBeNull();
    expect(evaluateFormula('-(1 / 0)', {})).toBeNull();
    expect(evaluateFormula('(1 / 0) / 5', {})).toBeNull();
  });

  it('does NOT treat a zero numerator as no-data', () => {
    expect(evaluateFormula('0 / 5', {})).toBe(0);
    expect(evaluateFormula('no_go / tasks_total', M)).toBe(0);
  });
});

// ─── Unknown identifiers ────────────────────────────────────────────────────────

describe('evaluateFormula — unknown identifiers', () => {
  it('throws FormulaError for an identifier absent from the map', () => {
    expect(() => evaluateFormula('unknown_measure', M)).toThrow(FormulaError);
    expect(() => evaluateFormula('cost + missing', M)).toThrow(/Unknown identifier 'missing'/);
  });

  it('throws when a whitelisted measure carries a non-finite value', () => {
    expect(() => evaluateFormula('x', { x: Number.NaN })).toThrow(FormulaError);
    expect(() => evaluateFormula('x', { x: Number.POSITIVE_INFINITY })).toThrow(FormulaError);
  });
});

// ─── Sandbox: prototype / whitelist-bypass attempts ─────────────────────────────

describe('evaluateFormula — sandbox (prototype escape)', () => {
  // These are OWN-property checks: inherited Object.prototype members must NOT
  // be reachable through an identifier, or the whitelist would be bypassable.
  const escapes = ['constructor', '__proto__', 'prototype', 'toString', 'valueOf', 'hasOwnProperty'];

  for (const name of escapes) {
    it(`rejects inherited member '${name}' as unknown identifier`, () => {
      expect(() => evaluateFormula(name, M)).toThrow(FormulaError);
    });
  }

  it('does not leak a function value for constructor', () => {
    // If the `in` operator (or truthiness) were used, this would resolve to the
    // Object constructor function and corrupt evaluation instead of throwing.
    let result: unknown;
    expect(() => {
      result = evaluateFormula('constructor', {});
    }).toThrow(FormulaError);
    expect(result).toBeUndefined();
  });
});

// ─── Sandbox: disallowed constructs (calls, member access, indexing, code) ───────

describe('evaluateFormula — sandbox (disallowed constructs)', () => {
  it('rejects function-call syntax', () => {
    expect(() => evaluateFormula('ratio(a, b)', M)).toThrow(FormulaError);
    // Even when the callee IS a known measure, the trailing '(' is rejected.
    expect(() => evaluateFormula('cost(lines)', M)).toThrow(FormulaError);
  });

  it('rejects member access', () => {
    expect(() => evaluateFormula('cost.toFixed', M)).toThrow(FormulaError);
    expect(() => evaluateFormula('a.b', M)).toThrow(FormulaError);
  });

  it('rejects process.exit(1) and other host-escape attempts', () => {
    expect(() => evaluateFormula('process.exit(1)', M)).toThrow(FormulaError);
    expect(() => evaluateFormula('global.process', M)).toThrow(FormulaError);
    expect(() => evaluateFormula('require("fs")', M)).toThrow(FormulaError);
  });

  it('rejects indexing', () => {
    expect(() => evaluateFormula('cost[0]', M)).toThrow(FormulaError);
    expect(() => evaluateFormula('a["b"]', M)).toThrow(FormulaError);
  });

  it('rejects unsupported operators and characters', () => {
    for (const f of ['2 % 3', '2 ^ 3', 'a & b', 'a | b', '2 ** 3', 'a = b', 'a, b', 'a ? b : c']) {
      expect(() => evaluateFormula(f, M)).toThrow(FormulaError);
    }
  });
});

// ─── Syntax errors ──────────────────────────────────────────────────────────────

describe('evaluateFormula — syntax errors', () => {
  it('rejects an empty or whitespace-only formula', () => {
    expect(() => evaluateFormula('', {})).toThrow(FormulaError);
    expect(() => evaluateFormula('   ', {})).toThrow(FormulaError);
  });

  it('rejects trailing tokens', () => {
    expect(() => evaluateFormula('2 3', {})).toThrow(/trailing token/i);
    expect(() => evaluateFormula('cost lines', M)).toThrow(FormulaError);
    expect(() => evaluateFormula('(2 + 3) 4', {})).toThrow(FormulaError);
  });

  it('rejects dangling operators', () => {
    expect(() => evaluateFormula('2 +', {})).toThrow(FormulaError);
    expect(() => evaluateFormula('* 3', {})).toThrow(FormulaError);
  });

  it('rejects unbalanced parentheses', () => {
    expect(() => evaluateFormula('(2 + 3', {})).toThrow(FormulaError);
    expect(() => evaluateFormula('2 + 3)', {})).toThrow(FormulaError);
    expect(() => evaluateFormula('()', {})).toThrow(FormulaError);
  });
});

// ─── FormulaError contract ──────────────────────────────────────────────────────

describe('FormulaError', () => {
  it('is an Error with a stable code and name', () => {
    const err = new FormulaError('boom');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(FormulaError);
    expect(err.code).toBe('FORMULA_ERROR');
    expect(err.name).toBe('FormulaError');
    expect(err.message).toBe('boom');
  });

  it('thrown errors are catchable as FormulaError', () => {
    try {
      evaluateFormula('process.exit(1)', {});
      expect.fail('expected FormulaError');
    } catch (err) {
      expect(err).toBeInstanceOf(FormulaError);
      expect((err as FormulaError).code).toBe('FORMULA_ERROR');
    }
  });
});

// ─── Security regression: no dynamic-code primitives in the source ───────────────

describe('formula-evaluator source (security regression)', () => {
  it('contains no eval / Function / new Function call sites', () => {
    const srcPath = fileURLToPath(
      new URL('../../src/core/kpi/formula-evaluator.ts', import.meta.url),
    );
    const source = readFileSync(srcPath, 'utf8');
    // Strip comments first: the module documents its own security model in
    // prose (it explicitly names eval/Function), so we scan only executable
    // code for actual call sites of the disallowed dynamic-code primitives.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '') // block / JSDoc comments
      .replace(/\/\/[^\n]*/g, ''); // line comments
    // `evaluate(`/`evaluateFormula(` do not contain `eval(`, and `FormulaError`
    // does not contain `Function`, so these patterns have no false positives.
    expect(code).not.toMatch(/\beval\s*\(/);
    expect(code).not.toMatch(/\bnew\s+Function\b/);
    expect(code).not.toMatch(/\bFunction\s*\(/);
  });
});
