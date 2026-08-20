// ─── Acceptance Matrix (ADR-G-040 companion) — policy pins ──────────────────
//
// Pins: (1) the default matrix shape — base row for every kind, the stricter
// security row (QUALIFIED/UNDECIDABLE → human); (2) override wins per-cell
// with source attribution; (3) normalization DROPS invalid rules with typed
// reasons (never silently widens/narrows acceptance); (4) HOLD is
// type-excluded from the policy; (5) writeTaskEvaluationAudit stamps the
// OBSERVE outcome on the persisted record via the rubric's own kind
// authority (real wiring), and a DEFERRED (procedural) evaluation stays
// unstamped.

import { describe, expect, it, onTestFinished } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TASK_KINDS } from '../../src/core/work-model.js';
import {
  DEFAULT_ACCEPTANCE_MATRIX,
  normalizeAcceptanceOverride,
  resolveAcceptance,
} from '../../src/core/acceptance-matrix.js';
import { TaskEvaluation, TaskStatus } from '../../src/core/task-types.js';
import type { Task } from '../../src/core/types.js';
import { writeTaskEvaluationAudit } from '../../src/orchestra/sprint-phases.js';
import { evaluationAuditPath } from '../../src/orchestra/evaluation-audit-trail.js';

describe('acceptance matrix — default policy', () => {
  it('covers every canonical kind with the base row; security is stricter', () => {
    for (const kind of TASK_KINDS) {
      const row = DEFAULT_ACCEPTANCE_MATRIX[kind];
      expect(row.CONFIRMED).toEqual({ action: 'ACCEPT' });
      expect(row.FAILED).toEqual({ action: 'REJECT' });
      if (kind === 'security') {
        expect(row.QUALIFIED).toEqual({ action: 'ROUTE', adapter: 'human' });
        expect(row.UNDECIDABLE).toEqual({ action: 'ROUTE', adapter: 'human' });
      } else {
        expect(row.QUALIFIED).toEqual({ action: 'ACCEPT' });
        expect(row.UNDECIDABLE).toEqual({ action: 'ROUTE', adapter: 'llm' });
      }
    }
    expect(Object.isFrozen(DEFAULT_ACCEPTANCE_MATRIX)).toBe(true);
    expect(Object.isFrozen(DEFAULT_ACCEPTANCE_MATRIX.security.QUALIFIED)).toBe(true);
  });

  it('resolves default vs override with per-cell source attribution', () => {
    expect(resolveAcceptance('code-development', 'QUALIFIED'))
      .toEqual({ kind: 'code-development', verdict: 'QUALIFIED', action: 'ACCEPT', source: 'default' });
    const out = resolveAcceptance('code-development', 'QUALIFIED', {
      'code-development': { QUALIFIED: { action: 'ROUTE', adapter: 'human' } },
    });
    expect(out).toEqual({
      kind: 'code-development', verdict: 'QUALIFIED',
      action: 'ROUTE', adapter: 'human', source: 'override',
    });
    // Sibling cells stay default.
    expect(resolveAcceptance('code-development', 'FAILED', {
      'code-development': { QUALIFIED: { action: 'ROUTE', adapter: 'human' } },
    }).source).toBe('default');
  });

  it('drops invalid override rules with typed reasons — never silently', () => {
    const { override, rejected } = normalizeAcceptanceOverride({
      security: { UNDECIDABLE: { action: 'ROUTE' } },            // ROUTE without adapter
      documentation: { CONFIRMED: { action: 'ACCEPT', adapter: 'llm' } }, // adapter w/o ROUTE
      ['not-a-kind' as never]: { CONFIRMED: { action: 'ACCEPT' } },
      audit: { ['HOLD' as never]: { action: 'ACCEPT' } },        // HOLD outside policy
      test: { FAILED: { action: 'ACCEPT' } },                    // valid relaxation survives
    });
    expect(override).toEqual({ test: { FAILED: { action: 'ACCEPT' } } });
    expect(rejected).toEqual([
      'security.UNDECIDABLE: ROUTE requires a valid adapter',
      'documentation.CONFIRMED: adapter is only valid with ROUTE',
      'not-a-kind: unknown task kind',
      'audit.HOLD: not a decidable verdict',
    ]);
    // An invalid rule never wins in the resolver either.
    expect(resolveAcceptance('security', 'UNDECIDABLE', {
      security: { UNDECIDABLE: { action: 'ROUTE' } },
    })).toMatchObject({ action: 'ROUTE', adapter: 'human', source: 'default' });
  });
});

describe('acceptance matrix — audit OBSERVE wiring', () => {
  function makeTask(over: Partial<Task> = {}): Task {
    return {
      id: '910-001',
      title: 'acceptance stamp test',
      description: 'observe wiring',
      model: 'claude-sonnet-5',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'test',
      scope: { directories: ['src'], filesRead: [], filesWrite: ['src/core/config.ts'] },
      dependencies: [],
      goNogo: { goCriteria: 'done', noGoCriteria: 'broken', techDebtAcceptable: '' },
      status: TaskStatus.PENDING,
      ...over,
    } as Task;
  }

  it('stamps kind × verdict policy on the persisted record (security → human route)', () => {
    const root = mkdtempSync(join(tmpdir(), 'acceptance-audit-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));

    writeTaskEvaluationAudit(
      root, 'sprint-910', makeTask({ type: 'security' }),
      TaskEvaluation.GO_WITH_TECH_DEBT,
    );
    const persisted = JSON.parse(
      readFileSync(evaluationAuditPath(root, 'sprint-910', '910-001', 1), 'utf-8'),
    ) as { normativeVerdict: string; acceptance?: Record<string, string> };
    expect(persisted.normativeVerdict).toBe('QUALIFIED');
    expect(persisted.acceptance).toEqual({
      kind: 'security', verdict: 'QUALIFIED',
      action: 'ROUTE', adapter: 'human', source: 'default',
    });
  });

  it('leaves procedural evaluations unstamped (DEFERRED → HOLD, outside the policy)', () => {
    const root = mkdtempSync(join(tmpdir(), 'acceptance-audit-hold-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));

    writeTaskEvaluationAudit(root, 'sprint-911', makeTask(), TaskEvaluation.DEFERRED);
    const persisted = JSON.parse(
      readFileSync(evaluationAuditPath(root, 'sprint-911', '910-001', 1), 'utf-8'),
    ) as { acceptance?: unknown };
    expect(persisted.acceptance).toBeUndefined();
  });
});
