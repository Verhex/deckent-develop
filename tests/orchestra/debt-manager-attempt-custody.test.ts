import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskAttemptCustodyIdentityV2 } from '../../src/core/task-attempt-custody-store.js';
import type { Sprint, Task, TaskResult } from '../../src/core/types.js';
import {
  SprintPhase,
  SprintStatus,
  TaskEvaluation,
  TaskStatus,
} from '../../src/core/types.js';
import type { ExactAcceptedResultTerminalAuthorityV2 } from '../../src/orchestra/exact-accepted-result-terminal-authority.js';
import type { ExactRepairSemanticEvidenceV1 } from '../../src/orchestra/repair-birth-authority.js';
import type {
  ExactAcceptedTaskResultAuthorityMetadata,
  ExactTaskResultAuthorityMetadata,
} from '../../src/orchestra/task-result-authority.js';

const spawnSyncMock = vi.hoisted(() => vi.fn());
const readFileSyncMock = vi.hoisted(() => vi.fn(() => {
  throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
}));
const writeFileSyncMock = vi.hoisted(() => vi.fn());

vi.mock('node:fs', () => ({
  readFileSync: readFileSyncMock,
  writeFileSync: writeFileSyncMock,
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  unlinkSync: vi.fn(),
  promises: {
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    appendFile: vi.fn(async () => undefined),
    access: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 0 })),
  },
}));

vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawnSync: spawnSyncMock,
}));

vi.mock('../../src/agents/worker.js', () => ({
  updateTaskStatus: vi.fn(),
  releaseAllLocks: vi.fn().mockReturnValue(0),
}));

vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => ({
    getById: vi.fn(() => null),
    getByType: vi.fn(() => []),
    insert: vi.fn(),
    upsert: vi.fn(),
    close: vi.fn(),
  })),
}));

import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { releaseAllLocks, updateTaskStatus } from '../../src/agents/worker.js';
import {
  handleCrossDependencies,
  handleEvaluation,
} from '../../src/orchestra/debt-manager.js';

const digest = (character: string): `sha256:${string}` =>
  `sha256:${character.repeat(64)}`;

function identity(taskId: string, attemptId: string): TaskAttemptCustodyIdentityV2 {
  return {
    schemaVersion: 2,
    backend: 'docker',
    projectRootSha256: 'a'.repeat(64),
    projectId: 'project-a',
    taskId,
    attemptId,
    generation: 1,
  };
}

function terminal(
  taskId: string,
  attemptId: string,
  verdict: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO',
): ExactAcceptedResultTerminalAuthorityV2 {
  const exactIdentity = identity(taskId, attemptId);
  const accepted: ExactAcceptedTaskResultAuthorityMetadata = {
    executionMode: 'normal-docker',
    identity: exactIdentity,
    admissionReceiptDigest: digest('1'),
    acceptedResultRef: {
      schemaVersion: 2,
      kind: 'task-accepted-result-v2-ref',
      identity: exactIdentity,
      artifactKey: `accepted-${attemptId}`,
      artifactReceiptDigest: digest('2'),
    },
    acceptedResultChainDigest: digest('3'),
    resultDigest: digest('4'),
  };
  const settled: ExactTaskResultAuthorityMetadata = {
    executionMode: 'normal-docker',
    identity: exactIdentity,
    admissionReceiptDigest: accepted.admissionReceiptDigest,
    settlementRef: {
      schemaVersion: 2,
      kind: 'task-result-settlement-v2-ref',
      identity: exactIdentity,
      artifactKey: `settlement-${attemptId}`,
      artifactReceiptDigest: digest('5'),
    },
    settlementDigest: digest('6'),
    resultDigest: accepted.resultDigest,
    acceptedResultChainDigest: accepted.acceptedResultChainDigest,
    evaluationChainDigest: digest('7'),
    finalizerChainDigest: digest('8'),
    evaluationArtifact: {
      artifactReceiptDigest: digest('9'),
      chainDigest: digest('7'),
      artifactSha256: digest('a'),
      byteLength: 128,
    },
    finalizerArtifact: {
      artifactReceiptDigest: digest('b'),
      chainDigest: digest('8'),
      artifactSha256: digest('c'),
      byteLength: 96,
    },
  };
  return {
    schemaVersion: 2,
    kind: 'exact-accepted-result-terminal-authority-v2',
    acceptedAuthority: accepted,
    terminalResultAuthority: settled,
    terminalDecisionAuthority: {
      schemaVersion: 2,
      kind: 'exact-task-terminal-decision-authority-v2',
      identity: exactIdentity,
      evaluationReceipt: {
        verdict,
        artifactReceiptDigest: settled.evaluationArtifact.artifactReceiptDigest,
        artifactSha256: settled.evaluationArtifact.artifactSha256,
        byteLength: settled.evaluationArtifact.byteLength,
        chainDigest: settled.evaluationChainDigest,
      },
      finalizerReceipt: {
        state: 'terminal-ready',
        artifactReceiptDigest: settled.finalizerArtifact.artifactReceiptDigest,
        artifactSha256: settled.finalizerArtifact.artifactSha256,
        byteLength: settled.finalizerArtifact.byteLength,
        chainDigest: settled.finalizerChainDigest,
      },
    },
  };
}

