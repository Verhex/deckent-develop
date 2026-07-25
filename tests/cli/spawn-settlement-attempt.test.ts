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
} from '../../src/cli/commands/spawn.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlement,
  createTaskResultSettlementRef,
  taskResultSettlementAttemptPath,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementClosureAtomic,
} from '../../src/core/task-result-settlement.js';
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
