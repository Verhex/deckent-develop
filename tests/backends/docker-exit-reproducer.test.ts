import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  readdirSync: vi.fn(),
  renameSync: vi.fn(),
  rmdirSync: vi.fn(),
  openSync: vi.fn(),
  fsyncSync: vi.fn(),
  closeSync: vi.fn(),
}));

vi.mock('../../src/core/utils.js', () => ({
  debugLog: vi.fn(),
}));

vi.mock('../../src/core/task-result-settlement.js', () => {
  return import('../helpers/task-result-settlement-stub.js')
    .then(({ createTaskResultSettlementModuleStub }) => createTaskResultSettlementModuleStub());
});

vi.mock('../../src/core/execution-landing-checkpoint.js', async (importActual) => ({
  ...(await importActual<typeof import('../../src/core/execution-landing-checkpoint.js')>()),
  readExecutionLandingCheckpointByRef: vi.fn(() => null),
}));

vi.mock('../../src/orchestra/runtime-budget-monitor.js', async (importActual) => ({
  ...(await importActual<typeof import('../../src/orchestra/runtime-budget-monitor.js')>()),
  // This legacy suite owns only exit/fallback lifecycle behavior. Runtime
  // metering uses a fully mocked node:fs here and is covered by the dedicated
  // Docker budget suites, so do not advertise a fake measurable stream.
  createRuntimeBudgetMonitor: vi.fn(() => null),
}));

vi.mock('../../src/orchestra/execution-landing-coordinator.js', async (importActual) => ({
  ...(await importActual<typeof import('../../src/orchestra/execution-landing-coordinator.js')>()),
  prepareDockerExecutionLanding: vi.fn(({ prompt }: { prompt: string }) => ({ prompt, context: null })),
}));

// Spread the real constants so newly-added exports (e.g. SPRINT_ACTIVE_FILE,
// pulled in transitively by the backend's dependency graph) never break this
// mock; only TASKS_DIR is overridden to keep the sandbox deterministic.
vi.mock('../../src/core/constants.js', async (importActual) => ({
  ...(await importActual<typeof import('../../src/core/constants.js')>()),
  TASKS_DIR: '.tasks',
}));

import { spawnSync, spawn } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync, readdirSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { DockerSpawnBackend } from '../../src/orchestra/spawn-backend-docker.js';
import {
  TEST_DOCKER_EXECUTION_OPTIONS,
  budgetedDockerTaskJson,
} from '../helpers/budgeted-docker-execution-fixture.js';

const mockSpawnSync = vi.mocked(spawnSync);
const mockSpawn = vi.mocked(spawn);
const mockExistsSync = vi.mocked(existsSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockOpenSync = vi.mocked(openSync);
const mockFsyncSync = vi.mocked(fsyncSync);
const mockCloseSync = vi.mocked(closeSync);
const TEST_EXECUTION_OPTIONS = TEST_DOCKER_EXECUTION_OPTIONS;

// ─── Helpers ────────────────────────────────────────────────────────

function createMockDockerWait(): EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
} {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn(() => true);
  (child.stderr as EventEmitter & { resume: () => void }).resume = vi.fn();
  return child;
}

/**
 * Configure spawnSync/spawn mocks for a spawn+monitor lifecycle.
 * Returns the docker-wait mock child for triggering exit events.
 */
function setupSpawnMocks(opts?: { resultExistsOnExit?: boolean }): ReturnType<typeof createMockDockerWait> {
  const waitChild = createMockDockerWait();
  let resultFileExists = opts?.resultExistsOnExit ?? false;

  mockSpawnSync.mockImplementation(
    (cmd: unknown, args: unknown[]) => {
      if (cmd === 'docker' && args?.[0] === 'images') {
        return { stdout: 'abc123\n', stderr: '', status: 0, signal: null, pid: 1, output: [] } as any;
      }
      if (cmd === 'docker' && args?.[0] === 'run') {
        return { stdout: 'container-abc123\n', stderr: '', status: 0, signal: null, pid: 1, output: [] } as any;
      }
      // Docker logs — return empty
      if (cmd === 'docker' && args?.[0] === 'logs') {
        return { stdout: '', stderr: '', status: 0, signal: null, pid: 1, output: [] } as any;
      }
      return { stdout: '', stderr: '', status: 0, signal: null, pid: 1, output: [] } as any;
    },
  );

  const liveLogsChild = createMockDockerWait();
  const capturedLogsChild = createMockDockerWait();
  mockSpawn.mockImplementation((_command, args) => {
    if (args?.[0] === 'wait') return waitChild as any;
    if (args?.[0] === 'logs' && args?.[1] === '-f') return liveLogsChild as any;
    if (args?.[0] === 'logs') {
      queueMicrotask(() => capturedLogsChild.emit('close', 0, null));
      return capturedLogsChild as any;
    }
    throw new Error(`unexpected docker child subcommand: ${String(args?.[0])}`);
  });

  mockExistsSync.mockImplementation((path: unknown) => {
    const p = path as string;
    if (p.endsWith('.result')) return resultFileExists;
    if (p.endsWith('.partial-result')) return false;
    if (p.endsWith('.timeout')) return false;
    if (p.endsWith('.claude.json')) return false;
    return true;
  });

  mockWriteFileSync.mockImplementation((path: unknown) => {
    if (typeof path === 'string' && path.endsWith('.result')) {
      resultFileExists = true;
    }
  });
  mockReadFileSync.mockImplementation((path: unknown) => budgetedDockerTaskJson(path));

  mockOpenSync.mockReturnValue(42 as any);
  mockFsyncSync.mockImplementation(() => {});
  mockCloseSync.mockImplementation(() => {});
  mockReaddirSync.mockReturnValue([] as any);

  return waitChild;
}

