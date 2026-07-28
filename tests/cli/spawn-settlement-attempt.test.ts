import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const backend = vi.hoisted(() => ({ name: 'docker', spawn: vi.fn() }));

vi.mock('../../src/orchestra/spawn-backend.js', () => ({
  SpawnBackendError: class SpawnBackendError extends Error {
    constructor(message: string, public readonly backendName: string) {
      super(message);
    }
  },
  SpawnBackendFactory: {
    create: vi.fn(() => ({
      name: backend.name,
      liveUsageBudgetSupport: 'measured-stream',
      executionLandingCapability: backend.name === 'docker' ? 'checkpoint-stop' : 'unsupported',
      spawn: backend.spawn,
      kill: vi.fn(),
      list: vi.fn(() => []),
      isAvailable: vi.fn(async () => true),
    })),
  },
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
}));

import {
  finalizeTaskStatusFromSettlement,
  spawnWorkerMultiProvider,
  withTaskExecutionFence,
} from '../../src/cli/commands/spawn.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlement,
  createTaskResultSettlementRef,
  taskResultSettlementAttemptPath,
  type TaskResultSettlementRefV1,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementClosureAtomic,
} from '../../src/core/task-result-settlement.js';
import { InvocationReceiptStore } from '../../src/core/invocation-receipt-store.js';
import { openTaskSettlementAuthority } from '../../src/core/task-settlement-authority.js';
import { TEST_DOCKER_EXECUTION_OPTIONS } from '../helpers/budgeted-docker-execution-fixture.js';

const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;