function evidence(): ExactRepairSemanticEvidenceV1 {
  return {
    schemaVersion: 1,
    kind: 'exact-repair-semantic-evidence-v1',
    acceptanceContractDigest: digest('d'),
    sourceEvaluationArtifactSha256: digest('a'),
    failedCriteria: [
      { criterionId: 'go-criterion-1', outcome: 'FAILED', evidenceDigest: digest('e') },
    ],
    verificationChecks: [
      { commandDigest: digest('f'), outcome: 'FAILED', evidenceDigest: digest('0') },
    ],
    effectEvidenceDigest: digest('1'),
  };
}

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'exact repair target',
    model: 'sonnet',
    effort: 'normal',
    priority: 'CRITICAL',
    reason: 'test',
    scope: {
      directories: ['src/orchestra/'],
      filesRead: ['src/orchestra/source.ts'],
      filesWrite: ['src/orchestra/target.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: 'exact', noGoCriteria: 'hold', techDebtAcceptable: 'none' },
    status: TaskStatus.NO_GO,
    sprintId: 'sprint-900',
    assignedWorker: `w-${id}`,
    createdAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function exactResult(authority: ExactAcceptedResultTerminalAuthorityV2): TaskResult {
  return {
    taskId: authority.acceptedAuthority.identity.taskId,
    workerId: `w-${authority.acceptedAuthority.identity.taskId}`,
    filesChanged: ['src/orchestra/target.ts'],
    linesAdded: 1,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: 'immutable accepted result projection',
    exactAcceptedResultAuthority: authority.acceptedAuthority,
  } as TaskResult;
}

function writtenPayload(): Record<string, any> {
  const call = vi.mocked(writeFileSync).mock.calls.at(-1);
  if (!call) throw new Error('expected a task write');
  return JSON.parse(String(call[1]));
}

beforeEach(() => {
  vi.clearAllMocks();
  spawnSyncMock.mockReturnValue({ status: 0, stdout: '' });
  writeFileSyncMock.mockImplementation(() => undefined);
  readFileSyncMock.mockImplementation(() => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
});

describe('debt-manager exact attempt custody', () => {
  it('parks an exact result when immutable repair-birth context is absent', () => {
    const failed = terminal('900-001', 'attempt-a', 'NO_GO');
    handleEvaluation('/root', task('900-001'), TaskEvaluation.NO_GO, exactResult(failed));

    expect(writeFileSync).not.toHaveBeenCalled();
    expect(updateTaskStatus).toHaveBeenLastCalledWith('/root', '900-001', TaskStatus.PAUSED);
    expect(releaseAllLocks).toHaveBeenCalledWith('/root', 'w-900-001');
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('births one no-clobber deterministic FIX only from exact terminal evidence', () => {
    const failed = terminal('900-001', 'attempt-a', 'NO_GO');
    handleEvaluation('/root', task('900-001'), TaskEvaluation.NO_GO, exactResult(failed), {
      exactRepairBirth: {
        failedTerminalAuthority: failed,
        failureDomain: 'PRODUCT_DEFECT',
        semanticEvidence: evidence(),
        lineageRootTaskId: '900-001',
      },
    });

    const payload = writtenPayload();
    expect(payload.id).toMatch(/^900-001-fix-[a-f0-9]{24}$/u);
    expect(payload.exactRepairBirthAuthority).toMatchObject({
      repairKind: 'FIX',
      failedTaskId: '900-001',
      targetTaskId: '900-001',
      childTaskId: payload.id,
    });
    expect(payload.scope).toEqual(task('900-001').scope);
    expect(vi.mocked(writeFileSync).mock.calls.at(-1)?.[2]).toEqual({
      encoding: 'utf-8',
      flag: 'wx',
    });
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('creates no child for unchanged evidence or non-product failure', () => {
    const failed = terminal('900-001', 'attempt-a', 'NO_GO');
    handleEvaluation('/root', task('900-001'), TaskEvaluation.NO_GO, exactResult(failed), {
      exactRepairBirth: {
        failedTerminalAuthority: failed,
        failureDomain: 'PRODUCT_DEFECT',
        semanticEvidence: evidence(),
        lineageRootTaskId: '900-001',
      },
    });
    const predecessor = writtenPayload().exactRepairBirthAuthority;
    vi.clearAllMocks();

    handleEvaluation('/root', task('900-001'), TaskEvaluation.NO_GO, exactResult(failed), {
      exactRepairBirth: {
        failedTerminalAuthority: failed,
        failureDomain: 'PRODUCT_DEFECT',
        semanticEvidence: evidence(),
        lineageRootTaskId: '900-001',
        predecessorRepairAuthority: predecessor,
      },
    });
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(updateTaskStatus).toHaveBeenLastCalledWith('/root', '900-001', TaskStatus.PAUSED);

    vi.clearAllMocks();
    handleEvaluation('/root', task('900-001'), TaskEvaluation.NO_GO, exactResult(failed), {
      exactRepairBirth: {
        failedTerminalAuthority: failed,
        failureDomain: 'AUTHORITY',
        semanticEvidence: evidence(),
        lineageRootTaskId: '900-001',
      },
    });
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(updateTaskStatus).toHaveBeenLastCalledWith('/root', '900-001', TaskStatus.PAUSED);
  });

  it('treats the same no-clobber receipt as idempotent and a foreign child as HOLD', () => {
    const failed = terminal('900-001', 'attempt-a', 'NO_GO');
    const policy = {
      exactRepairBirth: {
        failedTerminalAuthority: failed,
        failureDomain: 'PRODUCT_DEFECT' as const,
        semanticEvidence: evidence(),
        lineageRootTaskId: '900-001',
      },
    };
    handleEvaluation('/root', task('900-001'), TaskEvaluation.NO_GO, exactResult(failed), policy);
    const existing = writtenPayload();

    vi.clearAllMocks();
    writeFileSyncMock.mockImplementation(() => {
      throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' });
    });
    readFileSyncMock.mockReturnValue(JSON.stringify(existing));
    expect(() => handleEvaluation(
      '/root', task('900-001'), TaskEvaluation.NO_GO, exactResult(failed), policy,
    )).not.toThrow();
    const replayed = JSON.parse(String(vi.mocked(writeFileSync).mock.calls.at(-1)?.[1]));
    const { createdAt: _existingCreatedAt, ...existingExecution } = existing;
    const { createdAt: _replayedCreatedAt, ...replayedExecution } = replayed;
    expect(replayedExecution).toEqual(existingExecution);
    expect(updateTaskStatus).toHaveBeenCalledWith('/root', '900-001', TaskStatus.NO_GO);
    expect(updateTaskStatus).not.toHaveBeenCalledWith('/root', '900-001', TaskStatus.PAUSED);

    vi.clearAllMocks();
    writeFileSyncMock.mockImplementation(() => {
      throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' });
    });
    readFileSyncMock.mockReturnValue(JSON.stringify({
      ...existing,
      scope: {
        ...existing.scope,
        filesWrite: ['src/orchestra/foreign-target.ts'],
      },
    }));
    handleEvaluation('/root', task('900-001'), TaskEvaluation.NO_GO, exactResult(failed), policy);
    expect(updateTaskStatus).toHaveBeenLastCalledWith('/root', '900-001', TaskStatus.PAUSED);
    expect(releaseAllLocks).toHaveBeenCalledWith('/root', 'w-900-001');

    vi.clearAllMocks();
    writeFileSyncMock.mockImplementation(() => {
      throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' });
    });
    readFileSyncMock.mockReturnValue(JSON.stringify({
      ...existing,
      exactRepairBirthAuthority: {
        ...existing.exactRepairBirthAuthority,
        receiptDigest: digest('0'),
      },
    }));
    handleEvaluation('/root', task('900-001'), TaskEvaluation.NO_GO, exactResult(failed), policy);
    expect(updateTaskStatus).toHaveBeenLastCalledWith('/root', '900-001', TaskStatus.PAUSED);
    expect(releaseAllLocks).toHaveBeenCalledWith('/root', 'w-900-001');
  });

  it('holds exact XFIX without context and admits it only with failed and target authorities', () => {
    const dependency = task('900-000', { status: TaskStatus.DONE });
    const failedTask = task('900-001', {
      dependencies: [dependency.id],
      exactSettlementProjection: { kind: 'exact-marker' },
    } as Partial<Task>);
    const sprint = {
      id: 'sprint-900',
      number: 900,
      tasks: [dependency, failedTask],
      workers: [],
      phase: SprintPhase.FIX,
      status: SprintStatus.ACTIVE,
      startedAt: new Date(0).toISOString(),
    } as Sprint;
    const evaluations = new Map([
      [dependency.id, TaskEvaluation.DONE],
      [failedTask.id, TaskEvaluation.NO_GO],
    ]);

    expect(handleCrossDependencies('/root', sprint, evaluations)).toEqual([]);
    expect(writeFileSync).not.toHaveBeenCalled();

    const failed = terminal(failedTask.id, 'attempt-failed', 'NO_GO');
    const target = terminal(dependency.id, 'attempt-target', 'DONE');
    const born = handleCrossDependencies('/root', sprint, evaluations, {
      exactRepairBirthByFailedTaskId: new Map([[failedTask.id, {
        failedTerminalAuthority: failed,
        failureDomain: 'PRODUCT_DEFECT',
        semanticEvidence: evidence(),
        lineageRootTaskId: '900-001',
        targetTerminalAuthorities: new Map([[dependency.id, target]]),
      }]]),
    });

    expect(born).toHaveLength(1);
    expect(born[0]?.id).toMatch(/^900-001-xfix-[a-f0-9]{24}$/u);
    expect(writtenPayload().exactRepairBirthAuthority).toMatchObject({
      repairKind: 'XFIX',
      failedTaskId: failedTask.id,
      targetTaskId: dependency.id,
    });
    expect(spawnSync).not.toHaveBeenCalled();
  });
});
