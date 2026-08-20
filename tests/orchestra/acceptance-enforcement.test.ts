// ─── Acceptance enforcement + confirmation store (ADR-G-040 runtime) ────────
//
// Pins: (1) observe mode never changes an evaluation; (2) enforce REJECT caps
// at NO_GO with a salvage-proof `acceptance:` row and a B1 cause; (3) enforce
// ROUTE downgrades DONE to tech-debt, emits the pending-confirmation intent
// (kernel undecidable statements + author provider) and never fires on NO_GO;
// (4) the store is idempotent by deterministic id and settles single-shot;
// (5) the human-adapter CLI decide settles behind the interactive seam and
// refuses wrong-adapter ids.

import { describe, expect, it, onTestFinished } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

import { applyAcceptanceEnforcement } from '../../src/orchestra/acceptance-enforcement.js';
import { hasUnsalvageableContractFailure } from '../../src/orchestra/criterion-evaluation.js';
import {
  createConfirmationRequest,
  listPendingConfirmations,
  readConfirmation,
  settleConfirmation,
} from '../../src/core/confirmation-store.js';
import { registerConfirmationsCommand } from '../../src/cli/commands/confirmations.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';
import type { EvaluationResult } from '../../src/core/task-types.js';

function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: '920-001',
    title: 'enforcement test',
    description: 'adapter runtime',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src'], filesRead: [], filesWrite: ['src/core/config.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'delivered per contract', noGoCriteria: 'broken', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    ...over,
  } as Task;
}

function makeResult(over: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '920-001',
    workerId: 'w-920',
    filesChanged: ['src/core/config.ts'],
    linesAdded: 3,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 90,
    selfAssessment: 'DONE',
    notes: 'vitest run: 4/4 passed (exit 0).',
    tokenUsage: { inputTokens: 1, outputTokens: 1, provider: 'claude' } as TaskResult['tokenUsage'],
    ...over,
  };
}

function makeEvaluation(over: Partial<EvaluationResult> = {}): EvaluationResult {
  return { decision: 'DONE', totalScore: 95, rubricScores: [], retryCount: 0, ...over };
}

describe('applyAcceptanceEnforcement', () => {
  it('observe mode (default) never changes the evaluation', () => {
    const evaluation = makeEvaluation();
    const out = applyAcceptanceEnforcement(evaluation, makeTask(), makeResult(), 'sprint-920');
    expect(out.evaluation).toBe(evaluation);
    expect(out.enforced).toBe(false);
    expect(out.outcome).toMatchObject({ action: 'ACCEPT', source: 'default' });
  });

  it('enforce REJECT caps at NO_GO with a salvage-proof row and a B1 cause', () => {
    const out = applyAcceptanceEnforcement(
      makeEvaluation({ decision: 'GO_WITH_TECH_DEBT' }), makeTask(), makeResult(), 'sprint-920',
      {
        acceptance_enforcement: 'enforce',
        acceptance_matrix: { 'code-development': { QUALIFIED: { action: 'REJECT' } } },
      });
    expect(out.evaluation.decision).toBe('NO_GO');
    expect(out.enforced).toBe(true);
    expect(out.postRubricCause).toBe('acceptance-policy:reject:code-development·QUALIFIED');
    expect(hasUnsalvageableContractFailure(out.evaluation.rubricScores)).toBe(true);
  });

  it('enforce ROUTE downgrades DONE, carries statements + author, never fires on NO_GO', () => {
    const task = makeTask({ type: 'security' });
    const routed = applyAcceptanceEnforcement(
      makeEvaluation({
        decision: 'DONE',
        contractSummary: {
          decided: 1, total: 2,
          undecidableItems: [{ itemId: 'it-1', statement: 'process owner signs off' }],
        },
      }),
      task, makeResult(), 'sprint-920', { acceptance_enforcement: 'enforce' });
    expect(routed.evaluation.decision).toBe('GO_WITH_TECH_DEBT');
    expect(routed.postRubricCause).toBe('acceptance-policy:route:human');
    expect(routed.pendingConfirmation).toMatchObject({
      taskId: '920-001', kind: 'security', verdict: 'UNDECIDABLE', adapter: 'human',
      statements: ['process owner signs off'], authorProvider: 'claude',
    });

    const noGo = applyAcceptanceEnforcement(
      makeEvaluation({ decision: 'NO_GO' }), task, makeResult(), 'sprint-920',
      { acceptance_enforcement: 'enforce' });
    expect(noGo.evaluation.decision).toBe('NO_GO');
    expect(noGo.pendingConfirmation).toBeUndefined();
  });
});

