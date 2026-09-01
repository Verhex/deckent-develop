import { afterEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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
  taskResultSettlementV2Digest,
} from '../../src/core/task-result-settlement.js';
import {
  createExactAcceptedTaskResultRefV2,
  createExactTaskResultSettlementRefV2,
} from '../../src/core/task-settlement-authority.js';
import {
  type ExactAuthoritativeTaskResult,
  type ExactTaskResultAuthorityMetadata,
  readAuthoritativeTaskResult,
  readExactAuthoritativeTaskResult,
  readExactSettledTaskResult,
} from '../../src/orchestra/task-result-authority.js';
import {
  projectExactTaskResultSettlement,
  type ExactTaskTerminalDecisionAuthorityV2,
} from '../../src/orchestra/task-settlement-projection.js';
import { TaskEvaluation, TaskStatus, type TaskResult } from '../../src/core/types.js';
import { projectAttributedTaskWork } from '../../src/core/sprint-work-attribution.js';
import { createTaskResultSettlementV2Fixture } from '../helpers/task-result-settlement-v2-fixture.js';

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

function writeTask(tasksDir: string, taskId: string, status = TaskStatus.EXECUTING): void {
  writeFileSync(join(tasksDir, `task-${taskId}.json`), JSON.stringify({
    id: taskId,
    title: 'exact projection fixture',
    status,
  }), 'utf-8');
}

function terminalDecision(
  authority: ExactTaskResultAuthorityMetadata,
  evaluation: ExactTaskTerminalDecisionAuthorityV2['evaluationReceipt']['verdict'],
): ExactTaskTerminalDecisionAuthorityV2 {
  return {
    schemaVersion: 2,
    kind: 'exact-task-terminal-decision-authority-v2',
    identity: authority.identity,
    evaluationReceipt: {
      verdict: evaluation,
      artifactReceiptDigest: authority.evaluationArtifact.artifactReceiptDigest,
      artifactSha256: authority.evaluationArtifact.artifactSha256,
      byteLength: authority.evaluationArtifact.byteLength,
      chainDigest: authority.evaluationChainDigest,
    },
    finalizerReceipt: {
      state: 'terminal-ready',
      artifactReceiptDigest: authority.finalizerArtifact.artifactReceiptDigest,
      artifactSha256: authority.finalizerArtifact.artifactSha256,
      byteLength: authority.finalizerArtifact.byteLength,
      chainDigest: authority.finalizerChainDigest,
    },
  };
}