afterEach(() => {
  vi.clearAllMocks();
  backend.name = 'docker';
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('spawnWorkerMultiProvider Docker settlement attempt', () => {
  it('serializes dispatch and settlement for the same task with a unique-owner fence', async () => {
    const base = mkdtempSync(join(tmpdir(), 'deckent-task-execution-fence-'));
    roots.push(base);
    const root = join(base, 'project');
    mkdirSync(root, { recursive: true });
    let releaseFirst!: () => void;
    let markEntered!: () => void;
    const firstMayExit = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });
    const firstEntered = new Promise<void>(resolve => {
      markEntered = resolve;
    });
    const first = withTaskExecutionFence(root, 'attempt-fence', 'dispatch', async () => {
      markEntered();
      await firstMayExit;
    });
    await firstEntered;

    await expect(withTaskExecutionFence(
      root,
      'attempt-fence',
      'settlement',
      () => Promise.resolve(),
    )).rejects.toThrow(/attempt-fence/u);

    releaseFirst();
    await first;
    await expect(withTaskExecutionFence(
      root,
      'attempt-fence',
      'settlement',
      () => Promise.resolve('settled'),
    )).resolves.toBe('settled');
  });

  it('refuses a later dispatch after NOT_DISPATCHED even when no Task JSON was published', async () => {
    const base = mkdtempSync(join(tmpdir(), 'deckent-task-execution-terminal-'));
    roots.push(base);
    const root = join(base, 'project');
    const tasks = join(root, '.tasks');
    mkdirSync(tasks, { recursive: true });
    process.env.DECKENT_HOME = join(base, 'host-state');
    const taskId = 'run-attempt-not-dispatched';
    const createdAt = '2026-07-27T10:00:00.000Z';
    const rawTask = JSON.stringify({ id: taskId, status: 'PENDING', createdAt });
    writeFileSync(join(tasks, `task-${taskId}.json`), rawTask, 'utf8');
    const opened = openTaskSettlementAuthority(root, {
      processProbe: {
        async inspect() {
          return { kind: 'worker-process', state: 'absent', evidenceRef: 'process:absent' };
        },
      },
      backendProbe: {
        async inspect() {
          return { kind: 'backend-attempt', state: 'absent', evidenceRef: 'backend:absent' };
        },
      },
    });
    const settlementInput = {
      tenantId: 'local',
      projectId: opened.projectId,
      taskId,
      runId: taskId,
      executionBackend: 'docker',
      rawStatus: 'PENDING',
      taskContent: rawTask,
      taskCreatedAt: createdAt,
      reasonCode: 'budget_capability_unsupported',
    } as const;
    const initial = await opened.authority.plan(settlementInput);
    await opened.authority.settleNotDispatched({
      ...settlementInput,
      apply: true,
      operatorAttestation: {
        operatorId: 'owner',
        attestedAt: '2026-07-27T12:00:00.000Z',
        reason: 'Provider dispatch never began.',
        evidenceRefs: initial.evidenceRefs,
      },
    });
    opened.close();
    rmSync(join(tasks, `task-${taskId}.json`));

    await expect(spawnWorkerMultiProvider(
      taskId,
      'claude-sonnet-5',
      'bounded prompt',
      root,
      {
        provider: 'claude',
        spawnBackend: 'docker',
        ...TEST_DOCKER_EXECUTION_OPTIONS,
      },
    )).rejects.toMatchObject({
      code: 'E_TASK_EXECUTION_ALREADY_SETTLED',
    });
    expect(backend.spawn).not.toHaveBeenCalled();
  });

  it('fails closed when historical receipts make task execution authority ambiguous', async () => {
    const base = mkdtempSync(join(tmpdir(), 'deckent-task-execution-ambiguous-'));
    roots.push(base);
    const root = join(base, 'project');
    const tasks = join(root, '.tasks');
    mkdirSync(tasks, { recursive: true });
    process.env.DECKENT_HOME = join(base, 'host-state');
    const taskId = 'run-attempt-ambiguous';
    writeFileSync(
      join(tasks, `task-${taskId}.json`),
      JSON.stringify({
        id: taskId,
        status: 'PENDING',
        createdAt: '2026-07-27T10:00:00.000Z',
      }),
      'utf8',
    );
    const opened = openTaskSettlementAuthority(root);
    const declaration = opened.authority.declareTaskExecution({
      tenantId: 'local',
      projectId: opened.projectId,
      taskId,
      runId: taskId,
      provider: 'claude',
      model: 'claude-sonnet-5',
      executionBackend: 'docker',
    });
    opened.close();
    const ledger = new InvocationReceiptStore(root);
    ledger.declare({
      ...declaration.receipt,
      invocationId: 'historical-conflicting-receipt',
      idempotencyKey: 'historical-conflicting-key',
      runId: 'historical-run',
      callId: 'historical-call',
    });
    ledger.close();

    await expect(spawnWorkerMultiProvider(
      taskId,
      'claude-sonnet-5',
      'bounded prompt',
      root,
      {
        provider: 'claude',
        spawnBackend: 'docker',
        ...TEST_DOCKER_EXECUTION_OPTIONS,
      },
    )).rejects.toMatchObject({
      code: 'E_TASK_EXECUTION_AUTHORITY_CONFLICT',
    });
    expect(backend.spawn).not.toHaveBeenCalled();
  });

  it('allows only the caller that owns the exact open invocation to dispatch', async () => {
    const base = mkdtempSync(join(tmpdir(), 'deckent-task-execution-owner-'));
    roots.push(base);
    const root = join(base, 'project');
    const tasks = join(root, '.tasks');
    mkdirSync(tasks, { recursive: true });
    process.env.DECKENT_HOME = join(base, 'host-state');
    const taskId = 'run-attempt-owner';
    writeFileSync(
      join(tasks, `task-${taskId}.json`),
      JSON.stringify({
        id: taskId,
        status: 'PENDING',
        createdAt: '2026-07-27T10:00:00.000Z',
      }),
      'utf8',
    );
    const opened = openTaskSettlementAuthority(root);
    const declaration = opened.authority.declareTaskExecution({
      tenantId: 'local',
      projectId: opened.projectId,
      taskId,
      runId: taskId,
      provider: 'claude',
      model: 'claude-sonnet-5',
      executionBackend: 'docker',
    });
    opened.close();

    await expect(spawnWorkerMultiProvider(
      taskId,
      'claude-sonnet-5',
      'bounded prompt',
      root,
      {
        provider: 'claude',
        spawnBackend: 'docker',
        executionInvocationId: declaration.receiptRef.invocationId,
        ...TEST_DOCKER_EXECUTION_OPTIONS,
      },
    )).resolves.toMatchObject({ backend: 'docker', provider: 'claude' });
    expect(backend.spawn).toHaveBeenCalledOnce();
  });

  it('durably journals the exact attempt before backend.spawn can perform provider work', async () => {
    const base = mkdtempSync(join(tmpdir(), 'deckent-spawn-attempt-'));
    roots.push(base);
    const root = join(base, 'project');
    mkdirSync(root, { recursive: true });
    process.env.DECKENT_HOME = join(base, 'host-state');

    backend.spawn.mockImplementation((_taskId, _model, _prompt, opts) => {
      expect(opts?.settlementRef).toBeDefined();
      expect(existsSync(taskResultSettlementAttemptPath(opts!.settlementRef!))).toBe(true);
      expect(opts?.hostTerminalResultContract).toEqual({
        version: 1,
        kind: 'terminal-verdict',
        protocol: 'xverify-v1',
      });
    });

    const result = await spawnWorkerMultiProvider(
      'attempt-a',
      'claude-sonnet-5',
      'bounded prompt',
      root,
      {
        provider: 'claude',
        spawnBackend: 'docker',
        ...TEST_DOCKER_EXECUTION_OPTIONS,
        hostTerminalResultContract: {
          version: 1,
          kind: 'terminal-verdict',
          protocol: 'xverify-v1',
        },
      },
    );

    expect(result.settlementRef).toBeDefined();
    expect(JSON.parse(readFileSync(
      taskResultSettlementAttemptPath(result.settlementRef!),
      'utf-8',
    ))).toMatchObject({
      taskId: 'attempt-a',
      backend: 'docker',
      state: 'pending',
    });
    expect(backend.spawn).toHaveBeenCalledOnce();
  });

  it('persists no backend attempt or provider work when the final dispatch boundary rejects', async () => {
    const base = mkdtempSync(join(tmpdir(), 'deckent-spawn-attempt-'));
    roots.push(base);
    const root = join(base, 'project');
    mkdirSync(root, { recursive: true });
    process.env.DECKENT_HOME = join(base, 'host-state');
    let boundaryRef: TaskResultSettlementRefV1 | undefined;

    await expect(spawnWorkerMultiProvider(
      'attempt-boundary-rejected',
      'claude-sonnet-5',
      'bounded prompt',
      root,
      {
        provider: 'claude',
        spawnBackend: 'docker',
        ...TEST_DOCKER_EXECUTION_OPTIONS,
        onDispatchBoundary: boundary => {
          boundaryRef = boundary.settlementRef;
          expect(boundaryRef).toBeDefined();
          expect(existsSync(taskResultSettlementAttemptPath(boundaryRef!))).toBe(false);
          throw new Error('receipt boundary rejected');
        },
      },
    )).rejects.toThrow(/receipt boundary rejected/);

    expect(boundaryRef).toBeDefined();
    expect(existsSync(taskResultSettlementAttemptPath(boundaryRef!))).toBe(false);
    expect(backend.spawn).not.toHaveBeenCalled();
  });

  it('fails before provider work when a terminal-result contract resolves to a non-settlement backend', async () => {
    const base = mkdtempSync(join(tmpdir(), 'deckent-spawn-attempt-'));
    roots.push(base);
    const root = join(base, 'project');
    mkdirSync(root, { recursive: true });
    process.env.DECKENT_HOME = join(base, 'host-state');
    backend.name = 'subprocess';

    await expect(spawnWorkerMultiProvider(
      'attempt-b',
      'claude-sonnet-5',
      'bounded prompt',
      root,
      {
        provider: 'claude',
        spawnBackend: 'subprocess',
        executionBudget: { maxTurns: 1 },
        hostTerminalResultContract: {
          version: 1,
          kind: 'terminal-verdict',
          protocol: 'xverify-v1',
        },
      },
    )).rejects.toThrow(/requires Docker settlement/);
    expect(backend.spawn).not.toHaveBeenCalled();
  });

  it('fails before host-adapter bootstrap when the adapter cannot return a settlement', async () => {
    const base = mkdtempSync(join(tmpdir(), 'deckent-spawn-attempt-'));
    roots.push(base);
    const root = join(base, 'project');
    mkdirSync(root, { recursive: true });
    process.env.DECKENT_HOME = join(base, 'host-state');

    await expect(spawnWorkerMultiProvider(
      'attempt-c',
      'qwen3.6:27b',
      'bounded prompt',
      root,
      {
        provider: 'ollama',
        executionBudget: { maxTurns: 1 },
        hostTerminalResultContract: {
          version: 1,
          kind: 'terminal-verdict',
          protocol: 'xverify-v1',
        },
      },
    )).rejects.toThrow(/host-adapter does not provide one/);
    expect(backend.spawn).not.toHaveBeenCalled();
  });

  it('routes a container-capable adapter provider to the settlement backend instead of its host adapter', async () => {
    // XVERIFY-CODEX: codex is an adapter provider AND owns a container command
    // spec, so a terminal-verdict contract must reach the settlement-capable
    // backend rather than fail as "host-adapter does not provide one".
    const base = mkdtempSync(join(tmpdir(), 'deckent-spawn-attempt-'));
    roots.push(base);
    const root = join(base, 'project');
    mkdirSync(root, { recursive: true });
    process.env.DECKENT_HOME = join(base, 'host-state');

    const result = await spawnWorkerMultiProvider(
      'attempt-codex',
      'gpt-5.6-sol',
      'bounded prompt',
      root,
      {
        provider: 'codex',
        spawnBackend: 'docker',
        ...TEST_DOCKER_EXECUTION_OPTIONS,
        hostTerminalResultContract: {
          version: 1,
          kind: 'terminal-verdict',
          protocol: 'xverify-v1',
        },
      },
    );

    expect(result.backend).toBe('docker');
    expect(result.settlementRef).toBeDefined();
    expect(backend.spawn).toHaveBeenCalledOnce();
  });

  it('keeps failing closed for a container-capable adapter provider when no backend is configured', async () => {
    const base = mkdtempSync(join(tmpdir(), 'deckent-spawn-attempt-'));
    roots.push(base);
    const root = join(base, 'project');
    mkdirSync(root, { recursive: true });
    process.env.DECKENT_HOME = join(base, 'host-state');

    await expect(spawnWorkerMultiProvider(
      'attempt-codex-nobackend',
      'gpt-5.6-sol',
      'bounded prompt',
      root,
      {
        provider: 'codex',
        executionBudget: { maxTurns: 1 },
        hostTerminalResultContract: {
          version: 1,
          kind: 'terminal-verdict',
          protocol: 'xverify-v1',
        },
      },
    )).rejects.toThrow(/host-adapter does not provide one/);
    expect(backend.spawn).not.toHaveBeenCalled();
  });

  it('projects the exact immutable receipt into task status with the real finalizer', () => {
    const base = mkdtempSync(join(tmpdir(), 'deckent-spawn-attempt-'));
    roots.push(base);
    const root = join(base, 'project');
    const tasks = join(root, '.tasks');
    mkdirSync(tasks, { recursive: true });
    process.env.DECKENT_HOME = join(base, 'host-state');
    const taskId = 'attempt-d';
    writeFileSync(join(tasks, `task-${taskId}.json`), JSON.stringify({
      id: taskId,
      status: 'PENDING',
    }), 'utf-8');
    const ref = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref,
      exitCode: 0,
      result: { taskId, selfAssessment: 'DONE', notes: 'VERDICT: CONFIRMED settled' },
    }));

    expect(finalizeTaskStatusFromSettlement(root, taskId, ref)).toBeNull();
    expect(JSON.parse(readFileSync(join(tasks, `task-${taskId}.json`), 'utf-8'))).toMatchObject({
      id: taskId,
      status: 'PENDING',
    });
    writeTaskResultSettlementClosureAtomic(ref, {
      containerDisposition: 'stopped-removed',
      locksReleased: true,
    });
    expect(finalizeTaskStatusFromSettlement(root, taskId, ref)).toBe('DONE');
    expect(JSON.parse(readFileSync(join(tasks, `task-${taskId}.json`), 'utf-8'))).toMatchObject({
      id: taskId,
      status: 'DONE',
    });
  });
});
