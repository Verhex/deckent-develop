import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

const h = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  files: new Map<string, string>(),
  taskJsonWrites: 0,
  currentTaskId: '',
  forceMismatchedResult: false,
  boundaryBackend: 'docker',
  result: null as null | Record<string, unknown>,
  spawnMode: 'result' as
    | 'result'
    | 'pre-boundary-throw'
    | 'post-boundary-throw'
    | 'no-boundary-return'
    | 'duplicate-boundary'
    | 'timeout',
  externalSpawnCount: 0,
  declare: vi.fn(),
  mark: vi.fn(),
  reject: vi.fn(),
  settle: vi.fn(),
  close: vi.fn(),
  print: vi.fn(),
  printError: vi.fn(),
  buildPrompt: vi.fn(() => 'settlement-bound prompt'),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn((path: unknown) => {
    const value = String(path);
    if (value.endsWith('.result')) return h.result !== null;
    return h.files.has(value);
  }),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn((path: unknown, value: unknown) => {
    if (String(path).endsWith('.json')) h.taskJsonWrites += 1;
    h.files.set(String(path), String(value));
  }),
  unlinkSync: vi.fn((path: unknown) => {
    h.files.delete(String(path));
  }),
  createReadStream: vi.fn(),
  watch: vi.fn(() => ({
    on: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return {
    ...actual,
    readJsonSafe: vi.fn(() => {
      if (!h.result) return null;
      return h.forceMismatchedResult
        ? h.result
        : { ...h.result, taskId: h.currentTaskId };
    }),
  };
});

vi.mock('../../src/core/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/config.js')>();
  return {
    ...actual,
    loadConfig: vi.fn(async () => h.config),
    resolveDefaultModel: vi.fn(() => 'claude-sonnet-5'),
  };
});

vi.mock('../../src/orchestra/brain.js', () => ({
  buildWorkerPrompt: h.buildPrompt,
}));

vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  resolveAgentPrompt: vi.fn(async () => ''),
  resolveSkillPrompts: vi.fn(async () => []),
}));

vi.mock('../../src/orchestra/routing-plan-adapter.js', () => ({
  routeSingleTaskV3: vi.fn(async () => ({ agentId: 'generic', skillIds: [] })),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: h.print,
  printError: h.printError,
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn(() => '/isolated-project'),
}));

vi.mock('../../src/cli/commands/spawn.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/cli/commands/spawn.js')>();
  return {
    ...actual,
    withTaskExecutionFence: vi.fn(async (
      _root: string,
      _taskId: string,
      _actor: string,
      operation: () => Promise<unknown>,
    ) => operation()),
    spawnWorkerMultiProvider: vi.fn(async (
      taskId: string,
      model: string,
      _prompt: string,
      _root: string,
      opts: {
        provider: 'claude';
        onDispatchBoundary?: (input: {
          taskId: string;
          provider: 'claude';
          model: string;
          backend: string;
          executionEvidenceRef: string;
        }) => Promise<void>;
      },
    ) => {
      if (h.spawnMode === 'pre-boundary-throw') {
        throw new Error('pre-boundary failure');
      }
      const boundary = {
        taskId,
        provider: opts.provider,
        model,
        backend: h.boundaryBackend,
        executionEvidenceRef: `worker-dispatch-boundary:${h.boundaryBackend}:${taskId}`,
      };
      if (h.spawnMode !== 'no-boundary-return') {
        await opts.onDispatchBoundary?.(boundary);
      }
      if (h.spawnMode === 'duplicate-boundary') {
        await opts.onDispatchBoundary?.(boundary);
      }
      h.externalSpawnCount += 1;
      if (h.spawnMode === 'post-boundary-throw') {
        throw new Error('post-boundary failure');
      }
      return { backend: 'docker', provider: 'claude' };
    }),
  };
});

import { unlinkSync } from 'node:fs';
import { registerRun } from '../../src/cli/commands/run.js';

function allowConfig(): Record<string, unknown> {
  return {
    language: 'en',
    worker_provider: 'claude',
    spawn_backend: 'docker',
    execution_budget: {
      roles: {
        worker: { default: { maxTurns: 3, maxTokens: 1_200 } },
      },
      landing: { reserve_ratio: 0.25 },
    },
  };
}

function receiptRef(taskId: string) {
  return {
    schemaVersion: 1 as const,
    tenantId: 'local',
    projectId: 'project-test',
    invocationId: `invocation:${taskId}`,
  };
}

function opener() {
  const opened = {
    projectId: 'project-test',
    authority: {
      declareTaskExecution: h.declare,
      markDispatchStarted: h.mark,
      settleNotDispatched: h.reject,
      settleDispatched: h.settle,
    },
    close: h.close,
  };
  return opened;
}

async function run(
  args: string[],
  runtime: Record<string, unknown> = {},
): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerRun(program, {
    attendedExecutionApprovalAuthority: {} as never,
    openTaskSettlementAuthority: opener as never,
    ...runtime,
  });
  await program.parseAsync([
    'node',
    'deckent',
    'run',
    'settlement contract',
    '--model',
    'claude-sonnet-5',
    ...args,
  ]);
}

