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
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlement,
  createTaskResultSettlementRef,
  dockerAttemptLabels,
  dockerContainerNameForTask,
  listPendingTaskResultSettlementAttempts,
  readClosedTaskResultSettlement,
  readLatestTaskResultSettlementRef,
  readTaskResultSettlementActiveClaim,
  readTaskResultSettlementClosure,
  readTaskResultSettlementDispatch,
  readTaskResultSettlementPrepared,
  readTaskResultSettlement,
  taskResultSettlementAttemptPath,
  taskResultSettlementClaimPath,
  taskResultSettlementClosurePath,
  taskResultSettlementPreparedPath,
  taskResultSettlementPath,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementClosureAtomic,
  writeTaskResultSettlementDispatchAtomic,
  writeTaskResultSettlementPreparedAtomic,
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
    expect(() => readClosedTaskResultSettlement(ref))
      .toThrow(/Corrupt host-owned Docker result settlement/);
  });

  it('exposes a product result only after a matching lifecycle closure', () => {
    const { root } = fixture();
    const pending = createTaskResultSettlementRef(root, 'task-pending-closure');
    writeTaskResultSettlementAttemptAtomic(pending);
    claimTaskResultSettlementAttemptAtomic(pending);
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref: pending,
      exitCode: 0,
      result: { taskId: pending.taskId, selfAssessment: 'DONE' },
    }));
    expect(readClosedTaskResultSettlement(pending)).toBeNull();

    writeTaskResultSettlementClosureAtomic(pending, {
      containerDisposition: 'stopped-removed',
      locksReleased: true,
    });
    expect(readClosedTaskResultSettlement(pending)).toMatchObject({
      ...pending,
      state: 'settled',
      result: { taskId: pending.taskId, selfAssessment: 'DONE' },
    });
  });

  it('fails loudly on existing corrupt or digest-mismatched closure evidence', () => {
    const { root } = fixture();
    const dangling = createTaskResultSettlementRef(root, 'task-dangling-closure');
    writeTaskResultSettlementAttemptAtomic(dangling);
    writeFileSync(taskResultSettlementClosurePath(dangling), '{}', 'utf-8');
    expect(() => readClosedTaskResultSettlement(dangling))
      .toThrow(/closure without receipt/);

    const corrupt = createTaskResultSettlementRef(root, 'task-corrupt-closure');
    writeTaskResultSettlementAttemptAtomic(corrupt);
    claimTaskResultSettlementAttemptAtomic(corrupt);
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref: corrupt,
      exitCode: 1,
      result: { taskId: corrupt.taskId, selfAssessment: 'NO_GO' },
    }));
    writeFileSync(taskResultSettlementClosurePath(corrupt), '{}', 'utf-8');
    expect(() => readClosedTaskResultSettlement(corrupt))
      .toThrow(/Corrupt Docker result settlement closure/);

    const mismatched = createTaskResultSettlementRef(root, 'task-mismatched-closure');
    writeTaskResultSettlementAttemptAtomic(mismatched);
    claimTaskResultSettlementAttemptAtomic(mismatched);
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref: mismatched,
      exitCode: 0,
      result: { taskId: mismatched.taskId, selfAssessment: 'DONE' },
    }));
    writeTaskResultSettlementClosureAtomic(mismatched, {
      containerDisposition: 'stopped-removed',
      locksReleased: true,
    });
    const receiptPath = taskResultSettlementPath(mismatched);
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf-8')) as Record<string, unknown>;
    receipt.settledAt = `${String(receipt.settledAt)}-tampered`;
    writeFileSync(receiptPath, JSON.stringify(receipt), 'utf-8');
    expect(() => readClosedTaskResultSettlement(mismatched))
      .toThrow(/Corrupt Docker result settlement closure/);
  });

  it('derives daemon-global names and labels from project, task and attempt authority', () => {
    const { root } = fixture();
    const otherRoot = join(root, '..', 'other-project');
    mkdirSync(otherRoot, { recursive: true });
    const ref = createTaskResultSettlementRef(root, 'same-task');

    expect(dockerContainerNameForTask(root, 'same-task')).toMatch(/^deckent-w-[a-f0-9]{12}-[a-f0-9]{16}$/);
    expect(dockerContainerNameForTask(otherRoot, 'same-task')).not.toBe(
      dockerContainerNameForTask(root, 'same-task'),
    );
    expect(dockerAttemptLabels(ref)).toEqual({
      'io.deckent.managed': 'true',
      'io.deckent.project': ref.projectRootSha256,
      'io.deckent.task': expect.stringMatching(/^[a-f0-9]{64}$/),
      'io.deckent.attempt': ref.attemptId,
    });
  });

  it('serializes same-task attempts through an append-only settlement/closure claim chain', () => {
    const { root } = fixture();
    const first = createTaskResultSettlementRef(root, 'task-chain');
    const second = createTaskResultSettlementRef(root, 'task-chain');
    writeTaskResultSettlementAttemptAtomic(first, '2026-07-22T00:00:00.000Z');
    writeTaskResultSettlementAttemptAtomic(second, '2026-07-22T00:00:01.000Z');

    claimTaskResultSettlementAttemptAtomic(first, '2026-07-22T00:00:02.000Z');
    claimTaskResultSettlementAttemptAtomic(first, '2026-07-22T00:00:03.000Z');
    expect(readTaskResultSettlementActiveClaim(first)).toMatchObject(first);
    expect(() => claimTaskResultSettlementAttemptAtomic(second)).toThrow(/Conflicting active/);

    writeTaskResultSettlementPreparedAtomic(first, 'claude-fable-5');
    writeTaskResultSettlementDispatchAtomic(first, 'a'.repeat(64));
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref: first,
      exitCode: 0,
      result: { taskId: first.taskId, selfAssessment: 'DONE' },
    }));
    expect(() => claimTaskResultSettlementAttemptAtomic(second)).toThrow(/Conflicting active/);
    writeTaskResultSettlementClosureAtomic(first, {
      containerDisposition: 'stopped-removed',
      locksReleased: true,
    });

    expect(readTaskResultSettlementActiveClaim(first)).toBeNull();
    claimTaskResultSettlementAttemptAtomic(first);
    expect(readTaskResultSettlementActiveClaim(first)).toBeNull();
    expect(() => listPendingTaskResultSettlementAttempts(root)).not.toThrow();
    claimTaskResultSettlementAttemptAtomic(second);
    expect(readTaskResultSettlementActiveClaim(second)).toMatchObject(second);
    expect(readTaskResultSettlementClosure(first)).toMatchObject({
      state: 'closed',
      containerDisposition: 'stopped-removed',
      locksReleased: true,
    });
  });

  it('resolves the active or latest closed project/task authority without in-memory state', () => {
    const { root } = fixture();
    const first = createTaskResultSettlementRef(root, 'task-latest');
    writeTaskResultSettlementAttemptAtomic(first);
    claimTaskResultSettlementAttemptAtomic(first);
    writeTaskResultSettlementPreparedAtomic(first, 'claude-fable-5');

    expect(readLatestTaskResultSettlementRef(root, 'task-latest')).toEqual(first);

    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref: first,
      exitCode: 0,
      result: { taskId: first.taskId, selfAssessment: 'DONE' },
    }));
    writeTaskResultSettlementClosureAtomic(first, {
      containerDisposition: 'stopped-removed',
      locksReleased: true,
    });
    expect(readLatestTaskResultSettlementRef(root, 'task-latest')).toEqual(first);

    const second = createTaskResultSettlementRef(root, 'task-latest');
    writeTaskResultSettlementAttemptAtomic(second);
    claimTaskResultSettlementAttemptAtomic(second);
    writeTaskResultSettlementPreparedAtomic(second, 'gpt-5.6-sol');
    expect(readLatestTaskResultSettlementRef(root, 'task-latest')).toEqual(second);
  });

  it('keeps latest-authority lookup project-scoped and fails loud on corrupt chain evidence', () => {
    const { root } = fixture();
    const otherRoot = join(root, '..', 'other-project');
    mkdirSync(otherRoot, { recursive: true });
    const ref = createTaskResultSettlementRef(root, 'task-corrupt-latest');
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);

    expect(readLatestTaskResultSettlementRef(otherRoot, ref.taskId)).toBeNull();

    const claimPath = taskResultSettlementClaimPath(ref);
    const corrupt = JSON.parse(readFileSync(claimPath, 'utf-8')) as Record<string, unknown>;
    corrupt.projectRootSha256 = 'f'.repeat(64);
    writeFileSync(claimPath, JSON.stringify(corrupt), 'utf-8');
    expect(() => readLatestTaskResultSettlementRef(root, ref.taskId)).toThrow(/Corrupt Docker result settlement claim chain/);
  });

  it('rejects a claim whose durable attempt evidence is missing or corrupt', () => {
    const { root } = fixture();
    const ref = createTaskResultSettlementRef(root, 'task-missing-attempt');
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    writeFileSync(taskResultSettlementAttemptPath(ref), '{}', 'utf-8');

    expect(() => readLatestTaskResultSettlementRef(root, ref.taskId))
      .toThrow(/Corrupt Docker result settlement authority/);
  });

  it('requires a durable attempt before claim and binds dispatch to immutable prepared metadata', () => {
    const { root } = fixture();
    const ref = createTaskResultSettlementRef(root, 'task-dispatch');
    expect(() => claimTaskResultSettlementAttemptAtomic(ref)).toThrow(/no matching durable pending attempt/);

    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    const prepared = writeTaskResultSettlementPreparedAtomic(ref, 'gpt-5.6-sol');
    const dispatch = writeTaskResultSettlementDispatchAtomic(ref, 'b'.repeat(64));
    expect(readTaskResultSettlementPrepared(ref)).toEqual(prepared);
    expect(readTaskResultSettlementDispatch(ref)).toEqual(dispatch);
    expect(dispatch.preparedSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(() => writeTaskResultSettlementDispatchAtomic(ref, 'c'.repeat(64))).toThrow(/Conflicting immutable/);

    const tampered = JSON.parse(readFileSync(taskResultSettlementPreparedPath(ref), 'utf-8')) as Record<string, unknown>;
    tampered.model = 'claude-fable-5';
    writeFileSync(taskResultSettlementPreparedPath(ref), JSON.stringify(tampered), 'utf-8');
    expect(readTaskResultSettlementDispatch(ref)).toBeNull();
  });

  it('enumerates only project-scoped lifecycle-pending attempts and fails loud on corrupt records', () => {
    const { root } = fixture();
    const otherRoot = join(root, '..', 'other-project');
    mkdirSync(otherRoot, { recursive: true });
    const active = createTaskResultSettlementRef(root, 'task-active');
    const other = createTaskResultSettlementRef(otherRoot, 'task-other');
    writeTaskResultSettlementAttemptAtomic(active, '2026-07-22T00:00:00.000Z');
    writeTaskResultSettlementAttemptAtomic(other, '2026-07-22T00:00:01.000Z');
    claimTaskResultSettlementAttemptAtomic(active);
    writeTaskResultSettlementPreparedAtomic(active, 'claude-fable-5');

    expect(listPendingTaskResultSettlementAttempts(root)).toEqual([
      expect.objectContaining({
        attempt: expect.objectContaining({ attemptId: active.attemptId }),
        claim: expect.objectContaining({ attemptId: active.attemptId }),
        prepared: expect.objectContaining({ model: 'claude-fable-5' }),
        dispatch: null,
        settlement: null,
      }),
    ]);

    writeFileSync(taskResultSettlementAttemptPath(active), '{}', 'utf-8');
    expect(() => listPendingTaskResultSettlementAttempts(root)).toThrow(/Corrupt Docker result settlement attempt/);
  });
});
