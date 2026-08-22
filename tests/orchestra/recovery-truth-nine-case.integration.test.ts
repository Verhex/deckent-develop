import { performance } from 'node:perf_hooks';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { decideExecutionRecovery } from '../../src/core/execution-recovery.js';
import { TaskEvaluation } from '../../src/core/types.js';
import { createSprintRecoveryAdapter } from '../../src/orchestra/recovery-adapters/sprint-recovery-adapter.js';
import {
  evaluationAuditPath,
  writeEvaluationAudit,
} from '../../src/orchestra/evaluation-audit-trail.js';
import { consumeControllerEvaluationSettlement } from '../../src/orchestra/sprint-controller.js';
import {
  readSprintRecoverySettlementIdentity,
  runSprintRecoveryOperation,
} from '../../src/orchestra/sprint-recovery-operation.js';
import {
  readTaskArtifactProjectionSet,
} from '../../src/orchestra/task-artifact-projection.js';

const roots: string[] = [];

function root(prefix: string): string {
  const value = mkdtempSync(join(tmpdir(), prefix));
  roots.push(value);
  return value;
}

function seedPaused(projectRoot: string, sprintId = 'sprint-622'): string {
  mkdirSync(join(projectRoot, '.deckent'), { recursive: true });
  mkdirSync(join(projectRoot, '.tasks'), { recursive: true });
  writeFileSync(join(projectRoot, '.deckent', 'sprint-state.json'), JSON.stringify({
    sprintId, phase: 'EXECUTE', status: 'PAUSED', taskIds: ['622-001'],
  }));
  writeFileSync(join(projectRoot, '.deckent', 'pause-state.json'), JSON.stringify({
    sprintId, phase: 'EXECUTE', status: 'PAUSED',
  }));
  writeFileSync(join(projectRoot, '.tasks', 'task-622-001.json'), JSON.stringify({
    id: '622-001', sprintId, status: 'PAUSED',
  }));
  const checkpoint = join(projectRoot, '.deckent', `${sprintId}-checkpoint.json`);
  writeFileSync(checkpoint, JSON.stringify({
    sprintId,
    checkpointNumber: 9,
    timestamp: new Date().toISOString(),
    completedTasks: [],
    pendingTasks: ['622-001'],
    activeWorkers: [],
    brainPhase: 'EXECUTE',
    eventStreamOffset: 9,
  }));
  return checkpoint;
}

function publishSettlement(projectRoot: string, decision: 'DONE' | 'GO_WITH_TECH_DEBT' = 'DONE'): string {
  writeEvaluationAudit(projectRoot, 'sprint-622', '622-001', 1, {
    ruleSet: 'CODE',
    schemaValidation: { valid: true, missingFields: [], coverageRelaxed: false },
    criterionScores: [],
    totalScore: 100,
    decision,
    decisionRationale: 'durable integration settlement',
  });
  return evaluationAuditPath(projectRoot, 'sprint-622', '622-001', 1);
}