async function finishExit(
  waitChild: ReturnType<typeof createMockDockerWait>,
  exitCode: number,
): Promise<void> {
  waitChild.stdout.emit('data', Buffer.from(`${exitCode}\n`));
  waitChild.emit('close', 0, null);
  await vi.waitFor(() => expect(mockSpawnSync.mock.calls.some(
    call => call[0] === 'docker' && call[1]?.[0] === 'rm',
  )).toBe(true));
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Docker Worker Exit Pattern — Host-Side Fallback', () => {
  let backend: DockerSpawnBackend;

  beforeEach(() => {
    vi.restoreAllMocks();
    // Bypass the host-side claude auth health-check (Sprint 194 W-AUTH A-1):
    // these tests exercise the container-exit fallback path, which only runs
    // AFTER spawn — without the bypass the pre-spawn auth gate short-circuits
    // and no container is ever launched. The bypass requires explicit Vitest
    // runtime evidence; a lone inherited DECKENT_AUTH_SKIP is not authority.
    vi.stubEnv('DECKENT_AUTH_SKIP', '1');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VITEST', 'true');
    backend = new DockerSpawnBackend('/test/project', {
      image: 'test-image:latest',
      timeoutSeconds: 600,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('should write fallback .result when container exits with SIGKILL (exit 137) and no result file', async () => {
    const waitChild = setupSpawnMocks();

    backend.spawn('test-kill-001', 'claude-sonnet-5', 'test prompt', TEST_EXECUTION_OPTIONS);

    // Simulate container exit with code 137 (SIGKILL / OOM)
    await finishExit(waitChild, 137);

    // Verify: .result was written by host-side fallback
    const resultWriteCalls = mockWriteFileSync.mock.calls.filter(
      (call) => typeof call[0] === 'string' && (call[0] as string).endsWith('.result'),
    );
    expect(resultWriteCalls.length).toBeGreaterThanOrEqual(1);

    const resultContent = resultWriteCalls[0][1] as string;
    const result = JSON.parse(resultContent);
    expect(result.selfAssessment).toBe('NO_GO');
    expect(result.exitCode).toBe(137);
    expect(result.notes).toContain('code=137');
    expect(result.taskId).toBe('test-kill-001');
  });

  it('should NOT write fallback .result when worker already wrote result (normal completion)', async () => {
    // Result already exists before container exits
    const waitChild = setupSpawnMocks({ resultExistsOnExit: true });

    backend.spawn('test-normal-001', 'claude-sonnet-5', 'test prompt', TEST_EXECUTION_OPTIONS);

    // Container exits normally
    await finishExit(waitChild, 0);

    // Verify: no fallback result write — only HB writes
    const resultWriteCalls = mockWriteFileSync.mock.calls.filter(
      (call) => {
        const path = call[0] as string;
        return typeof path === 'string' && path.endsWith('.result');
      },
    );
    expect(resultWriteCalls.length).toBe(0);
  });

  it('should handle SIGTERM gracefully — result written by container EXIT trap, no overwrite', async () => {
    // SIGTERM allows EXIT trap to run → .result written by container
    const waitChild = setupSpawnMocks({ resultExistsOnExit: true });

    // Mock reading the result file for reconciliation
    mockReadFileSync.mockImplementation((path: unknown) => {
      if (typeof path === 'string' && path.endsWith('.result')) {
        return JSON.stringify({ selfAssessment: 'DONE', taskId: 'test-sigterm-001' });
      }
      return budgetedDockerTaskJson(path);
    });

    backend.spawn('test-sigterm-001', 'claude-sonnet-5', 'test prompt', TEST_EXECUTION_OPTIONS);

    // Container exits with SIGTERM exit code (143 = 128 + 15)
    await finishExit(waitChild, 143);

    // Host monitor reads result and reconciles status to DONE
    const resultWriteCalls = mockWriteFileSync.mock.calls.filter(
      (call) => typeof call[0] === 'string' && (call[0] as string).endsWith('.result'),
    );
    // Should NOT overwrite existing result
    expect(resultWriteCalls.length).toBe(0);
  });

  it('should write fallback .result for OOM kill (exit 137) — no trap possible', async () => {
    const waitChild = setupSpawnMocks();

    backend.spawn('test-oom-001', 'claude-sonnet-5', 'test prompt', TEST_EXECUTION_OPTIONS);

    // OOM kill → exit 137
    await finishExit(waitChild, 137);

    // Verify fallback .result written
    const resultWriteCalls = mockWriteFileSync.mock.calls.filter(
      (call) => typeof call[0] === 'string' && (call[0] as string).endsWith('.result'),
    );
    expect(resultWriteCalls.length).toBeGreaterThanOrEqual(1);

    const result = JSON.parse(resultWriteCalls[0][1] as string);
    expect(result.selfAssessment).toBe('NO_GO');
    expect(result.exitCode).toBe(137);
    expect(result.workerId).toBe('docker-test-oom-001');

    // Also verify .timeout marker was written
    const timeoutWriteCalls = mockWriteFileSync.mock.calls.filter(
      (call) => typeof call[0] === 'string' && (call[0] as string).endsWith('.timeout'),
    );
    expect(timeoutWriteCalls.length).toBeGreaterThanOrEqual(1);
  });
});
