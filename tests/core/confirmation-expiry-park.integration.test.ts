import { describe, expect, it, onTestFinished } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

import { registerConfirmationsCommand } from '../../src/cli/commands/confirmations.js';
import { loadConfig } from '../../src/core/config.js';
import { resolveApprovalLifecyclePolicy } from '../../src/core/approval-lifecycle-policy.js';
import {
  readConfirmation,
  settleConfirmation,
  sweepExpiredConfirmations,
} from '../../src/core/confirmation-store.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';
import type { EvaluationResult } from '../../src/core/task-types.js';
import { applyAcceptanceEnforcement } from '../../src/orchestra/acceptance-enforcement.js';
import { persistDurableAcceptanceConfirmation } from '../../src/orchestra/sprint-phases.js';

describe('confirmation expiry park integration', () => {
  it('mints from EVALUATE, expires FWW to UNDECIDABLE, and rejects CLI/direct revival', async () => {
    const root = mkdtempSync(join(tmpdir(), 'confirmation-expiry-park-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
    const task = {
      id: '609-042', title: 'owner security confirmation', description: 'integration',
      model: 'claude-sonnet-5', effort: 'normal', priority: 'NORMAL', reason: 'test',
      scope: { directories: ['src'], filesRead: [], filesWrite: ['src/core/security.ts'] },
      dependencies: [], status: TaskStatus.PENDING, type: 'security',
      goNogo: {
        goCriteria: 'owner confirms', noGoCriteria: 'owner rejects', techDebtAcceptable: '',
        items: [{ id: 'owner', statement: 'Owner confirms', evidenceRequirements: ['review.json'] }],
      },
    } as Task;
    const result: TaskResult = {
      taskId: task.id, workerId: 'worker-42', filesChanged: ['src/core/security.ts'],
      linesAdded: 4, linesRemoved: 0, testsPassed: true, coverage: 100,
      selfAssessment: 'DONE', notes: 'awaiting owner confirmation',
      workAttribution: {
        state: 'VERIFIED', attemptId: 'attempt-42', baselineRef: 'base-42', scopeDigest: 'scope-42',
      },
    };
    const baseline: EvaluationResult = {
      decision: 'DONE', totalScore: 100, rubricScores: [], retryCount: 0,
      contractSummary: {
        decided: 0, total: 1,
        undecidableItems: [{ itemId: 'owner', statement: 'Owner confirms' }],
      },
    };
    const enforcement = applyAcceptanceEnforcement(
      baseline, task, result, 'sprint-609', { acceptance_enforcement: 'enforce' },
    );
    let at = new Date('2026-08-21T08:00:00.000Z');
    const durable = persistDurableAcceptanceConfirmation({
      projectRoot: root,
      sprint: { id: 'sprint-609', tasks: [task] },
      task, result, baselineEvaluation: baseline, enforcement,
      requestedAt: at.toISOString(), lifecycle,
    });
    expect(durable.enforcement.evaluation.decision).toBe('GO_WITH_TECH_DEBT');
    const id = durable.confirmation?.id;
    if (!id) throw new Error('durable confirmation was not created');
    const pendingPath = join(root, '.deckent', 'runtime', 'confirmations', 'pending', `${id}.json`);
    const settledPath = join(root, '.deckent', 'runtime', 'confirmations', 'settled', `${id}.json`);
    const authored = readConfirmation(root, id, { lifecycle, clock: () => at });
    if (!authored || authored.state !== 'pending') throw new Error('expected pending confirmation');
    const pinnedSource = authored.request.approval.source;

    at = new Date('2026-08-21T16:00:00.000Z');
    let interactiveCalls = 0;
    const program = new Command().exitOverride();
    registerConfirmationsCommand(program, {
      resolveProjectRootFn: () => root,
      clock: () => at,
      confirmInteractiveFn: async () => { interactiveCalls += 1; return true; },
      loadConfigFn: (async () => ({ approval: { lifecycle } })) as unknown as typeof loadConfig,
    });
    process.exitCode = 0;
    await program.parseAsync([
      'node', 'deckent', 'confirmations', 'decide', id,
      '--confirm', '--reason', 'late approval must lose',
    ]);
    expect(process.exitCode).toBe(1);
    expect(interactiveCalls).toBe(0);
    expect(existsSync(pendingPath)).toBe(false);
    expect(existsSync(settledPath)).toBe(true);

    const settled = readConfirmation(root, id, { lifecycle, clock: () => at });
    if (!settled || settled.state !== 'settled') throw new Error('expected settled confirmation');
    expect(settled.request.outcome).toEqual({
      verdict: 'UNDECIDABLE',
      decidedBy: 'system:expiry',
      reason: 'timeout-disposition',
      decidedAt: at.toISOString(),
      closureReason: 'expired',
      parked: true,
    });
    expect(settled.request.approval.source).toEqual(pinnedSource);
    const tombstoneBytes = readFileSync(settledPath, 'utf8');
    expect(sweepExpiredConfirmations(root, { lifecycle, clock: () => at })).toEqual([]);
    expect(readFileSync(settledPath, 'utf8')).toBe(tombstoneBytes);
    expect(() => settleConfirmation(root, id, {
      verdict: 'CONFIRMED', decidedBy: 'human', reason: 'revive', decidedAt: at.toISOString(),
    }, { lifecycle, clock: () => at })).toThrow(/expired/u);
    process.exitCode = 0;
  });
});