function writtenTask(): Record<string, unknown> | undefined {
  for (const [path, raw] of h.files) {
    if (path.endsWith('.json')) return JSON.parse(raw) as Record<string, unknown>;
  }
  return undefined;
}

describe('deckent run immutable dispatch settlement', () => {
  beforeEach(() => {
    h.config = allowConfig();
    h.files.clear();
    h.taskJsonWrites = 0;
    h.currentTaskId = '';
    h.forceMismatchedResult = false;
    h.boundaryBackend = 'docker';
    h.result = {
      taskId: 'ignored-by-normalizer',
      workerId: 'worker',
      selfAssessment: 'DONE',
      testsPassed: true,
      filesChanged: [],
      notes: 'done',
    };
    h.spawnMode = 'result';
    h.externalSpawnCount = 0;
    h.declare.mockReset().mockImplementation((input: { taskId: string }) => {
      h.currentTaskId = input.taskId;
      return {
        created: true,
        receiptRef: receiptRef(input.taskId),
        receipt: { invocationId: `invocation:${input.taskId}` },
      };
    });
    h.mark.mockReset();
    h.reject.mockReset().mockImplementation(async (input: {
      taskId: string;
      rawStatus: string;
      receiptRef: ReturnType<typeof receiptRef>;
    }) => ({
      decision: 'already-settled',
      rawStatus: input.rawStatus,
      effectiveStatus: 'NOT_DISPATCHED',
      reasonCode: 'already-settled',
      evidenceRefs: ['probe:absent'],
      receiptRef: input.receiptRef,
    }));
    h.settle.mockReset().mockImplementation((input: {
      taskDisposition: 'done' | 'no_go';
    }) => ({
      decision: 'already-settled',
      rawStatus: 'PENDING',
      effectiveStatus: input.taskDisposition === 'done' ? 'DONE' : 'NO_GO',
      reasonCode: 'already-settled',
      evidenceRefs: ['result:evidence'],
      receiptRef: receiptRef('terminal'),
    }));
    h.close.mockReset();
    h.print.mockReset();
    h.printError.mockReset();
    h.buildPrompt.mockReset().mockReturnValue('settlement-bound prompt');
    vi.mocked(unlinkSync).mockClear();
    process.exitCode = undefined;
  });

  it('declares then settles a budget HOLD without Task JSON or spawn', async () => {
    h.config = { language: 'en', worker_provider: 'claude', spawn_backend: 'docker' };

    await run([]);

    expect(h.declare).toHaveBeenCalledOnce();
    expect(h.reject).toHaveBeenCalledWith(expect.objectContaining({
      reasonCode: 'budget_capability_unsupported',
      apply: true,
      taskSnapshotOrigin: 'ephemeral-memory',
      occurredAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    }));
    expect(writtenTask()).toBeUndefined();
    expect(h.externalSpawnCount).toBe(0);
    expect(h.close).toHaveBeenCalledOnce();
  });

  it('closes the authority when declaration itself fails', async () => {
    h.declare.mockImplementationOnce(() => {
      throw new Error('declaration failed');
    });

    await run([]);

    expect(h.close).toHaveBeenCalledOnce();
    expect(h.externalSpawnCount).toBe(0);
    expect(writtenTask()).toBeUndefined();
  });

  it('settles a provider-authority HOLD before routing, Task JSON, or spawn', async () => {
    await run([], {
      providerAuthority: {
        state: 'hold',
        reasonCode: 'source_resolver_unavailable',
        authorityEvidenceRef: `provider-authority:${'a'.repeat(64)}`,
        retryable: false,
        close: vi.fn(),
      },
    });

    expect(h.reject).toHaveBeenCalledWith(expect.objectContaining({
      reasonCode: 'provider_authority_rejected',
      apply: true,
    }));
    expect(writtenTask()).toBeUndefined();
    expect(h.externalSpawnCount).toBe(0);
  });

  it('settles prompt construction failure as command_build_failed', async () => {
    h.buildPrompt.mockImplementationOnce(() => {
      throw new Error('prompt failed');
    });

    await run([]);

    expect(h.reject).toHaveBeenCalledWith(expect.objectContaining({
      reasonCode: 'command_build_failed',
      taskSnapshotOrigin: 'canonical-file',
    }));
    expect(h.taskJsonWrites).toBe(1);
    expect(writtenTask()).toBeUndefined();
    expect(vi.mocked(unlinkSync)).toHaveBeenCalled();
    expect(h.externalSpawnCount).toBe(0);
  });

  it('aborts before the external side effect when dispatch marking fails', async () => {
    h.mark.mockImplementationOnce(() => {
      throw new Error('receipt write failed');
    });

    await run([]);

    expect(h.externalSpawnCount).toBe(0);
    expect(h.reject).toHaveBeenCalledWith(expect.objectContaining({
      reasonCode: 'execution_admission_rejected',
    }));
  });

  it('rejects a declared/actual backend mismatch before dispatch or provider work', async () => {
    h.boundaryBackend = 'subprocess';

    await run([]);

    expect(h.mark).not.toHaveBeenCalled();
    expect(h.externalSpawnCount).toBe(0);
    expect(h.reject).toHaveBeenCalledWith(expect.objectContaining({
      reasonCode: 'execution_admission_rejected',
    }));
    expect(h.settle).not.toHaveBeenCalled();
    expect(h.printError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('does not match boundary backend'),
      }),
    );
  });

  it('never asserts NOT_DISPATCHED after a persisted dispatch boundary', async () => {
    h.spawnMode = 'post-boundary-throw';

    await run([]);

    expect(h.mark).toHaveBeenCalledOnce();
    expect(h.externalSpawnCount).toBe(1);
    expect(h.reject).not.toHaveBeenCalled();
    expect(h.settle).not.toHaveBeenCalled();
    expect(vi.mocked(unlinkSync)).not.toHaveBeenCalled();
    expect(h.print).toHaveBeenCalledWith(
      expect.stringContaining('remains open for reconciliation'),
    );
  });

  it('localizes a backend that returns without publishing its dispatch boundary', async () => {
    h.spawnMode = 'no-boundary-return';

    await run([]);

    expect(h.reject).not.toHaveBeenCalled();
    expect(h.settle).not.toHaveBeenCalled();
    expect(vi.mocked(unlinkSync)).not.toHaveBeenCalled();
    expect(h.printError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'E_RUN_DISPATCH_BOUNDARY_MISSING',
        message: expect.stringContaining(h.currentTaskId),
      }),
    );
  });

  it('localizes and quarantines a duplicate dispatch boundary', async () => {
    h.spawnMode = 'duplicate-boundary';

    await run([]);

    expect(h.mark).toHaveBeenCalledOnce();
    expect(h.reject).not.toHaveBeenCalled();
    expect(h.settle).not.toHaveBeenCalled();
    expect(vi.mocked(unlinkSync)).not.toHaveBeenCalled();
    expect(h.printError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'E_RUN_DISPATCH_BOUNDARY_MISMATCH',
        message: expect.stringContaining(h.currentTaskId),
      }),
    );
  });

  it.each([
    ['DONE', 'done', 'accepted', 'DONE'],
    ['NO_GO', 'no_go', 'rejected', 'NO_GO'],
  ] as const)(
    'projects kept raw PENDING to effective %s through terminal receipt evidence',
    async (assessment, disposition, consumerOutcome, _effectiveStatus) => {
      h.result = {
        taskId: 'normalized-at-read',
        workerId: 'worker',
        selfAssessment: assessment,
        testsPassed: assessment === 'DONE',
        filesChanged: [],
        notes: assessment,
      };

      await run(['--keep']);

      expect(h.mark).toHaveBeenCalledOnce();
      expect(h.settle).toHaveBeenCalledWith(expect.objectContaining({
        taskDisposition: disposition,
        consumerOutcome,
      }));
      expect(writtenTask()).toMatchObject({ status: 'PENDING' });
      expect(vi.mocked(unlinkSync)).not.toHaveBeenCalled();
    },
  );

  it('keeps terminal receipt evidence content-addressed when raw files are cleaned', async () => {
    await run([]);

    expect(h.settle).toHaveBeenCalledWith(expect.objectContaining({
      evidenceRefs: expect.arrayContaining([
        expect.stringMatching(/^task-result:sha256:[a-f0-9]{64}$/),
      ]),
    }));
    expect(writtenTask()).toBeUndefined();
    expect(vi.mocked(unlinkSync)).toHaveBeenCalled();
  });

  it('keeps a timed-out dispatched receipt open for reconciliation', async () => {
    h.result = null;
    h.spawnMode = 'timeout';

    await run(['--timeout', '10']);

    expect(h.mark).toHaveBeenCalledOnce();
    expect(h.reject).not.toHaveBeenCalled();
    expect(h.settle).not.toHaveBeenCalled();
    expect(vi.mocked(unlinkSync)).not.toHaveBeenCalled();
  });

  it('quarantines a mismatched raw result identity without terminal settlement or cleanup', async () => {
    h.forceMismatchedResult = true;
    h.result = {
      taskId: 'attacker-controlled-task',
      workerId: 'worker',
      selfAssessment: 'DONE',
      testsPassed: true,
      filesChanged: [],
      notes: 'must not settle',
    };

    await run([]);

    expect(h.mark).toHaveBeenCalledOnce();
    expect(h.reject).not.toHaveBeenCalled();
    expect(h.settle).not.toHaveBeenCalled();
    expect(vi.mocked(unlinkSync)).not.toHaveBeenCalled();
    expect(h.printError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Result identity mismatch'),
      }),
    );
    expect(h.print).toHaveBeenCalledWith(
      expect.stringContaining('remains open for reconciliation'),
    );
  });
});
