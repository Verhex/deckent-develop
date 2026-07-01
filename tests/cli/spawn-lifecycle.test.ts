/**
 * tests/cli/spawn-lifecycle.test.ts — Task 268-003 (SPAWN-LIFECYCLE)
 *
 * 1. modelEffort pass-through: the manual paths (`deckent spawn` task-json,
 *    `deckent run --model-effort`) must reach resolveReasoningEffort and emit
 *    `reasoningEffort` in the backend spawn(...) opts — mirroring the sprint
 *    path (sprint-spawner.ts). Invalid/unsupported level → no flag emitted.
 * 2. Completion status finalize: when the worker's `.result` appears, the task
 *    JSON `status` is derived from selfAssessment (DONE/GO_WITH_TECH_DEBT →
 *    DONE, NO_GO → NO_GO — ADR-045 §1 mapping) so a later spawn cannot run a
 *    duplicate worker (267-004 live evidence).
 *
 * Hermetic: tmpdir fixtures, mocked spawn backends, no real subprocess/network.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

// ─── Mocks (hoisted — only `state` from vi.hoisted may be referenced) ────────

const state = vi.hoisted(() => ({ root: '' }));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => state.root,
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../src/core/config.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return { ...actual, loadConfig: vi.fn() };
});

vi.mock('../../src/orchestra/tmux.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return { ...actual, ensureSession: vi.fn(), spawnWorker: vi.fn() };
});

vi.mock('../../src/orchestra/spawn-backend.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return { ...actual, SpawnBackendFactory: { create: vi.fn() } };
});

// ─── Imports after mocks ──────────────────────────────────────────────────────

import {
  spawnWorkerMultiProvider,
  finalizeTaskStatusFromResult,
  registerSpawn,
} from '../../src/cli/commands/spawn.js';
import { registerRun } from '../../src/cli/commands/run.js';
import { SpawnBackendFactory } from '../../src/orchestra/spawn-backend.js';
import { spawnWorker } from '../../src/orchestra/tmux.js';
import { loadConfig } from '../../src/core/config.js';
import { TaskStatus } from '../../src/core/types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTaskJson(taskId: string, overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    id: taskId,
    title: 'Lifecycle test task',
    description: 'Test description for spawn lifecycle',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-test',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function writeTaskJson(taskId: string, overrides?: Record<string, unknown>): void {
  writeFileSync(
    join(state.root, '.tasks', `task-${taskId}.json`),
    JSON.stringify(makeTaskJson(taskId, overrides), null, 2),
    'utf-8',
  );
}

function writeResult(taskId: string, selfAssessment: string): void {
  writeFileSync(
    join(state.root, '.tasks', `task-${taskId}.result`),
    JSON.stringify({
      taskId,
      filesChanged: [],
      testsPassed: selfAssessment !== 'NO_GO',
      selfAssessment,
      notes: 'test result',
      tokenUsage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, provider: 'claude', model: 'sonnet' },
    }, null, 2),
    'utf-8',
  );
}

function readTaskStatus(taskId: string): string {
  const raw = readFileSync(join(state.root, '.tasks', `task-${taskId}.json`), 'utf-8');
  return (JSON.parse(raw) as { status: string }).status;
}

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerSpawn(program);
  registerRun(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // commander exitOverride
  }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let backendSpawn: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  state.root = mkdtempSync(join(tmpdir(), 'spawn-lifecycle-'));
  mkdirSync(join(state.root, '.tasks'), { recursive: true });
  backendSpawn = vi.fn();
  vi.mocked(SpawnBackendFactory.create).mockReturnValue({ name: 'docker', spawn: backendSpawn } as never);
  // routing_engine v1 → registerRun skips the V2 routing block (kept out of scope here)
  vi.mocked(loadConfig).mockResolvedValue({ language: 'en', spawn_backend: 'docker', routing_engine: 'v2' } as never);
});

afterEach(() => {
  rmSync(state.root, { recursive: true, force: true });
  process.exitCode = undefined;
});

// ─── 1. spawnWorkerMultiProvider — modelEffort → reasoningEffort ─────────────

describe('spawnWorkerMultiProvider — modelEffort pass-through', () => {
  it('passes a valid claude level to the config backend spawn as reasoningEffort', async () => {
    await spawnWorkerMultiProvider('t-001', 'sonnet', 'prompt', state.root, {
      spawnBackend: 'docker',
      modelEffort: 'high',
    });

    expect(backendSpawn).toHaveBeenCalledWith(
      't-001', 'sonnet', 'prompt',
      expect.objectContaining({ reasoningEffort: 'high' }),
    );
  });

  it('does NOT emit reasoningEffort for an invalid level (resolveReasoningEffort gate)', async () => {
    await spawnWorkerMultiProvider('t-002', 'sonnet', 'prompt', state.root, {
      spawnBackend: 'docker',
      modelEffort: 'turbo',
    });

    expect(backendSpawn).toHaveBeenCalledOnce();
    const opts = backendSpawn.mock.calls[0]?.[3] as { reasoningEffort?: string };
    expect(opts.reasoningEffort).toBeUndefined();
  });

  it('keeps opt-in semantics: no modelEffort → reasoningEffort undefined', async () => {
    await spawnWorkerMultiProvider('t-003', 'sonnet', 'prompt', state.root, {
      spawnBackend: 'docker',
    });

    const opts = backendSpawn.mock.calls[0]?.[3] as { reasoningEffort?: string };
    expect(opts.reasoningEffort).toBeUndefined();
  });

  it('passes reasoningEffort on the tmux fallback path (no spawnBackend)', async () => {
    await spawnWorkerMultiProvider('t-004', 'sonnet', 'prompt', state.root, {
      modelEffort: 'max',
    });

    expect(spawnWorker).toHaveBeenCalledWith(
      't-004', 'sonnet', 'prompt', state.root,
      expect.objectContaining({ reasoningEffort: 'max' }),
    );
  });
});

// ─── 2. registerSpawn — task.modelEffort from the task JSON reaches spawn ────

describe('registerSpawn — task-json modelEffort path', () => {
  it('forwards task.modelEffort from the task JSON to the backend spawn', async () => {
    writeTaskJson('268-901', { modelEffort: 'high' });

    await runCommand(['spawn', '268-901']);

    expect(backendSpawn).toHaveBeenCalledOnce();
    const opts = backendSpawn.mock.calls[0]?.[3] as { reasoningEffort?: string };
    expect(opts.reasoningEffort).toBe('high');
  });

  it('emits no reasoningEffort when the task JSON has an invalid modelEffort', async () => {
    writeTaskJson('268-902', { modelEffort: 'ultra-mega' });

    await runCommand(['spawn', '268-902']);

    expect(backendSpawn).toHaveBeenCalledOnce();
    const opts = backendSpawn.mock.calls[0]?.[3] as { reasoningEffort?: string };
    expect(opts.reasoningEffort).toBeUndefined();
  });
});

// ─── 3. registerRun — --model-effort flag path ────────────────────────────────

describe('registerRun — --model-effort flag path', () => {
  it('forwards --model-effort through buildExecutionRequest to the backend spawn', async () => {
    // Simulate a blocking-style worker: write the result during spawn so the
    // run command returns immediately (no timeout wait).
    backendSpawn.mockImplementation((taskId: string) => writeResult(taskId, 'DONE'));

    await runCommand(['run', 'do a thing', '--model-effort', 'high', '--timeout', '3000']);

    expect(backendSpawn).toHaveBeenCalledOnce();
    const opts = backendSpawn.mock.calls[0]?.[3] as { reasoningEffort?: string };
    expect(opts.reasoningEffort).toBe('high');
  });

  it('emits no reasoningEffort for an invalid --model-effort level', async () => {
    backendSpawn.mockImplementation((taskId: string) => writeResult(taskId, 'DONE'));

    await runCommand(['run', 'do a thing', '--model-effort', 'turbo', '--timeout', '3000']);

    expect(backendSpawn).toHaveBeenCalledOnce();
    const opts = backendSpawn.mock.calls[0]?.[3] as { reasoningEffort?: string };
    expect(opts.reasoningEffort).toBeUndefined();
  });
});

// ─── 4. finalizeTaskStatusFromResult — selfAssessment → status mapping ───────

describe('finalizeTaskStatusFromResult — status derivation', () => {
  it('DONE result → task JSON status DONE', () => {
    writeTaskJson('268-911', { status: TaskStatus.EXECUTING });
    writeResult('268-911', 'DONE');

    const finalized = finalizeTaskStatusFromResult(state.root, '268-911');

    expect(finalized).toBe(TaskStatus.DONE);
    expect(readTaskStatus('268-911')).toBe('DONE');
  });

  it('GO_WITH_TECH_DEBT result → task JSON status DONE (ADR-045 §1 mapping)', () => {
    writeTaskJson('268-912', { status: TaskStatus.EXECUTING });
    writeResult('268-912', 'GO_WITH_TECH_DEBT');

    const finalized = finalizeTaskStatusFromResult(state.root, '268-912');

    expect(finalized).toBe(TaskStatus.DONE);
    expect(readTaskStatus('268-912')).toBe('DONE');
  });

  it('NO_GO result → task JSON status NO_GO', () => {
    writeTaskJson('268-913', { status: TaskStatus.EXECUTING });
    writeResult('268-913', 'NO_GO');

    const finalized = finalizeTaskStatusFromResult(state.root, '268-913');

    expect(finalized).toBe(TaskStatus.NO_GO);
    expect(readTaskStatus('268-913')).toBe('NO_GO');
  });

  it('missing result file → null, task JSON untouched', () => {
    writeTaskJson('268-914', { status: TaskStatus.EXECUTING });

    const finalized = finalizeTaskStatusFromResult(state.root, '268-914');

    expect(finalized).toBeNull();
    expect(readTaskStatus('268-914')).toBe('EXECUTING');
  });

  it('unknown selfAssessment → null, task JSON untouched', () => {
    writeTaskJson('268-915', { status: TaskStatus.EXECUTING });
    writeResult('268-915', 'MAYBE_LATER');

    const finalized = finalizeTaskStatusFromResult(state.root, '268-915');

    expect(finalized).toBeNull();
    expect(readTaskStatus('268-915')).toBe('EXECUTING');
  });
});

// ─── 5. registerSpawn — completion finalize (blocking-backend shape) ─────────

describe('registerSpawn — status finalize when .result appears', () => {
  it('finalizes task JSON to DONE when the worker result is DONE', async () => {
    writeTaskJson('268-921');
    // Blocking-style backend (docker): result exists by the time spawn returns.
    backendSpawn.mockImplementation((taskId: string) => writeResult(taskId, 'DONE'));

    await runCommand(['spawn', '268-921']);

    expect(readTaskStatus('268-921')).toBe('DONE');
  });

  it('finalizes task JSON to NO_GO when the worker result is NO_GO', async () => {
    writeTaskJson('268-922');
    backendSpawn.mockImplementation((taskId: string) => writeResult(taskId, 'NO_GO'));

    await runCommand(['spawn', '268-922']);

    expect(readTaskStatus('268-922')).toBe('NO_GO');
  });

  it('ignores a STALE pre-spawn result on --force respawn (mtime guard)', async () => {
    // Old run failed (NO_GO) and left its result behind; the new spawn writes
    // nothing — the stale DONE-less result must NOT flip the status.
    writeTaskJson('268-923', { status: TaskStatus.NO_GO });
    writeResult('268-923', 'DONE'); // stale artifact from a previous run
    backendSpawn.mockImplementation(() => { /* new worker still running */ });

    await runCommand(['spawn', '268-923', '--force']);

    expect(backendSpawn).toHaveBeenCalledOnce();
    // Stale result not applied: status remains NO_GO, not flipped to DONE.
    expect(readTaskStatus('268-923')).toBe('NO_GO');
  });
});
