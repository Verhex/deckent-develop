import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  assertTaskResultSettlementRef,
  createTaskResultSettlement,
  createTaskResultSettlementRef,
  readTaskResultSettlement,
  taskResultSettlementAttemptPath,
  taskResultSettlementPath,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementAttemptAtomic,
} from '../../src/core/task-result-settlement.js';

const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;

function fixture(): { root: string; state: string } {
  const base = mkdtempSync(join(tmpdir(), 'deckent-settlement-'));
  roots.push(base);
  const root = join(base, 'project');
  const state = join(base, 'host-state');
  mkdirSync(root, { recursive: true });
  mkdirSync(state, { recursive: true });
  process.env.DECKENT_HOME = state;
  return { root, state };
}

afterEach(() => {
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('host-authoritative Docker TaskResult settlement', () => {
  it('persists an exact pending attempt before publishing an immutable embedded result', () => {
    const { root, state } = fixture();
    const ref = createTaskResultSettlementRef(root, 'task-a');
    writeTaskResultSettlementAttemptAtomic(ref, '2026-07-22T00:00:00.000Z');
    writeTaskResultSettlementAttemptAtomic(ref, '2026-07-22T00:00:01.000Z');

    expect(taskResultSettlementAttemptPath(ref)).toContain(state);
    expect(JSON.parse(readFileSync(taskResultSettlementAttemptPath(ref), 'utf-8'))).toMatchObject({
      ...ref,
      state: 'pending',
      createdAt: '2026-07-22T00:00:00.000Z',
    });

    const result = { taskId: 'task-a', selfAssessment: 'NO_GO', testsPassed: false };
    const first = createTaskResultSettlement({
      ref,
      exitCode: 137,
      result,
      settledAt: '2026-07-22T00:01:00.000Z',
    });
    writeTaskResultSettlementAtomic(first);
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref,
      exitCode: 137,
      result,
      settledAt: '2026-07-22T00:02:00.000Z',
    }));

    expect(readTaskResultSettlement(ref)).toMatchObject({
      ...ref,
      state: 'settled',
      exitCode: 137,
      result,
    });
    expect(() => writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref,
      exitCode: 0,
      result: { ...result, selfAssessment: 'DONE' },
    }))).toThrow(/Conflicting immutable/);
  });

  it('rejects wrong-task, forged-path and cross-project authorities', () => {
    const { root } = fixture();
    const otherRoot = join(root, '..', 'other-project');
    mkdirSync(otherRoot, { recursive: true });
    const ref = createTaskResultSettlementRef(root, 'task-a');

    expect(() => createTaskResultSettlement({
      ref,
      exitCode: 0,
      result: { taskId: 'task-b', selfAssessment: 'DONE' },
    })).toThrow(/does not match/);
    expect(() => assertTaskResultSettlementRef(otherRoot, 'task-a', ref)).toThrow(/authority/);
    expect(() => taskResultSettlementPath({ ...ref, attemptId: '../../escape' })).toThrow(/Invalid/);
  });

  it('fails closed when host state resolves inside the worker-mounted project', () => {
    const { root } = fixture();
    process.env.DECKENT_HOME = join(root, '.deckent-host');
    expect(() => createTaskResultSettlementRef(root, 'task-a')).toThrow(/outside/);

    const link = join(root, '..', 'state-link');
    symlinkSync(root, link, 'dir');
    process.env.DECKENT_HOME = link;
    expect(() => createTaskResultSettlementRef(root, 'task-b')).toThrow(/outside/);
  });

  it('detects embedded-result tampering instead of trusting outer metadata', () => {
    const { root } = fixture();
    const ref = createTaskResultSettlementRef(root, 'task-a');
    writeTaskResultSettlementAttemptAtomic(ref);
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref,
      exitCode: 0,
      result: { taskId: 'task-a', selfAssessment: 'DONE' },
    }));
    const path = taskResultSettlementPath(ref);
    const tampered = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
    tampered.result = { taskId: 'task-a', selfAssessment: 'NO_GO' };
    writeFileSync(path, JSON.stringify(tampered), 'utf-8');
    expect(readTaskResultSettlement(ref)).toBeNull();
  });
});
