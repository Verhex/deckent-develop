import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

const harness = vi.hoisted(() => ({
  execute: vi.fn(),
  write: vi.fn(),
  read: vi.fn(),
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  writeFileSync: harness.write,
  readFileSync: harness.read,
  createReadStream: vi.fn(),
  watch: vi.fn(),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => '/project',
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: harness.print,
  printError: harness.printError,
}));

vi.mock('../../src/core/config.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    loadConfig: vi.fn().mockResolvedValue({
      language: 'en',
      spawn_backend: 'docker',
      routing_engine: 'v3',
      execution_budget: {
        roles: { worker: { default: { maxTurns: 2 } } },
        landing: { reserve_ratio: 0.25 },
      },
    }),
    resolveDefaultModel: () => 'claude-sonnet-5',
  };
});

vi.mock('../../src/core/approval-authority-bootstrap.js', () => ({
  bootstrapApprovalAuthority: () => ({ state: 'disabled' }),
}));

vi.mock('../../src/orchestra/task-mode-runner.js', () => ({
  executeTaskIngress: harness.execute,
  readTaskIngressErrorAuthority: (error: any) => error?.taskIngressAuthority,
}));

import { registerRun } from '../../src/cli/commands/run.js';

describe('deckent run — exact attempt custody surface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    harness.execute.mockImplementation(async (input: any) => ({
      disposition: {
        kind: 'spawned',
        taskId: input.task.id,
        executionBackend: 'docker',
        provider: input.task.provider,
        exactDispatchOutcome: { kind: 'released' },
      },
      executionMode: 'normal-docker-exact',
      backend: 'docker',
      provider: input.task.provider,
      resultAuthority: {
        state: 'exact-accepted',
        result: {
          taskId: input.task.id,
          selfAssessment: 'DONE',
          filesChanged: ['src/example.ts'],
          testsPassed: true,
        },
      },
      invocation: {
        receiptRef: {
          schemaVersion: 1,
          invocationId: `test:${input.task.id}`,
          tenantId: 'local',
          projectId: 'test-project',
        },
        executionBackend: 'docker',
        transport: 'cli',
        state: 'dispatch-started',
        executionEvidenceRef: 'sha256:exact-provider-start',
        dispatchStartedAt: new Date().toISOString(),
      },
    }));
  });

  it('delegates without publishing a task and never turns worker self-assessment into DONE', async () => {
    const program = new Command();
    program.exitOverride();
    registerRun(program);

    await program.parseAsync([
      'node',
      'deckent',
      'run',
      'change one file',
      '--model',
      'claude-sonnet-5',
    ]);

    expect(harness.execute).toHaveBeenCalledOnce();
    expect(harness.execute.mock.calls[0]![0]).toMatchObject({
      projectRoot: '/project',
      transport: 'cli',
      task: { status: 'PENDING', model: 'claude-sonnet-5' },
    });
    expect(harness.write).not.toHaveBeenCalled();
    expect(harness.read).not.toHaveBeenCalled();
    expect(harness.print).toHaveBeenCalledWith(
      expect.stringContaining('terminal evaluation and settlement are still pending'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('reports zero-work receipt identity without claiming that the task started', async () => {
    harness.execute.mockImplementationOnce(async (input: any) => ({
      disposition: {
        kind: 'not-dispatched',
        taskId: input.task.id,
        reasonCode: 'EXACT_PROVIDER_START_NOT_PROVEN',
        executionMode: 'normal-docker-exact',
        executionBackend: 'docker',
      },
      executionMode: 'normal-docker-exact',
      backend: 'docker',
      provider: input.task.provider,
      invocation: {
        receiptRef: {
          schemaVersion: 1,
          invocationId: `zero:${input.task.id}`,
          tenantId: 'local',
          projectId: 'test-project',
        },
        executionBackend: 'docker',
        transport: 'cli',
        state: 'not-dispatched',
        executionMode: 'normal-docker-exact',
        reasonCode: 'EXACT_PROVIDER_START_NOT_PROVEN',
        authorityEvidenceRefs: [`sha256:${'a'.repeat(64)}`],
      },
    }));
    const program = new Command();
    program.exitOverride();
    registerRun(program);

    await program.parseAsync([
      'node', 'deckent', 'run', 'must remain zero work', '--model', 'claude-sonnet-5',
    ]);

    expect(harness.printError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('did not start'),
      }),
    );
    expect(harness.print).not.toHaveBeenCalledWith(
      expect.stringContaining('started'),
    );
    expect(harness.print).toHaveBeenCalledWith(expect.stringContaining('zero:'));
    expect(process.exitCode).toBe(1);
  });

  it('retains a durable receipt when admission throws before dispatch', async () => {
    const error = new Error('provider authority unavailable') as Error & Record<string, unknown>;
    error.taskIngressAuthority = {
      schemaVersion: 1,
      reasonCode: 'PROVIDER_EXECUTION_AUTHORITY_HOLD',
      invocation: {
        receiptRef: {
          schemaVersion: 1,
          invocationId: 'zero:admission-hold',
          tenantId: 'local',
          projectId: 'test-project',
        },
        executionBackend: 'docker',
        transport: 'cli',
        state: 'not-dispatched',
        executionMode: 'normal-docker-exact',
        reasonCode: 'PROVIDER_EXECUTION_AUTHORITY_HOLD',
      },
    };
    harness.execute.mockRejectedValueOnce(error);
    const program = new Command();
    program.exitOverride();
    registerRun(program);

    await program.parseAsync([
      'node', 'deckent', 'run', 'must retain receipt', '--model', 'claude-sonnet-5',
    ]);

    expect(harness.print).toHaveBeenCalledWith(expect.stringContaining('zero:admission-hold'));
    expect(harness.print).not.toHaveBeenCalledWith(expect.stringContaining('started'));
    expect(process.exitCode).toBe(1);
  });
});
