import { afterEach, describe, expect, it, vi } from 'vitest';
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

import type { Sprint, Task, TaskResult } from '../../src/core/types.js';
import { SprintPhase, SprintStatus, TaskStatus } from '../../src/core/types.js';

vi.mock('../../src/orchestra/tmux.js', () => ({
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
}));

vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: vi.fn(() => ({
    waitForChange: vi.fn(() => new Promise<void>(resolve => setTimeout(resolve, 5))),
    close: vi.fn(),
  })),
}));

vi.mock('../../src/orchestra/task-builder.js', () => ({
  // Plain functions (not vi.fn) so beforeEach resetAllMocks cannot strip the
  // implementation the spawner depends on (skillDelivery.deliveredSkillIds).
  writeSkillDeliveryEvidence: () => {},
  applySkillDirectiveAuthority: (task: { assignedSkills?: string[] }) => task?.assignedSkills ?? [],
  buildSkillDeliveryEvidence: (task: { id?: string; assignedSkills?: string[]; forceSkills?: string[] }, delivered?: readonly string[]) => ({
    version: 1, taskId: task?.id ?? '', source: 'worker-prompt',
    deliveredSkillIds: [...(delivered ?? [])],
    assignedSkillIds: [...(task?.assignedSkills ?? [])],
    forcedSkillIds: [...(task?.forceSkills ?? [])],
    undeliveredForcedSkillIds: (task?.forceSkills ?? []).filter((id) => !(delivered ?? []).includes(id)),
  }),
  buildWorkerPrompt: vi.fn(() => 'bounded prompt'),
}));

vi.mock('../../src/orchestra/ipc-registry.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/ipc-registry.js')>();
  return {
    ...actual,
    checkExactAttemptWorkerQuestions: vi.fn(actual.checkExactAttemptWorkerQuestions),
  };
});

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
  EXACT_IPC_PROJECTION_HOLD_EVENT_CHANNEL,
  waitForResults,
  type ExactAcceptedResultTerminalAuthorityV2,
} from '../../src/orchestra/result-collector.js';
import { readEvents } from '../../src/core/event-stream.js';
import { checkExactAttemptWorkerQuestions } from '../../src/orchestra/ipc-registry.js';
import {
  readExactAuthoritativeTaskResult,
  readExactSettledTaskResult,
  type ExactAcceptedTaskResultAuthorityMetadata,
  type ExactTaskResultAuthorityMetadata,
} from '../../src/orchestra/task-result-authority.js';
import { pollForResultFile } from '../../src/orchestra/sprint-phases.js';
import { createTaskResultSettlementV2Fixture } from '../helpers/task-result-settlement-v2-fixture.js';

const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;

function fixture(taskId: string): { root: string; tasksDir: string; task: Task; sprint: Sprint } {
  const base = mkdtempSync(join(tmpdir(), 'deckent-collector-settlement-'));
  roots.push(base);
  const root = join(base, 'project');
  const tasksDir = join(root, '.tasks');
  mkdirSync(tasksDir, { recursive: true });
  process.env.DECKENT_HOME = join(base, 'host-state');
  const task = {
    id: taskId,
    title: 'Settlement authority task',
    description: 'prove host result authority',
    model: 'claude-fable-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'host truth', noGoCriteria: 'raw wins', techDebtAcceptable: 'none' },
    status: TaskStatus.EXECUTING,
    sprintId: 'sprint-settlement-authority',
    createdAt: new Date().toISOString(),
    assignedAgent: 'generic',
    assignedSkills: [],
  } as Task;
  const sprint = {
    id: 'sprint-settlement-authority',
    number: 1,
    tasks: [task],
    workers: [`w-${taskId}`],
    phase: SprintPhase.EXECUTE,
    status: SprintStatus.ACTIVE,
    startedAt: new Date().toISOString(),
  } as Sprint;
  writeFileSync(
    join(tasksDir, `task-${taskId}.json`),
    `${JSON.stringify(task, null, 2)}\n`,
    'utf-8',
  );
  return { root, tasksDir, task, sprint };
}

