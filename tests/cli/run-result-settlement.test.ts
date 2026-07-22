import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { waitForRunResult } from '../../src/cli/commands/run.js';
import {
  createTaskResultSettlement,
  createTaskResultSettlementRef,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementAttemptAtomic,
} from '../../src/core/task-result-settlement.js';

const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;

function fixture(): { root: string; tasks: string } {
  const base = mkdtempSync(join(tmpdir(), 'deckent-run-settlement-'));
  roots.push(base);
  const root = join(base, 'project');
  const tasks = join(root, '.tasks');
  mkdirSync(tasks, { recursive: true });
  process.env.DECKENT_HOME = join(base, 'host-state');
  return { root, tasks };
}

function rawResult(tasks: string, taskId: string, assessment: 'DONE' | 'NO_GO'): void {
  writeFileSync(join(tasks, `task-${taskId}.result`), JSON.stringify({
    taskId,
    workerId: `worker-${taskId}`,
    selfAssessment: assessment,
    testsPassed: assessment === 'DONE',
    filesChanged: [],
    notes: assessment,
  }), 'utf-8');
}

afterEach(() => {
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('waitForRunResult settlement authority', () => {
  it('ignores an early raw DONE until the exact host receipt publishes embedded NO_GO', async () => {
    const { root, tasks } = fixture();
    const taskId = 'race-a';
    rawResult(tasks, taskId, 'DONE');
    const ref = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(ref);

    const waiting = waitForRunResult(root, taskId, 2_000, { settlementRef: ref });
    const early = await Promise.race([
      waiting.then(() => 'resolved'),
      new Promise<string>((resolve) => setTimeout(() => resolve('pending'), 150)),
    ]);
    expect(early).toBe('pending');

    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref,
      exitCode: 137,
      result: {
        taskId,
        workerId: `docker-${taskId}`,
        selfAssessment: 'NO_GO',
        testsPassed: false,
        filesChanged: [],
        notes: 'host budget veto',
      },
    }));
    await expect(waiting).resolves.toMatchObject({
      taskId,
      selfAssessment: 'NO_GO',
      notes: 'host budget veto',
    });
  });

  it('does not accept a stale receipt from another attempt of the same task', async () => {
    const { root, tasks } = fixture();
    const taskId = 'retry-a';
    rawResult(tasks, taskId, 'DONE');
    const stale = createTaskResultSettlementRef(root, taskId);
    const current = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(stale);
    writeTaskResultSettlementAttemptAtomic(current);
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref: stale,
      exitCode: 0,
      result: { taskId, selfAssessment: 'DONE' },
    }));

    await expect(waitForRunResult(root, taskId, 180, { settlementRef: current })).resolves.toBeNull();
  });

  it('returns the embedded snapshot even if the worker-writable raw result changes later', async () => {
    const { root, tasks } = fixture();
    const taskId = 'immutable-a';
    const ref = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(ref);
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref,
      exitCode: 137,
      result: { taskId, selfAssessment: 'NO_GO', notes: 'settled' },
    }));
    rawResult(tasks, taskId, 'DONE');

    await expect(waitForRunResult(root, taskId, 500, { settlementRef: ref })).resolves.toMatchObject({
      selfAssessment: 'NO_GO',
      notes: 'settled',
    });
  });

  it('preserves legacy raw-result behavior when no settlement reference exists', async () => {
    const { root, tasks } = fixture();
    rawResult(tasks, 'legacy-a', 'DONE');
    await expect(waitForRunResult(root, 'legacy-a', 500)).resolves.toMatchObject({
      selfAssessment: 'DONE',
    });
  });
});
