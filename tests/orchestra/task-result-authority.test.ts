import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlement,
  createTaskResultSettlementRef,
  taskResultSettlementPath,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementClosureAtomic,
} from '../../src/core/task-result-settlement.js';
import { readAuthoritativeTaskResult } from '../../src/orchestra/task-result-authority.js';

const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;

function fixture(): { root: string; tasksDir: string } {
  const base = mkdtempSync(join(tmpdir(), 'deckent-result-authority-'));
  roots.push(base);
  const root = join(base, 'project');
  const tasksDir = join(root, '.tasks');
  mkdirSync(tasksDir, { recursive: true });
  process.env.DECKENT_HOME = join(base, 'host-state');
  return { root, tasksDir };
}

function writeRaw(tasksDir: string, taskId: string, value: unknown): void {
  writeFileSync(join(tasksDir, `task-${taskId}.result`), JSON.stringify(value), 'utf-8');
}

afterEach(() => {
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('task result authority', () => {
  it('keeps worker-writable raw output ineligible while Docker settlement is pending', () => {
    const { root, tasksDir } = fixture();
    const taskId = 'pending-docker';
    writeRaw(tasksDir, taskId, { taskId, selfAssessment: 'DONE', notes: 'worker claim' });
    const ref = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);

    expect(readAuthoritativeTaskResult(root, taskId)).toMatchObject({
      state: 'pending-settlement',
      result: null,
      settlementRef: ref,
    });
  });

  it('returns the immutable host settlement payload even when raw output disagrees', () => {
    const { root, tasksDir } = fixture();
    const taskId = 'settled-docker';
    writeRaw(tasksDir, taskId, { taskId, selfAssessment: 'DONE', notes: 'tampered raw' });
    const ref = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    const hostResult = { taskId, selfAssessment: 'NO_GO', notes: 'host truth' };
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref,
      exitCode: 1,
      result: hostResult,
    }));

    expect(readAuthoritativeTaskResult(root, taskId)).toMatchObject({
      state: 'settled',
      result: hostResult,
      settlementRef: ref,
    });
  });

  it('keeps a newer active attempt pending instead of replaying an older closed receipt', () => {
    const { root, tasksDir } = fixture();
    const taskId = 'newer-active-attempt';
    writeRaw(tasksDir, taskId, { taskId, selfAssessment: 'DONE', notes: 'raw fallback forbidden' });
    const first = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(first);
    claimTaskResultSettlementAttemptAtomic(first);
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref: first,
      exitCode: 0,
      result: { taskId, selfAssessment: 'DONE', notes: 'older settled attempt' },
    }));
    writeTaskResultSettlementClosureAtomic(first, {
      containerDisposition: 'stopped-removed',
      locksReleased: true,
    });

    const second = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(second);
    claimTaskResultSettlementAttemptAtomic(second);

    expect(readAuthoritativeTaskResult(root, taskId)).toMatchObject({
      state: 'pending-settlement',
      result: null,
      settlementRef: second,
    });
  });

  it('preserves legacy raw results only when no Docker authority exists', () => {
    const { root, tasksDir } = fixture();
    const taskId = 'legacy-subprocess';
    const legacy = { taskId, selfAssessment: 'DONE', notes: 'legacy truth' };
    writeRaw(tasksDir, taskId, legacy);

    expect(readAuthoritativeTaskResult(root, taskId)).toMatchObject({
      state: 'legacy',
      result: legacy,
      settlementRef: null,
    });
  });

  it('reports missing or invalid legacy data as absent', () => {
    const { root, tasksDir } = fixture();
    expect(readAuthoritativeTaskResult(root, 'missing')).toMatchObject({
      state: 'absent',
      result: null,
    });

    writeFileSync(join(tasksDir, 'task-invalid.result'), '{', 'utf-8');
    expect(readAuthoritativeTaskResult(root, 'invalid')).toMatchObject({
      state: 'absent',
      result: null,
    });
  });

  it('fails loudly when an active settlement file exists but is malformed', () => {
    const { root, tasksDir } = fixture();
    const taskId = 'corrupt-settlement';
    writeRaw(tasksDir, taskId, { taskId, selfAssessment: 'DONE', notes: 'raw fallback forbidden' });
    const ref = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    writeFileSync(taskResultSettlementPath(ref), '{}', 'utf-8');

    expect(() => readAuthoritativeTaskResult(root, taskId))
      .toThrow(/Corrupt host-owned Docker result settlement/);
  });
});