function result(taskId: string, selfAssessment: TaskResult['selfAssessment'], notes: string): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: selfAssessment === 'DONE',
    coverage: 0,
    selfAssessment,
    notes,
  };
}

function terminalAuthority(
  accepted: ExactAcceptedTaskResultAuthorityMetadata,
  terminal: ExactTaskResultAuthorityMetadata,
  verdict: ExactAcceptedResultTerminalAuthorityV2['terminalDecisionAuthority']['evaluationReceipt']['verdict'],
): ExactAcceptedResultTerminalAuthorityV2 {
  return {
    schemaVersion: 2,
    kind: 'exact-accepted-result-terminal-authority-v2',
    acceptedAuthority: accepted,
    terminalResultAuthority: terminal,
    terminalDecisionAuthority: {
      schemaVersion: 2,
      kind: 'exact-task-terminal-decision-authority-v2',
      identity: terminal.identity,
      evaluationReceipt: {
        verdict,
        artifactReceiptDigest: terminal.evaluationArtifact.artifactReceiptDigest,
        artifactSha256: terminal.evaluationArtifact.artifactSha256,
        byteLength: terminal.evaluationArtifact.byteLength,
        chainDigest: terminal.evaluationChainDigest,
      },
      finalizerReceipt: {
        state: 'terminal-ready',
        artifactReceiptDigest: terminal.finalizerArtifact.artifactReceiptDigest,
        artifactSha256: terminal.finalizerArtifact.artifactSha256,
        byteLength: terminal.finalizerArtifact.byteLength,
        chainDigest: terminal.finalizerChainDigest,
      },
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('result collector settlement authority wire', () => {
  it('syncs exact accepted custody only through terminal settlement authority', async () => {
    const exact = createTaskResultSettlementV2Fixture();
    const taskId = exact.identity.taskId;
    const { root, tasksDir, task, sprint } = fixture(taskId);
    task.provider = 'codex';
    const acceptedResultRef = createExactAcceptedTaskResultRefV2(
      exact.creation.acceptedResultArtifact,
    );
    const exactAuthority = readExactAuthoritativeTaskResult<TaskResult>({
      executionMode: 'normal-docker',
      authorityKind: 'accepted-result',
      projectRoot: root,
      taskId,
      custodyStore: exact.store,
      policy: exact.policy,
      expectedIdentity: exact.identity,
      admission: exact.creation.admission,
      acceptedResultRef,
      expectedAcceptedResultChainDigest: exact.creation.acceptedResultChain.receiptDigest,
    });
    const evaluateCollectedResult = vi.fn(async () => 'NO_GO' as const);
    if (!exactAuthority.exactAcceptedAuthority) throw new Error('accepted authority missing');
    const terminalRef = createExactTaskResultSettlementRefV2(exact.settlementArtifact);
    const terminalRead = readExactSettledTaskResult<TaskResult>({
      executionMode: 'normal-docker',
      authorityKind: 'attempt-settlement',
      projectRoot: root,
      taskId,
      custodyStore: exact.store,
      policy: exact.policy,
      expectedIdentity: exact.identity,
      admission: exact.creation.admission,
      settlementRef: terminalRef,
      expectedSettlementDigest: taskResultSettlementV2Digest(
        exact.settlement,
        exact.policy.jsonBounds,
      ),
    });
    if (!terminalRead.exactAuthority) throw new Error('terminal authority missing');
    const validTerminalAuthority = terminalAuthority(
      exactAuthority.exactAcceptedAuthority!,
      terminalRead.exactAuthority!,
      'DONE',
    );
    expect(validTerminalAuthority.terminalDecisionAuthority.identity).toBe(
      validTerminalAuthority.terminalResultAuthority.identity,
    );
    const settleExactAcceptedResult = vi.fn(async () => validTerminalAuthority);

    expect(exactAuthority).toMatchObject({
      state: 'exact-accepted',
      result: {
        tokenUsage: { inputTokens: 10, outputTokens: 5 },
        exactAcceptedResultAuthority: {
          identity: exact.identity,
          acceptedResultRef,
        },
      },
    });
    const results = await waitForResults(root, sprint, 250, [], {
      readTaskResultAuthority: () => exactAuthority,
      evaluateCollectedResult,
      settleExactAcceptedResult,
      spawnBackend: {
        name: 'docker',
        spawn: vi.fn(),
        kill: vi.fn(),
        list: vi.fn(() => []),
        isAvailable: vi.fn(async () => true),
      },
      revalidateExactAcceptedResultTerminalAuthority: async ({
        expectedTerminalAuthority,
      }) => ({
        state: 'current' as const,
        terminalAuthority: expectedTerminalAuthority,
      }),
    });

    expect(evaluateCollectedResult).not.toHaveBeenCalled();
    expect(settleExactAcceptedResult).toHaveBeenCalledWith(expect.objectContaining({
      acceptedAuthority: exactAuthority.exactAcceptedAuthority,
      result: expect.objectContaining({
        exactAcceptedResultAuthority: exactAuthority.exactAcceptedAuthority,
      }),
    }));
    expect(task.status).toBe(TaskStatus.DONE);
    expect(existsSync(join(tasksDir, `task-${taskId}.result`))).toBe(false);
    expect(JSON.parse(readFileSync(
      join(tasksDir, `task-${taskId}.json`),
      'utf8',
    ))).toMatchObject({ status: TaskStatus.EXECUTING });
    expect(results).toHaveLength(1);
    expect(results[0]?.tokenUsage).toMatchObject({ inputTokens: 10, outputTokens: 5 });
  }, 30_000);

  it('holds exact collection when worker-writable public result bytes predate projection', async () => {
    const exact = createTaskResultSettlementV2Fixture();
    const taskId = exact.identity.taskId;
    const { root, tasksDir, task, sprint } = fixture(taskId);
    writeFileSync(join(tasksDir, `task-${taskId}.result`), JSON.stringify({
      taskId,
      selfAssessment: 'DONE',
      notes: 'unfenced public spoof',
    }), 'utf8');
    const acceptedResultRef = createExactAcceptedTaskResultRefV2(
      exact.creation.acceptedResultArtifact,
    );
    const exactAuthority = readExactAuthoritativeTaskResult<TaskResult>({
      executionMode: 'normal-docker',
      authorityKind: 'accepted-result',
      projectRoot: root,
      taskId,
      custodyStore: exact.store,
      policy: exact.policy,
      expectedIdentity: exact.identity,
      admission: exact.creation.admission,
      acceptedResultRef,
      expectedAcceptedResultChainDigest: exact.creation.acceptedResultChain.receiptDigest,
    });

    await expect(waitForResults(root, sprint, 250, [], {
      readTaskResultAuthority: () => exactAuthority,
      evaluateCollectedResult: async () => 'DONE' as const,
    })).rejects.toThrow(/unfenced public result bytes/u);
    expect(task.status).toBe(TaskStatus.EXECUTING);
  });

  it('holds foreign or structurally forged terminal authority without mutating task status', async () => {
    const exact = createTaskResultSettlementV2Fixture();
    const taskId = exact.identity.taskId;
    const { root, task, sprint } = fixture(taskId);
    const acceptedResultRef = createExactAcceptedTaskResultRefV2(
      exact.creation.acceptedResultArtifact,
    );
    const exactAuthority = readExactAuthoritativeTaskResult<TaskResult>({
      executionMode: 'normal-docker',
      authorityKind: 'accepted-result',
      projectRoot: root,
      taskId,
      custodyStore: exact.store,
      policy: exact.policy,
      expectedIdentity: exact.identity,
      admission: exact.creation.admission,
      acceptedResultRef,
      expectedAcceptedResultChainDigest: exact.creation.acceptedResultChain.receiptDigest,
    });
    if (!exactAuthority.exactAcceptedAuthority) throw new Error('accepted authority missing');
    const terminalRef = createExactTaskResultSettlementRefV2(exact.settlementArtifact);
    const terminalRead = readExactSettledTaskResult<TaskResult>({
      executionMode: 'normal-docker',
      authorityKind: 'attempt-settlement',
      projectRoot: root,
      taskId,
      custodyStore: exact.store,
      policy: exact.policy,
      expectedIdentity: exact.identity,
      admission: exact.creation.admission,
      settlementRef: terminalRef,
      expectedSettlementDigest: taskResultSettlementV2Digest(
        exact.settlement,
        exact.policy.jsonBounds,
      ),
    });
    if (!terminalRead.exactAuthority) throw new Error('terminal authority missing');
    const valid = terminalAuthority(
      exactAuthority.exactAcceptedAuthority,
      terminalRead.exactAuthority,
      'DONE',
    );
    const foreign = {
      ...valid,
      terminalResultAuthority: {
        ...valid.terminalResultAuthority,
        identity: {
          ...valid.terminalResultAuthority.identity,
          attemptId: '123e4567-e89b-42d3-a456-426614174099',
        },
      },
    };
    const symbolSpoof = JSON.parse(JSON.stringify(valid)) as ExactAcceptedResultTerminalAuthorityV2;
    Object.defineProperty(symbolSpoof.terminalResultAuthority.settlementRef, Symbol('spoof'), {
      enumerable: true,
      value: 'spoof',
    });
    const nonEnumerableSpoof = JSON.parse(
      JSON.stringify(valid),
    ) as ExactAcceptedResultTerminalAuthorityV2;
    Object.defineProperty(nonEnumerableSpoof.terminalResultAuthority.evaluationArtifact, 'hidden', {
      enumerable: false,
      value: 'spoof',
    });
    const hugeFlat = Object.fromEntries(
      Array.from({ length: 10_000 }, (_, index) => [`key-${index}`, index]),
    );
    const oversizedString = {
      ...valid,
      kind: 'x'.repeat(40 * 1024),
    };
    const cyclic = { ...valid } as Record<string, unknown>;
    cyclic.terminalDecisionAuthority = cyclic;
    let getterCalls = 0;
    const getterSpoof = { ...valid } as Record<string, unknown>;
    Object.defineProperty(getterSpoof, 'terminalDecisionAuthority', {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error('foreign getter must not run');
      },
    });

    for (const invalid of [
      foreign,
      symbolSpoof,
      nonEnumerableSpoof,
      hugeFlat,
      oversizedString,
      cyclic,
      getterSpoof,
    ]) {
      await expect(waitForResults(root, sprint, 250, [], {
        readTaskResultAuthority: () => exactAuthority,
        settleExactAcceptedResult: async () => invalid,
        revalidateExactAcceptedResultTerminalAuthority: async ({
          expectedTerminalAuthority,
        }) => ({
          state: 'current' as const,
          terminalAuthority: expectedTerminalAuthority,
        }),
      })).rejects.toThrow(/foreign or invalid settlement authority/u);
    }
    expect(getterCalls).toBe(0);
    expect(task.status).toBe(TaskStatus.EXECUTING);
  });

  it('rolls back status when bounded terminal revalidation returns oversized or cyclic authority', async () => {
    const exact = createTaskResultSettlementV2Fixture();
    const taskId = exact.identity.taskId;
    const { root, task, sprint } = fixture(taskId);
    const acceptedResultRef = createExactAcceptedTaskResultRefV2(
      exact.creation.acceptedResultArtifact,
    );
    const exactAuthority = readExactAuthoritativeTaskResult<TaskResult>({
      executionMode: 'normal-docker',
      authorityKind: 'accepted-result',
      projectRoot: root,
      taskId,
      custodyStore: exact.store,
      policy: exact.policy,
      expectedIdentity: exact.identity,
      admission: exact.creation.admission,
      acceptedResultRef,
      expectedAcceptedResultChainDigest: exact.creation.acceptedResultChain.receiptDigest,
    });
    if (!exactAuthority.exactAcceptedAuthority) throw new Error('accepted authority missing');
    const terminalRef = createExactTaskResultSettlementRefV2(exact.settlementArtifact);
    const terminalRead = readExactSettledTaskResult<TaskResult>({
      executionMode: 'normal-docker',
      authorityKind: 'attempt-settlement',
      projectRoot: root,
      taskId,
      custodyStore: exact.store,
      policy: exact.policy,
      expectedIdentity: exact.identity,
      admission: exact.creation.admission,
      settlementRef: terminalRef,
      expectedSettlementDigest: taskResultSettlementV2Digest(
        exact.settlement,
        exact.policy.jsonBounds,
      ),
    });
    if (!terminalRead.exactAuthority) throw new Error('terminal authority missing');
    const valid = terminalAuthority(
      exactAuthority.exactAcceptedAuthority,
      terminalRead.exactAuthority,
      'DONE',
    );
    const hugeFlat = Object.fromEntries(
      Array.from({ length: 10_000 }, (_, index) => [`key-${index}`, index]),
    );
    const oversizedHold = {
      state: 'hold',
      reasonCode: 'x'.repeat(40 * 1024),
    };
    const cyclicCurrent: Record<string, unknown> = { state: 'current' };
    cyclicCurrent.terminalAuthority = cyclicCurrent;
    let getterCalls = 0;
    const getterCurrent: Record<string, unknown> = { state: 'current' };
    Object.defineProperty(getterCurrent, 'terminalAuthority', {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error('revalidation getter must not run');
      },
    });

    for (const invalid of [hugeFlat, oversizedHold, cyclicCurrent, getterCurrent]) {
      let revalidationCount = 0;
      await expect(waitForResults(root, sprint, 250, [], {
        readTaskResultAuthority: () => exactAuthority,
        settleExactAcceptedResult: async () => valid,
        revalidateExactAcceptedResultTerminalAuthority: async () => {
          revalidationCount += 1;
          return revalidationCount === 1
            ? { state: 'current' as const, terminalAuthority: valid }
            : invalid as never;
        },
      })).rejects.toThrow(/terminal revalidation HOLD/u);
      expect(revalidationCount).toBeGreaterThanOrEqual(2);
      expect(task.status).toBe(TaskStatus.EXECUTING);
    }
    expect(getterCalls).toBe(0);
  });

  it('holds exact custody when no terminal settlement authority is supplied', async () => {
    const exact = createTaskResultSettlementV2Fixture();
    const taskId = exact.identity.taskId;
    const { root, sprint } = fixture(taskId);
    const acceptedResultRef = createExactAcceptedTaskResultRefV2(
      exact.creation.acceptedResultArtifact,
    );
    const exactAuthority = readExactAuthoritativeTaskResult<TaskResult>({
      executionMode: 'normal-docker',
      authorityKind: 'accepted-result',
      projectRoot: root,
      taskId,
      custodyStore: exact.store,
      policy: exact.policy,
      expectedIdentity: exact.identity,
      admission: exact.creation.admission,
      acceptedResultRef,
      expectedAcceptedResultChainDigest: exact.creation.acceptedResultChain.receiptDigest,
    });

    await expect(waitForResults(root, sprint, 250, [], {
      readTaskResultAuthority: () => exactAuthority,
    })).rejects.toThrow(/terminal settlement authority is required/);
  });

  it('settles a no-dispatch authority with zero attempts and no synthetic result', async () => {
    const taskId = 'collector-not-dispatched';
    const { root, tasksDir, task, sprint } = fixture(taskId);
    task.status = TaskStatus.PENDING;
    const exactAuthority = readExactAuthoritativeTaskResult<TaskResult>({
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
    });
    const evaluateCollectedResult = vi.fn(async () => 'DONE' as const);

    await expect(waitForResults(root, sprint, 250, [], {
      readTaskResultAuthority: () => exactAuthority,
      evaluateCollectedResult,
    })).resolves.toEqual([]);
    expect(evaluateCollectedResult).not.toHaveBeenCalled();
    expect(task.status).toBe(TaskStatus.PENDING);
    expect(existsSync(join(tasksDir, `task-${taskId}.result`))).toBe(false);
  });

  it('fails closed instead of reading public question bytes in normal Docker mode', async () => {
    const taskId = 'collector-exact-ipc-hold';
    const { root, tasksDir, sprint } = fixture(taskId);
    writeFileSync(join(tasksDir, `task-${taskId}.question`), JSON.stringify({
      taskId,
      workerId: `w-${taskId}`,
      question: 'public question must not become authority',
      timestamp: new Date().toISOString(),
    }), 'utf8');

    await expect(waitForResults(root, sprint, 250, [], {
      ipcExecutionMode: 'normal-docker',
    })).rejects.toThrow(/PRIVATE_RESULT_AUTHORITY_UNAVAILABLE/u);
    expect(existsSync(join(tasksDir, `task-${taskId}.answer`))).toBe(false);
  });

  it('waits past an early raw Docker DONE and collects the later host settlement', async () => {
    const taskId = 'collector-host-truth';
    const { root, tasksDir, sprint } = fixture(taskId);
    writeFileSync(
      join(tasksDir, `task-${taskId}.result`),
      JSON.stringify(result(taskId, 'DONE', 'untrusted early raw')),
      'utf-8',
    );
    writeFileSync(join(tasksDir, `task-${taskId}.timeout`), 'WORKER_TIMEOUT', 'utf-8');
    const ref = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);

    const pending = waitForResults(root, sprint, 1_000, [], {
      ipcExecutionMode: 'legacy-non-docker',
    });
    const hostResult = result(taskId, 'NO_GO', 'immutable host settlement');
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref,
      exitCode: 1,
      result: hostResult as unknown as Record<string, unknown>,
    }));
    const receiptOnly = await Promise.race([
      pending.then(() => 'resolved'),
      new Promise<string>((resolve) => setTimeout(() => resolve('pending'), 75)),
    ]);
    expect(receiptOnly).toBe('pending');
    writeTaskResultSettlementClosureAtomic(ref, {
      containerDisposition: 'stopped-removed',
      locksReleased: true,
    });

    const results = await pending;
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      taskId,
      selfAssessment: 'NO_GO',
      notes: 'immutable host settlement',
    });
  });

  it('bounded polling ignores raw Docker output until host settlement exists', async () => {
    const taskId = 'poll-host-truth';
    const { root, tasksDir } = fixture(taskId);
    writeFileSync(
      join(tasksDir, `task-${taskId}.result`),
      JSON.stringify(result(taskId, 'DONE', 'raw only')),
      'utf-8',
    );
    const ref = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);

    await expect(pollForResultFile(root, taskId, 20, 5))
      .rejects.toMatchObject({ code: 'DECKENT_E077' });

    const hostResult = result(taskId, 'NO_GO', 'settled truth');
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref,
      exitCode: 1,
      result: hostResult as unknown as Record<string, unknown>,
    }));
    await expect(pollForResultFile(root, taskId, 20, 5))
      .rejects.toMatchObject({ code: 'DECKENT_E077' });
    writeTaskResultSettlementClosureAtomic(ref, {
      containerDisposition: 'stopped-removed',
      locksReleased: true,
    });
    await expect(pollForResultFile(root, taskId, 20, 5)).resolves.toMatchObject({
      selfAssessment: 'NO_GO',
      notes: 'settled truth',
    });
  });

  it('bounded polling propagates corrupt settlement evidence instead of fabricating NO_GO', async () => {
    const taskId = 'poll-corrupt-settlement';
    const { root, tasksDir } = fixture(taskId);
    writeFileSync(
      join(tasksDir, `task-${taskId}.result`),
      JSON.stringify(result(taskId, 'DONE', 'raw fallback forbidden')),
      'utf-8',
    );
    const ref = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    writeFileSync(taskResultSettlementPath(ref), '{}', 'utf-8');

    await expect(pollForResultFile(root, taskId, 20, 5))
      .rejects.toThrow(/Corrupt host-owned Docker result settlement/);
  });

  it('repairs a malformed raw result through terminal-only reconciliation during the live wait', async () => {
    const taskId = 'collector-live-malformed';
    const { root, tasksDir, sprint } = fixture(taskId);
    writeFileSync(
      join(tasksDir, `task-${taskId}.result`),
      `${JSON.stringify(result(taskId, 'DONE', 'raw'))}\\n`,
      'utf-8',
    );
    const ref = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);

    const reconcilePendingAttempts = vi.fn(async () => {
      const hostResult = result(taskId, 'NO_GO', 'host repaired malformed raw result');
      writeTaskResultSettlementAtomic(createTaskResultSettlement({
        ref,
        exitCode: 1,
        result: hostResult as unknown as Record<string, unknown>,
      }));
      writeTaskResultSettlementClosureAtomic(ref, {
        containerDisposition: 'stopped-removed',
        locksReleased: true,
      });
      return {
        adopted: [],
        closedNotDispatched: [],
        closedAbsentAfterExit: [taskId],
        retiredLanded: [],
        resumedContinuations: [],
      };
    });
    const backend = {
      name: 'test-recovery',
      spawn: vi.fn(),
      kill: vi.fn(),
      list: vi.fn(() => []),
      isAvailable: vi.fn(async () => true),
      reconcilePendingAttempts,
    };

    const results = await waitForResults(
      root,
      sprint,
      1_000,
      [],
      { spawnBackend: backend },
    );

    expect(reconcilePendingAttempts).toHaveBeenCalledWith({ mode: 'terminal-only' });
    expect(results).toEqual([
      expect.objectContaining({
        taskId,
        selfAssessment: 'NO_GO',
        notes: 'host repaired malformed raw result',
      }),
    ]);
  });

  it('records exact IPC projection debt once without blocking private answer success', async () => {
    const exact = createTaskResultSettlementV2Fixture();
    const taskId = exact.identity.taskId;
    const { root, tasksDir, task, sprint } = fixture(taskId);
    const exactIpcCheck = vi.mocked(checkExactAttemptWorkerQuestions);
    exactIpcCheck.mockClear();
    exactIpcCheck.mockResolvedValue({
      answered: [taskId],
      pending: [],
      notDispatched: [],
      holds: [],
      projectionHolds: [
        {
          taskId,
          direction: 'answer',
          reasonCode: 'PUBLIC_ANSWER_PROJECTION_RECONCILIATION_REQUIRED',
        },
        {
          taskId,
          direction: 'answer',
          reasonCode: 'PUBLIC_ANSWER_PROJECTION_RECONCILIATION_REQUIRED',
        },
      ],
    });

    await expect(waitForResults(root, sprint, 60, [], {
      ipcExecutionMode: 'normal-docker',
      readTaskResultAuthority: () => ({
        state: 'absent',
        result: null,
        settlementRef: null,
        rawResultPath: join(tasksDir, `task-${taskId}.result`),
      }),
      resolveExactAttemptIpcAuthority: () => ({
        state: 'absent',
        identity: exact.identity,
      }),
    })).resolves.toEqual([]);

    expect(exactIpcCheck.mock.calls.length).toBeGreaterThan(1);
    const firstRegistry = exactIpcCheck.mock.calls[0]?.[3].transientRegistry;
    expect(firstRegistry).toBeDefined();
    for (const call of exactIpcCheck.mock.calls) {
      expect(call[3].transientRegistry).toBe(firstRegistry);
    }
    expect(task.status).toBe(TaskStatus.EXECUTING);
    const debtEvents = readEvents(root, sprint.id, {
      channel: EXACT_IPC_PROJECTION_HOLD_EVENT_CHANNEL,
    });
    expect(debtEvents).toHaveLength(1);
    expect(debtEvents[0]).toMatchObject({
      source: 'brain',
      target: 'auditor',
      payload: {
        schemaVersion: 1,
        kind: 'exact-ipc-compatibility-projection-hold',
        taskId,
        direction: 'answer',
        reasonCode: 'PUBLIC_ANSWER_PROJECTION_RECONCILIATION_REQUIRED',
      },
    });
  });
});