afterEach(() => {
  for (const projectRoot of roots.splice(0)) {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

describe('recovery truth producer -> authority -> consumer nine-case matrix', () => {
  it('1 restart replays the exact terminal receipt without rewriting producer bytes', () => {
    const projectRoot = root('recovery-restart-');
    const receipt = publishSettlement(projectRoot, 'GO_WITH_TECH_DEBT');
    const before = readFileSync(receipt);

    const first = consumeControllerEvaluationSettlement({
      projectRoot, sprintId: 'sprint-622', taskId: '622-001', attemptNum: 1,
    });
    const afterRestart = consumeControllerEvaluationSettlement({
      projectRoot, sprintId: 'sprint-622', taskId: '622-001', attemptNum: 1,
    });

    expect(first).toMatchObject({ state: 'SETTLED', evaluation: TaskEvaluation.GO_WITH_TECH_DEBT });
    expect(afterRestart).toEqual(first);
    expect(readFileSync(receipt)).toEqual(before);
  });

  it('2 duplicate live coordinator is a typed ACTIVE_AUTHORITY HOLD with no deletion', async () => {
    const projectRoot = root('recovery-duplicate-process-');
    mkdirSync(join(projectRoot, '.deckent', 'pids'), { recursive: true });
    writeFileSync(join(projectRoot, '.deckent', 'sprint-active.json'), JSON.stringify({
      sprintId: 'sprint-622', pid: process.pid, startedAt: new Date().toISOString(), env: 'test',
    }));
    writeFileSync(join(projectRoot, '.deckent', 'sprint-state.json'), JSON.stringify({
      sprintId: 'sprint-622', phase: 'EXECUTE', status: 'ACTIVE',
    }));
    const pidFile = join(projectRoot, '.deckent', 'pids', 'sprint-622.pid');
    writeFileSync(pidFile, JSON.stringify({ sprintId: 'sprint-622', pid: process.pid }));
    const before = readFileSync(pidFile);
    const identity = readSprintRecoverySettlementIdentity(projectRoot, 'sprint-622');

    await expect(runSprintRecoveryOperation(projectRoot, 'sprint-622', {
      skipAudit: true,
      approval: { approvalRef: 'matrix:duplicate', idempotencyKey: 'duplicate', identity },
    })).rejects.toMatchObject({ code: 'ACTIVE_AUTHORITY' });
    expect(readFileSync(pidFile)).toEqual(before);
  });

  it('3 corrupt receipt bytes fail closed as SETTLEMENT_RECEIPT_CONFLICT', () => {
    const projectRoot = root('recovery-corrupt-');
    const receipt = evaluationAuditPath(projectRoot, 'sprint-622', '622-001', 1);
    mkdirSync(dirname(receipt), { recursive: true });
    writeFileSync(receipt, Buffer.from([0xff, 0x00, 0x7b, 0x7d]));

    expect(consumeControllerEvaluationSettlement({
      projectRoot, sprintId: 'sprint-622', taskId: '622-001', attemptNum: 1,
    })).toMatchObject({ state: 'HOLD', reason: 'SETTLEMENT_RECEIPT_CONFLICT' });
  });

  it('4 a foreign generation cannot consume the prior generation terminal receipt', () => {
    const projectRoot = root('recovery-foreign-generation-');
    const receipt = publishSettlement(projectRoot);
    const before = readFileSync(receipt);

    expect(consumeControllerEvaluationSettlement({
      projectRoot,
      sprintId: 'sprint-622',
      taskId: '622-001',
      attemptNum: 2,
      expectedEvaluation: TaskEvaluation.DONE,
    })).toMatchObject({ state: 'HOLD', reason: 'SETTLEMENT_RECEIPT_MISSING' });
    expect(readFileSync(receipt)).toEqual(before);
  });

  it('5 the Windows-native adapter carries production platform authority end to end', () => {
    const calls: string[] = [];
    const adapter = createSprintRecoveryAdapter('windows-native', {
      clearCheckpoint: id => { calls.push(`checkpoint:${id}`); },
      clearPid: id => { calls.push(`pid:${id}`); },
      clearMatchingSprintState: id => { calls.push(`state:${id}`); },
    });
    const identity = { taskId: 'sprint-622', attemptId: 'attempt-9', fenceToken: 'fence-9' };
    const inspected = adapter.inspect(identity, {
      identity,
      evidenceRefs: ['C:\\deckent\\checkpoint.json:sha256:abc'],
      dispatch: 'DISPATCHED', control: 'RUNNING', process: 'ABSENT', fence: 'INACTIVE',
      previousProgressSequence: 9, observedProgressSequence: 9,
      wallClockProjection: 'STALE', completion: 'INCOMPLETE',
    });

    expect(adapter.capabilities.platform).toBe('windows-native');
    expect(inspected).toMatchObject({ ok: true, value: { evidence: {
      evidenceRefs: ['C:\\deckent\\checkpoint.json:sha256:abc'],
    } } });
    if (!inspected.ok) throw new Error(inspected.message);
    expect(decideExecutionRecovery(inspected.value).decision).toBe('ORPHANED');
    expect(calls).toEqual([]);
  });

  it('6 force recovery preserves canonical checkpoint bytes and reports the same digest on replay', async () => {
    const projectRoot = root('recovery-checkpoint-');
    const checkpoint = seedPaused(projectRoot);
    const before = readFileSync(checkpoint);
    const identity = readSprintRecoverySettlementIdentity(projectRoot, 'sprint-622');
    const options = {
      skipAudit: true,
      approval: { approvalRef: 'matrix:checkpoint', idempotencyKey: 'checkpoint-once', identity },
    } as const;

    const applied = await runSprintRecoveryOperation(projectRoot, 'sprint-622', options);
    const replay = await runSprintRecoveryOperation(projectRoot, 'sprint-622', {
      ...options, dryRun: true,
    });

    expect(applied.artifactPolicy.checkpoint).toMatchObject({
      disposition: 'preserved', reason: 'CHECKPOINT_SUPERSESSION_REQUIRED',
    });
    expect(replay.artifactPolicy.checkpoint).toEqual(applied.artifactPolicy.checkpoint);
    expect(readFileSync(checkpoint)).toEqual(before);
  });

  it('7 stale projection is a typed STALLED gate rather than terminal success', () => {
    const identity = { taskId: '622-001', attemptId: 'attempt-9', fenceToken: 'fence-9' };
    const outcome = decideExecutionRecovery({ expectedIdentity: identity, evidence: {
      identity,
      evidenceRefs: ['projection:sha256:stale'],
      dispatch: 'DISPATCHED', control: 'RUNNING', process: 'ALIVE', fence: 'ACTIVE',
      previousProgressSequence: 10, observedProgressSequence: 10,
      wallClockProjection: 'STALE', completion: 'INCOMPLETE',
    } });
    expect(outcome.decision).toBe('STALLED');
  });

  it('8 terminal/projection disagreement is a typed conflict and preserves the receipt', () => {
    const projectRoot = root('recovery-terminal-conflict-');
    const receipt = publishSettlement(projectRoot);
    const before = readFileSync(receipt);

    expect(consumeControllerEvaluationSettlement({
      projectRoot, sprintId: 'sprint-622', taskId: '622-001', attemptNum: 1,
      expectedEvaluation: TaskEvaluation.NO_GO,
    })).toMatchObject({ state: 'HOLD', reason: 'SETTLEMENT_RECEIPT_CONFLICT' });
    expect(readFileSync(receipt)).toEqual(before);
  });

  it('9 projects and replays 10k production task artifacts within the 10s bound without deletion', () => {
    const projectRoot = root('recovery-10k-');
    const tasks = Array.from({ length: 10_000 }, (_, index) => ({
      id: `622-${String(index).padStart(5, '0')}`,
      sprintId: 'sprint-622',
      status: 'PENDING',
    }));
    const ids = tasks.map(task => task.id);
    const tasksDir = join(projectRoot, '.tasks');
    mkdirSync(tasksDir);
    for (const task of tasks) {
      // These are input observations, not a fixture-local projection. Both
      // canonicalization passes below are the production reader.
      writeFileSync(join(tasksDir, `task-${task.id}.json`), JSON.stringify(task));
    }

    const started = performance.now();
    const first = readTaskArtifactProjectionSet(projectRoot, ids);
    const replay = readTaskArtifactProjectionSet(projectRoot, ids);
    const elapsedMs = performance.now() - started;

    expect(first.tasks).toHaveLength(10_000);
    expect(replay).toEqual(first);
    expect(elapsedMs).toBeLessThan(10_000);
    expect(readFileSync(join(projectRoot, '.tasks', 'task-622-00000.json'))).toBeTruthy();
    expect(readFileSync(join(projectRoot, '.tasks', 'task-622-09999.json'))).toBeTruthy();
  }, 30_000);
});