afterEach(() => {
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('task result authority', () => {
  it('reads exact normal-Docker accepted result from private custody and ignores public spoof bytes', () => {
    const { root, tasksDir } = fixture();
    const exact = createTaskResultSettlementV2Fixture();
    writeRaw(tasksDir, exact.identity.taskId, {
      taskId: exact.identity.taskId,
      selfAssessment: 'NO_GO',
      evaluationDecision: 'NO_GO',
      notes: 'public spoof must not enter exact authority',
    });
    const acceptedResultRef = createExactAcceptedTaskResultRefV2(
      exact.creation.acceptedResultArtifact,
    );
    const authority = readExactAuthoritativeTaskResult({
      executionMode: 'normal-docker',
      authorityKind: 'accepted-result',
      projectRoot: root,
      taskId: exact.identity.taskId,
      custodyStore: exact.store,
      policy: exact.policy,
      expectedIdentity: exact.identity,
      admission: exact.creation.admission,
      acceptedResultRef,
      expectedAcceptedResultChainDigest: exact.creation.acceptedResultChain.receiptDigest,
    });

    expect(authority).toMatchObject({
      state: 'exact-accepted',
      settlementRef: null,
      exactAcceptedAuthority: {
        identity: exact.identity,
        acceptedResultRef,
        resultDigest: exact.settlement.resultDigest,
        acceptedResultChainDigest: exact.creation.acceptedResultChain.receiptDigest,
      },
      result: {
        taskId: exact.identity.taskId,
        selfAssessment: 'DONE',
        notes: '',
        exactAcceptedResultAuthority: {
          acceptedResultRef,
        },
      },
    });
    expect((authority.result as Record<string, unknown>)['evaluationDecision']).toBeUndefined();
    expect((authority.result as Record<string, unknown>)['brainEvaluation']).toBeUndefined();
  });

  it('keeps no-dispatch truth at zero attempts without reading a public result', () => {
    const { root, tasksDir } = fixture();
    const taskId = 'never-dispatched';
    writeRaw(tasksDir, taskId, {
      taskId,
      selfAssessment: 'DONE',
      notes: 'public attempt fiction',
    });

    expect(readExactAuthoritativeTaskResult({
      executionMode: 'normal-docker',
      authorityKind: 'not-dispatched',
      projectRoot: root,
      taskId,
      authority: {
        schemaVersion: 2,
        kind: 'task-not-dispatched-v2',
        state: 'NOT_DISPATCHED',
        taskId,
        attemptCount: 0,
        reasonCode: 'DISPATCH_ADMISSION_HOLD',
        evidenceRef: 'dispatch-admission:sha256:fixture',
        attemptIdentity: null,
        settlementRef: null,
        settlementDigest: null,
      },
    })).toMatchObject({
      state: 'not-dispatched',
      result: null,
      settlementRef: null,
      attemptCount: 0,
    });
  });

  it('returns typed HOLD for an exact sibling attempt instead of falling back to public bytes', () => {
    const { root, tasksDir } = fixture();
    const exact = createTaskResultSettlementV2Fixture();
    writeRaw(tasksDir, exact.identity.taskId, {
      taskId: exact.identity.taskId,
      selfAssessment: 'DONE',
      notes: 'public fallback forbidden',
    });
    const acceptedResultRef = createExactAcceptedTaskResultRefV2(
      exact.creation.acceptedResultArtifact,
    );
    const siblingIdentity = {
      ...exact.identity,
      attemptId: '123e4567-e89b-42d3-a456-426614174001',
    };

    expect(readExactAuthoritativeTaskResult({
      executionMode: 'normal-docker',
      authorityKind: 'accepted-result',
      projectRoot: root,
      taskId: exact.identity.taskId,
      custodyStore: exact.store,
      policy: exact.policy,
      expectedIdentity: siblingIdentity,
      admission: exact.creation.admission,
      acceptedResultRef,
      expectedAcceptedResultChainDigest: exact.creation.acceptedResultChain.receiptDigest,
    })).toMatchObject({
      state: 'authority-hold',
      result: null,
      holdReason: 'sibling-attempt',
    });
  });

  it('projects host evaluation with exact identity and replays idempotently', async () => {
    const { root, tasksDir } = fixture();
    const exact = createTaskResultSettlementV2Fixture();
    writeTask(tasksDir, exact.identity.taskId);
    const settlementRef = createExactTaskResultSettlementRefV2(exact.settlementArtifact);
    const authority = readExactSettledTaskResult<TaskResult>({
      executionMode: 'normal-docker',
      authorityKind: 'attempt-settlement',
      projectRoot: root,
      taskId: exact.identity.taskId,
      custodyStore: exact.store,
      policy: exact.policy,
      expectedIdentity: exact.identity,
      admission: exact.creation.admission,
      settlementRef,
      expectedSettlementDigest: taskResultSettlementV2Digest(
        exact.settlement,
        exact.policy.jsonBounds,
      ),
    });
    expect(authority.state).toBe('exact-settled');
    if (!authority.result || !authority.exactAuthority) throw new Error('fixture authority missing');
    const resolverResult = {
      ...authority.result,
      notes: 'host resolver canonical compatible result',
    } as ExactAuthoritativeTaskResult<TaskResult>;

    const projectionOptions = {
      revalidateAuthority: async ({ expectedDecisionAuthority }: {
        expectedDecisionAuthority: ExactTaskTerminalDecisionAuthorityV2;
      }) => expectedDecisionAuthority.evaluationReceipt.verdict === TaskEvaluation.DONE
        ? {
            state: 'current' as const,
            authority: authority.exactAuthority!,
            decisionAuthority: expectedDecisionAuthority,
            canonicalCompatibleResult: resolverResult,
          }
        : { state: 'hold' as const, reasonCode: 'decision-receipt-mismatch' },
    };
    await expect(projectExactTaskResultSettlement(
      root,
      exact.identity.taskId,
      terminalDecision(authority.exactAuthority, TaskEvaluation.NO_GO),
      authority.exactAuthority,
      projectionOptions,
    )).rejects.toThrow(/decision-receipt-mismatch/u);
    expect(existsSync(join(tasksDir, `task-${exact.identity.taskId}.result`))).toBe(false);
    const applied = await projectExactTaskResultSettlement(
      root,
      exact.identity.taskId,
      terminalDecision(authority.exactAuthority, TaskEvaluation.DONE),
      authority.exactAuthority,
      projectionOptions,
    );
    expect(applied).toMatchObject({
      decision: 'applied',
      status: TaskStatus.DONE,
      projection: {
        identity: exact.identity,
        settlementRef,
        evaluation: TaskEvaluation.DONE,
        resultDigest: exact.settlement.resultDigest,
      },
    });
    expect(JSON.parse(readFileSync(
      join(tasksDir, `task-${exact.identity.taskId}.json`),
      'utf-8',
    ))).toMatchObject({
      status: TaskStatus.DONE,
      exactSettlementProjection: {
        identity: exact.identity,
        evaluation: TaskEvaluation.DONE,
      },
    });
    expect(JSON.parse(readFileSync(
      join(tasksDir, `task-${exact.identity.taskId}.result`),
      'utf-8',
    ))).toMatchObject({
      selfAssessment: 'DONE',
      notes: 'host resolver canonical compatible result',
      exactSettlementAuthority: { identity: exact.identity },
      exactSettlementProjection: {
        identity: exact.identity,
        evaluation: TaskEvaluation.DONE,
      },
    });

    await expect(projectExactTaskResultSettlement(
      root,
      exact.identity.taskId,
      terminalDecision(authority.exactAuthority, TaskEvaluation.DONE),
      authority.exactAuthority,
      projectionOptions,
    )).resolves.toMatchObject({ decision: 'idempotent', status: TaskStatus.DONE });

    const projectedResultPath = join(tasksDir, `task-${exact.identity.taskId}.result`);
    const tampered = JSON.parse(readFileSync(projectedResultPath, 'utf8')) as Record<string, unknown>;
    tampered.notes = 'worker/public divergent body';
    writeFileSync(projectedResultPath, `${JSON.stringify(tampered, null, 2)}\n`, 'utf8');
    await expect(projectExactTaskResultSettlement(
      root,
      exact.identity.taskId,
      terminalDecision(authority.exactAuthority, TaskEvaluation.DONE),
      authority.exactAuthority,
      projectionOptions,
    )).rejects.toThrow(/conflicting exact public result body/u);
    expect(JSON.parse(readFileSync(projectedResultPath, 'utf8'))).toMatchObject({
      notes: 'worker/public divergent body',
    });
  });

  it('holds malformed terminal decision graphs before any proxy or getter dereference', async () => {
    const { root, tasksDir } = fixture();
    const exact = createTaskResultSettlementV2Fixture();
    writeTask(tasksDir, exact.identity.taskId);
    const settlementRef = createExactTaskResultSettlementRefV2(exact.settlementArtifact);
    const authority = readExactSettledTaskResult<TaskResult>({
      executionMode: 'normal-docker',
      authorityKind: 'attempt-settlement',
      projectRoot: root,
      taskId: exact.identity.taskId,
      custodyStore: exact.store,
      policy: exact.policy,
      expectedIdentity: exact.identity,
      admission: exact.creation.admission,
      settlementRef,
      expectedSettlementDigest: taskResultSettlementV2Digest(
        exact.settlement,
        exact.policy.jsonBounds,
      ),
    });
    if (!authority.result || !authority.exactAuthority) throw new Error('fixture authority missing');
    const valid = terminalDecision(authority.exactAuthority, TaskEvaluation.DONE);
    let proxyTrapCalls = 0;
    const proxy = new Proxy(valid, {
      get() {
        proxyTrapCalls += 1;
        throw new Error('proxy trap must not run');
      },
    });
    let getterCalls = 0;
    const getter = { ...valid } as Record<string, unknown>;
    Object.defineProperty(getter, 'identity', {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error('getter must not run');
      },
    });
    const extraNested = {
      ...valid,
      evaluationReceipt: { ...valid.evaluationReceipt, injectedVerdict: 'NO_GO' },
    };
    const nonEnumerableNested = {
      ...valid,
      evaluationReceipt: { ...valid.evaluationReceipt },
    };
    Object.defineProperty(nonEnumerableNested.evaluationReceipt, 'hidden', {
      enumerable: false,
      value: 'spoof',
    });
    const symbolNested = {
      ...valid,
      finalizerReceipt: { ...valid.finalizerReceipt },
    };
    Object.defineProperty(symbolNested.finalizerReceipt, Symbol('spoof'), {
      enumerable: true,
      value: 'spoof',
    });
    const invalidReceipt = {
      ...valid,
      evaluationReceipt: { ...valid.evaluationReceipt, byteLength: 0 },
    };
    const hugeFlat = Object.fromEntries(
      Array.from({ length: 10_000 }, (_, index) => [`key-${index}`, index]),
    );
    const oversizedString = {
      ...valid,
      kind: 'x'.repeat(70 * 1024),
    };
    const cyclic = { ...valid } as Record<string, unknown>;
    cyclic.evaluationReceipt = cyclic;

    for (const malformed of [
      proxy,
      getter,
      extraNested,
      nonEnumerableNested,
      symbolNested,
      invalidReceipt,
      hugeFlat,
      oversizedString,
      cyclic,
    ]) {
      await expect(projectExactTaskResultSettlement(
        root,
        exact.identity.taskId,
        malformed as ExactTaskTerminalDecisionAuthorityV2,
        authority.exactAuthority,
        {
          revalidateAuthority: async () => {
            throw new Error('invalid input must not reach the resolver');
          },
        },
      )).rejects.toMatchObject({ code: 'DECKENT_E077' });
    }
    expect(proxyTrapCalls).toBe(0);
    expect(getterCalls).toBe(0);
    expect(existsSync(join(tasksDir, `task-${exact.identity.taskId}.result`))).toBe(false);
  });

  it('holds oversized or cyclic projection revalidation before public mutation', async () => {
    const { root, tasksDir } = fixture();
    const exact = createTaskResultSettlementV2Fixture();
    writeTask(tasksDir, exact.identity.taskId);
    const settlementRef = createExactTaskResultSettlementRefV2(exact.settlementArtifact);
    const authority = readExactSettledTaskResult<TaskResult>({
      executionMode: 'normal-docker',
      authorityKind: 'attempt-settlement',
      projectRoot: root,
      taskId: exact.identity.taskId,
      custodyStore: exact.store,
      policy: exact.policy,
      expectedIdentity: exact.identity,
      admission: exact.creation.admission,
      settlementRef,
      expectedSettlementDigest: taskResultSettlementV2Digest(
        exact.settlement,
        exact.policy.jsonBounds,
      ),
    });
    if (!authority.result || !authority.exactAuthority) throw new Error('fixture authority missing');
    const decision = terminalDecision(authority.exactAuthority, TaskEvaluation.DONE);
    const hugeFlat = Object.fromEntries(
      Array.from({ length: 10_000 }, (_, index) => [`key-${index}`, index]),
    );
    const oversizedHold = {
      state: 'hold',
      reasonCode: 'x'.repeat(70 * 1024),
    };
    const cyclicCurrent: Record<string, unknown> = { state: 'current' };
    cyclicCurrent.authority = cyclicCurrent;
    cyclicCurrent.decisionAuthority = decision;
    cyclicCurrent.canonicalCompatibleResult = authority.result;
    let getterCalls = 0;
    const getterCurrent: Record<string, unknown> = {
      state: 'current',
      decisionAuthority: decision,
      canonicalCompatibleResult: authority.result,
    };
    Object.defineProperty(getterCurrent, 'authority', {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error('projection revalidation getter must not run');
      },
    });

    for (const invalid of [hugeFlat, oversizedHold, cyclicCurrent, getterCurrent]) {
      await expect(projectExactTaskResultSettlement(
        root,
        exact.identity.taskId,
        decision,
        authority.exactAuthority,
        {
          revalidateAuthority: async () => invalid as never,
        },
      )).rejects.toMatchObject({ code: 'DECKENT_E077' });
    }
    expect(getterCalls).toBe(0);
    expect(existsSync(join(tasksDir, `task-${exact.identity.taskId}.result`))).toBe(false);
    expect(JSON.parse(readFileSync(
      join(tasksDir, `task-${exact.identity.taskId}.json`),
      'utf8',
    ))).toMatchObject({ status: TaskStatus.EXECUTING });
  });

  it('holds resolver result drift without an unsafe public rollback or false success return', async () => {
    const { root: authorityRoot } = fixture();
    const exact = createTaskResultSettlementV2Fixture();
    const settlementRef = createExactTaskResultSettlementRefV2(exact.settlementArtifact);
    const authority = readExactSettledTaskResult<TaskResult>({
      executionMode: 'normal-docker',
      authorityKind: 'attempt-settlement',
      projectRoot: authorityRoot,
      taskId: exact.identity.taskId,
      custodyStore: exact.store,
      policy: exact.policy,
      expectedIdentity: exact.identity,
      admission: exact.creation.admission,
      settlementRef,
      expectedSettlementDigest: taskResultSettlementV2Digest(
        exact.settlement,
        exact.policy.jsonBounds,
      ),
    });
    if (!authority.result || !authority.exactAuthority) throw new Error('fixture authority missing');
    const decision = terminalDecision(authority.exactAuthority, TaskEvaluation.DONE);
    const first = {
      ...authority.result,
      notes: 'resolver snapshot A',
    } as ExactAuthoritativeTaskResult<TaskResult>;
    const changed = {
      ...authority.result,
      notes: 'resolver snapshot B',
    } as ExactAuthoritativeTaskResult<TaskResult>;

    for (const changeAtCall of [2, 3]) {
      const { root, tasksDir } = fixture();
      writeTask(tasksDir, exact.identity.taskId);
      let calls = 0;
      await expect(projectExactTaskResultSettlement(
        root,
        exact.identity.taskId,
        decision,
        authority.exactAuthority,
        {
          revalidateAuthority: async ({ expectedDecisionAuthority }) => {
            calls += 1;
            return {
              state: 'current' as const,
              authority: authority.exactAuthority!,
              decisionAuthority: expectedDecisionAuthority,
              canonicalCompatibleResult: calls >= changeAtCall ? changed : first,
            };
          },
        },
      )).rejects.toThrow(/canonical compatible result changed during projection/u);
      expect(calls).toBe(changeAtCall);
      expect(JSON.parse(readFileSync(
        join(tasksDir, `task-${exact.identity.taskId}.result`),
        'utf8',
      ))).toMatchObject({ notes: 'resolver snapshot A' });
      expect(JSON.parse(readFileSync(
        join(tasksDir, `task-${exact.identity.taskId}.json`),
        'utf8',
      ))).toMatchObject({
        status: changeAtCall === 2 ? TaskStatus.EXECUTING : TaskStatus.DONE,
      });
    }
  });

  it('holds stale and sibling exact projections behind the generation fence', async () => {
    const { root, tasksDir } = fixture();
    const exact = createTaskResultSettlementV2Fixture();
    writeTask(tasksDir, exact.identity.taskId);
    const settlementRef = createExactTaskResultSettlementRefV2(exact.settlementArtifact);
    const authority = readExactSettledTaskResult<TaskResult>({
      executionMode: 'normal-docker',
      authorityKind: 'attempt-settlement',
      projectRoot: root,
      taskId: exact.identity.taskId,
      custodyStore: exact.store,
      policy: exact.policy,
      expectedIdentity: exact.identity,
      admission: exact.creation.admission,
      settlementRef,
      expectedSettlementDigest: taskResultSettlementV2Digest(
        exact.settlement,
        exact.policy.jsonBounds,
      ),
    });
    if (!authority.result || !authority.exactAuthority) throw new Error('fixture authority missing');
    const result = authority.result as ExactAuthoritativeTaskResult<TaskResult>;
    await projectExactTaskResultSettlement(
      root,
      exact.identity.taskId,
      terminalDecision(authority.exactAuthority, TaskEvaluation.DONE),
      authority.exactAuthority,
      {
        revalidateAuthority: async ({ expectedDecisionAuthority }) => ({
          state: 'current' as const,
          authority: authority.exactAuthority!,
          decisionAuthority: expectedDecisionAuthority,
          canonicalCompatibleResult: result,
        }),
      },
    );

    const staleIdentity = { ...authority.exactAuthority.identity, generation: 3 };
    const staleAuthority = {
      ...authority.exactAuthority,
      identity: staleIdentity,
      settlementRef: {
        ...authority.exactAuthority.settlementRef,
        identity: staleIdentity,
      },
    };
    await expect(projectExactTaskResultSettlement(
      root,
      exact.identity.taskId,
      terminalDecision(staleAuthority, TaskEvaluation.DONE),
      staleAuthority,
      {
        revalidateAuthority: async ({ expectedDecisionAuthority }) => ({
          state: 'current' as const,
          authority: staleAuthority,
          decisionAuthority: expectedDecisionAuthority,
          canonicalCompatibleResult: { ...result, exactSettlementAuthority: staleAuthority },
        }),
      },
    )).rejects.toThrow(/stale generation at task projection/u);

    const siblingIdentity = {
      ...authority.exactAuthority.identity,
      attemptId: '123e4567-e89b-42d3-a456-426614174002',
    };
    const siblingAuthority = {
      ...authority.exactAuthority,
      identity: siblingIdentity,
      settlementRef: {
        ...authority.exactAuthority.settlementRef,
        identity: siblingIdentity,
      },
    };
    await expect(projectExactTaskResultSettlement(
      root,
      exact.identity.taskId,
      terminalDecision(siblingAuthority, TaskEvaluation.DONE),
      siblingAuthority,
      {
        revalidateAuthority: async ({ expectedDecisionAuthority }) => ({
          state: 'current' as const,
          authority: siblingAuthority,
          decisionAuthority: expectedDecisionAuthority,
          canonicalCompatibleResult: { ...result, exactSettlementAuthority: siblingAuthority },
        }),
      },
    )).rejects.toThrow(/sibling attempt at task projection/u);
  });

  it('ignores worker-writable lock spoofing but holds a newer unprojected authority', async () => {
    const { root, tasksDir } = fixture();
    const exact = createTaskResultSettlementV2Fixture();
    writeTask(tasksDir, exact.identity.taskId);
    writeFileSync(
      join(tasksDir, `task-${exact.identity.taskId}.exact-projection.lock`),
      'worker spoof',
      'utf8',
    );
    const settlementRef = createExactTaskResultSettlementRefV2(exact.settlementArtifact);
    const authority = readExactSettledTaskResult<TaskResult>({
      executionMode: 'normal-docker',
      authorityKind: 'attempt-settlement',
      projectRoot: root,
      taskId: exact.identity.taskId,
      custodyStore: exact.store,
      policy: exact.policy,
      expectedIdentity: exact.identity,
      admission: exact.creation.admission,
      settlementRef,
      expectedSettlementDigest: taskResultSettlementV2Digest(
        exact.settlement,
        exact.policy.jsonBounds,
      ),
    });
    if (!authority.result || !authority.exactAuthority) throw new Error('fixture authority missing');

    await expect(projectExactTaskResultSettlement(
      root,
      exact.identity.taskId,
      terminalDecision(authority.exactAuthority, TaskEvaluation.DONE),
      authority.exactAuthority,
      {
        revalidateAuthority: async ({ expectedDecisionAuthority }) => ({
          state: 'current' as const,
          authority: authority.exactAuthority!,
          decisionAuthority: expectedDecisionAuthority,
          canonicalCompatibleResult: authority.result as ExactAuthoritativeTaskResult<TaskResult>,
        }),
      },
    )).resolves.toMatchObject({ decision: 'applied', status: TaskStatus.DONE });
    expect(readFileSync(
      join(tasksDir, `task-${exact.identity.taskId}.exact-projection.lock`),
      'utf8',
    )).toBe('worker spoof');

    const { root: newerRoot, tasksDir: newerTasksDir } = fixture();
    writeTask(newerTasksDir, exact.identity.taskId);
    await expect(projectExactTaskResultSettlement(
      newerRoot,
      exact.identity.taskId,
      terminalDecision(authority.exactAuthority, TaskEvaluation.DONE),
      authority.exactAuthority,
      {
        revalidateAuthority: async () => ({
          state: 'hold' as const,
          reasonCode: 'newer-attempt-active',
        }),
      },
    )).rejects.toThrow(/newer-attempt-active/u);
    expect(existsSync(join(newerTasksDir, `task-${exact.identity.taskId}.result`))).toBe(false);
  });

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

  it('returns the immutable host settlement payload only after closure even when raw output disagrees', () => {
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
      state: 'pending-settlement',
      result: null,
      settlementRef: ref,
    });
    writeTaskResultSettlementClosureAtomic(ref, {
      containerDisposition: 'stopped-removed',
      locksReleased: true,
    });

    expect(readAuthoritativeTaskResult(root, taskId)).toMatchObject({
      state: 'settled',
      result: hostResult,
      settlementRef: ref,
    });
  });

  it('projects a closed crash-before-prepare recovery as host-owned zero-work evidence', () => {
    const { root, tasksDir } = fixture();
    const taskId = 'recovered-before-prepare';
    const ref = createTaskResultSettlementRef(root, taskId);
    const recoveryResult = {
      taskId,
      workerId: `docker-recovery-${taskId}`,
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: false,
      selfAssessment: 'NO_GO',
      notes: `DECKENT_E091:coordinator-crashed-before-docker-prepare:${ref.attemptId}`,
      exitCode: null,
      tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
    };
    writeRaw(tasksDir, taskId, recoveryResult);
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref,
      exitCode: null,
      result: recoveryResult,
    }));
    writeTaskResultSettlementClosureAtomic(ref, {
      containerDisposition: 'not-dispatched',
      locksReleased: true,
    });

    const authority = readAuthoritativeTaskResult<typeof recoveryResult & {
      preDispatchSettlement?: {
        attemptId: string;
        reasonCode: string;
        evidenceRef: string;
      };
    }>(root, taskId);
    expect(authority).toMatchObject({
      state: 'settled',
      settlementRef: ref,
      result: {
        preDispatchSettlement: {
          reasonCode: 'COORDINATOR_CRASHED_BEFORE_DOCKER_PREPARE',
        },
      },
    });
    expect(authority.result?.preDispatchSettlement?.attemptId)
      .toMatch(new RegExp(`^host-pre-dispatch:${taskId}:`));
    expect(authority.result?.preDispatchSettlement?.evidenceRef)
      .toMatch(/^host-pre-dispatch-settlement:sha256:[a-f0-9]{64}$/u);
    expect(projectAttributedTaskWork(authority.result as never)).toMatchObject({
      state: 'VERIFIED',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
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
