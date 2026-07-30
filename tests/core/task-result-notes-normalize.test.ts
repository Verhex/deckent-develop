/**
 * tests/core/task-result-notes-normalize.test.ts — born-484 regression contract
 *
 * born-484 (sprint-365 "1/1" + sprint-366 "0/0" live cases, 2026-07-03): the
 * FIRST real codex-CLI worker results carried `notes` as a STRING ARRAY
 * (`["docImpact: none", ...]`) while the legacy TaskResult contract says
 * `notes: string`. `isVerificationTask()`'s `(result.notes ?? '').toLowerCase()`
 * passed the array through `??` and threw TypeError, which escaped
 * evaluateWithRubric → truncated runEvaluatePhase's task loop → the sprint
 * closed with 0/1 evaluations while all workers had delivered.
 *
 * Contract under test:
 *   1. coerceNotesToString — any worker-shaped `notes` collapses to a string.
 *   2. normalizeTaskResultShape — disk-read boundary normalizer (applied at
 *      every readJsonSafe<TaskResult> site).
 *   3. evaluateWithRubric / isVerificationTask no longer throw on array notes
 *      even when a result bypasses the boundary (belt + braces).
 */

import { describe, it, expect } from 'vitest';
import {
  coerceNotesToString,
  normalizeTaskResultShape,
} from '../../src/core/task-result-schema.js';
import { evaluateWithRubric, isVerificationTask } from '../../src/orchestra/result-evaluator.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';

function makeTask(): Task {
  return {
    id: '366-001',
    title: 'CODEX-V6 — kesin-sınav',
    description: 'verification of the provider chain — no code changes expected',
    model: 'gpt-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['docs/analysis/'], filesRead: [], filesWrite: ['docs/analysis/codex-v6.md'] },
    dependencies: [],
    goNogo: { goCriteria: 'doc exists', noGoCriteria: 'code', techDebtAcceptable: 'minor' },
    status: TaskStatus.EXECUTING,
    sprintId: 'sprint-366',
  } as unknown as Task;
}

/** Mirrors the live 366-001 codex result: notes is a string ARRAY. */
function makeCodexResult(): TaskResult {
  return {
    taskId: '366-001',
    workerId: 'w-366-001',
    filesChanged: ['docs/analysis/codex-v6.md'],
    linesAdded: 40,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 0,
    selfAssessment: 'DONE',
    notes: [
      'docImpact: none',
      'No source code files were modified.',
    ] as unknown as string,
  };
}

describe('coerceNotesToString (born-484)', () => {
  it('passes a plain string through unchanged', () => {
    expect(coerceNotesToString('hello')).toBe('hello');
  });

  it('joins a string array with newlines (live codex shape)', () => {
    expect(coerceNotesToString(['a', 'b'])).toBe('a\nb');
  });

  it('JSON-stringifies non-string array elements', () => {
    expect(coerceNotesToString(['a', { k: 1 }])).toBe('a\n{"k":1}');
  });

  it('collapses null/undefined to empty string', () => {
    expect(coerceNotesToString(null)).toBe('');
    expect(coerceNotesToString(undefined)).toBe('');
  });

  it('JSON-stringifies a plain object', () => {
    expect(coerceNotesToString({ docImpact: 'none' })).toBe('{"docImpact":"none"}');
  });
});

describe('normalizeTaskResultShape (disk-read boundary)', () => {
  it('returns null unchanged (readJsonSafe miss passthrough)', () => {
    expect(normalizeTaskResultShape(null)).toBeNull();
  });

  it('coerces array notes to a string in place', () => {
    const r = makeCodexResult();
    const n = normalizeTaskResultShape(r);
    expect(n).not.toBeNull();
    expect(typeof n!.notes).toBe('string');
    expect(n!.notes).toContain('docImpact: none');
  });

  it('leaves an already-string notes untouched', () => {
    const r = { ...makeCodexResult(), notes: 'plain' };
    expect(normalizeTaskResultShape(r)!.notes).toBe('plain');
  });

  it('preserves legacy command arrays and restores a DONE boolean claim', () => {
    const r = {
      ...makeCodexResult(),
      testsPassed: ['node example.ts', 'test -f README.md'] as unknown as boolean,
    };
    const normalized = normalizeTaskResultShape(r)!;
    expect(normalized.testsPassed).toBe(true);
    expect((normalized as TaskResult).testCommands).toEqual([
      'node example.ts',
      'test -f README.md',
    ]);
  });

  it('maps a legacy command array to false when the worker reported NO_GO', () => {
    const r = {
      ...makeCodexResult(),
      testsPassed: ['node example.ts'] as unknown as boolean,
      selfAssessment: 'NO_GO' as const,
    };
    expect(normalizeTaskResultShape(r)!.testsPassed).toBe(false);
  });
});

describe('evaluator belt-and-braces (in-memory array notes must not throw)', () => {
  it('isVerificationTask tolerates array notes', () => {
    expect(() => isVerificationTask(makeTask(), makeCodexResult())).not.toThrow();
  });

  it('evaluateWithRubric returns a decision instead of throwing (live 366-001 shape)', () => {
    const out = evaluateWithRubric(makeCodexResult(), makeTask());
    expect(['DONE', 'GO_WITH_TECH_DEBT', 'NO_GO']).toContain(out.decision);
  });
});