describe('confirmation store + human CLI decide', () => {
  it('is idempotent by deterministic id and settles single-shot', () => {
    const root = mkdtempSync(join(tmpdir(), 'confirmation-store-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    const base = {
      sprintId: 'sprint-920', taskId: '920-001', itemIds: ['it-1'],
      kind: 'security', verdict: 'UNDECIDABLE', adapter: 'human',
      statements: ['process owner signs off'], evidenceRequirements: [],
      requestedAt: '2026-08-20T12:00:00.000Z', source: 'acceptance-matrix',
    } as const;
    const first = createConfirmationRequest(root, base);
    expect(first.created).toBe(true);
    expect(createConfirmationRequest(root, base)).toEqual({ id: first.id, created: false });
    expect(listPendingConfirmations(root)).toHaveLength(1);

    const settled = settleConfirmation(root, first.id, {
      verdict: 'CONFIRMED', decidedBy: 'human', reason: 'signed', decidedAt: '2026-08-20T12:01:00.000Z',
    });
    expect(settled.outcome.verdict).toBe('CONFIRMED');
    expect(listPendingConfirmations(root)).toHaveLength(0);
    expect(readConfirmation(root, first.id)?.state).toBe('settled');
    expect(() => settleConfirmation(root, first.id, {
      verdict: 'FAILED', decidedBy: 'human', reason: 'again', decidedAt: '2026-08-20T12:02:00.000Z',
    })).toThrow(/not pending/);
    // A settled id can never be re-created as pending.
    expect(createConfirmationRequest(root, base)).toEqual({ id: first.id, created: false });
  });

  it('CLI decide settles a human request behind the interactive seam; wrong adapter refused', async () => {
    const root = mkdtempSync(join(tmpdir(), 'confirmation-cli-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    const human = createConfirmationRequest(root, {
      sprintId: 's', taskId: 't', itemIds: [], kind: 'audit', verdict: 'QUALIFIED',
      adapter: 'human', statements: ['ok?'], evidenceRequirements: [],
      requestedAt: '2026-08-20T12:00:00.000Z', source: 'acceptance-matrix',
    });
    const llm = createConfirmationRequest(root, {
      sprintId: 's', taskId: 't2', itemIds: [], kind: 'audit', verdict: 'UNDECIDABLE',
      adapter: 'llm', statements: ['?'], evidenceRequirements: [],
      requestedAt: '2026-08-20T12:00:01.000Z', source: 'acceptance-matrix',
    });

    const program = new Command();
    program.exitOverride();
    registerConfirmationsCommand(program, {
      resolveProjectRootFn: () => root,
      confirmInteractiveFn: async () => true,
    });
    await program.parseAsync(['node', 'deckent', 'confirmations', 'decide', human.id,
      '--confirm', '--reason', 'reviewed and approved']);
    expect(readConfirmation(root, human.id)?.state).toBe('settled');

    process.exitCode = 0;
    await program.parseAsync(['node', 'deckent', 'confirmations', 'decide', llm.id,
      '--confirm', '--reason', 'nope']);
    expect(process.exitCode).toBe(1);
    expect(readConfirmation(root, llm.id)?.state).toBe('pending');
    process.exitCode = 0;
  });
});
