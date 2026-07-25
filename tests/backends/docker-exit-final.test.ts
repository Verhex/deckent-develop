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
import { existsSync, writeFileSync, readFileSync, readdirSync, openSync, fsyncSync, closeSync, unlinkSync } from 'node:fs';
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
const mockUnlinkSync = vi.mocked(unlinkSync);
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

function setupSpawnMocks(opts?: {
  resultExistsOnExit?: boolean;
  resultCorrupt?: boolean;
}): ReturnType<typeof createMockDockerWait> {
  const waitChild = createMockDockerWait();
  let resultFileExists = opts?.resultExistsOnExit ?? false;
  const resultCorrupt = opts?.resultCorrupt ?? false;

  mockSpawnSync.mockImplementation(
    (cmd: unknown, args: unknown[]) => {
      if (cmd === 'docker' && args?.[0] === 'images') {
        return { stdout: 'abc123\n', stderr: '', status: 0, signal: null, pid: 1, output: [] } as any;
      }
      if (cmd === 'docker' && args?.[0] === 'run') {
        return { stdout: 'container-abc123\n', stderr: '', status: 0, signal: null, pid: 1, output: [] } as any;
      }
      if (cmd === 'docker' && args?.[0] === 'logs') {
        return { stdout: '', stderr: '', status: 0, signal: null, pid: 1, output: [] } as any;
      }
      if (cmd === 'docker' && args?.[0] === 'stop') {
        return { stdout: '', stderr: '', status: 0, signal: null, pid: 1, output: [] } as any;
      }
      if (cmd === 'docker' && args?.[0] === 'kill') {
        return { stdout: '', stderr: '', status: 0, signal: null, pid: 1, output: [] } as any;
      }
      if (cmd === 'docker' && args?.[0] === 'rm') {
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

  mockReadFileSync.mockImplementation((path: unknown) => {
    if (typeof path === 'string' && path.endsWith('.result') && resultCorrupt) {
      return '{"taskId":"test","selfAss'; // Truncated JSON — partial write
    }
    if (typeof path === 'string' && path.endsWith('.result') && resultFileExists) {
      return JSON.stringify({ selfAssessment: 'DONE', taskId: 'test' });
    }
    if (typeof path === 'string' && path.includes('/proc/version')) {
      return 'Linux version 6.6';
    }
    return budgetedDockerTaskJson(path);
  });

  mockOpenSync.mockReturnValue(42 as any);
  mockFsyncSync.mockImplementation(() => {});
  mockCloseSync.mockImplementation(() => {});
  mockReaddirSync.mockReturnValue([] as any);
  mockUnlinkSync.mockImplementation(() => {});

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

describe('Docker Worker Exit Pattern Final Fix (Sprint 149)', () => {
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

  it('should write fallback .result with signal_info when SIGKILL (exit 137) and no result', async () => {
    const waitChild = setupSpawnMocks();

    backend.spawn('exit-137-001', 'claude-sonnet-5', 'test prompt', TEST_EXECUTION_OPTIONS);

    // Simulate container exit with SIGKILL (137 = 128 + 9)
    await finishExit(waitChild, 137);

    const resultWriteCalls = mockWriteFileSync.mock.calls.filter(
      (call) => typeof call[0] === 'string' && (call[0] as string).endsWith('.result'),
    );
    expect(resultWriteCalls.length).toBeGreaterThanOrEqual(1);

    const result = JSON.parse(resultWriteCalls[0][1] as string);
    expect(result.selfAssessment).toBe('NO_GO');
    expect(result.exitCode).toBe(137);
    // Sprint 149: signal_info included in notes
    expect(result.notes).toContain('signal=9');
    expect(result.taskId).toBe('exit-137-001');
    // Sprint 149: tokenUsage included
    expect(result.tokenUsage).toBeDefined();
    expect(result.tokenUsage.provider).toBe('claude');
  });

  it('should NOT write fallback .result when worker wrote result normally (exit 0)', async () => {
    const waitChild = setupSpawnMocks({ resultExistsOnExit: true });

    backend.spawn('normal-001', 'claude-sonnet-5', 'test prompt', TEST_EXECUTION_OPTIONS);

    // Normal exit
    await finishExit(waitChild, 0);

    const resultWriteCalls = mockWriteFileSync.mock.calls.filter(
      (call) => typeof call[0] === 'string' && (call[0] as string).endsWith('.result'),
    );
    expect(resultWriteCalls.length).toBe(0);
  });

  it('should handle SIGTERM gracefully — result written by container EXIT trap, host reconciles to DONE', async () => {
    const waitChild = setupSpawnMocks({ resultExistsOnExit: true });

    mockReadFileSync.mockImplementation((path: unknown) => {
      if (typeof path === 'string' && path.endsWith('.result')) {
        return JSON.stringify({ selfAssessment: 'DONE', taskId: 'sigterm-001' });
      }
      return budgetedDockerTaskJson(path);
    });

    backend.spawn('sigterm-001', 'claude-sonnet-5', 'test prompt', TEST_EXECUTION_OPTIONS);

    // SIGTERM exit (143 = 128 + 15)
    await finishExit(waitChild, 143);

    // No fallback result written — container's EXIT trap handled it
    const resultWriteCalls = mockWriteFileSync.mock.calls.filter(
      (call) => typeof call[0] === 'string' && (call[0] as string).endsWith('.result'),
    );
    expect(resultWriteCalls.length).toBe(0);

    // Heartbeat should show DONE (reconciled from .result)
    const hbWriteCalls = mockWriteFileSync.mock.calls.filter(
      (call) => typeof call[0] === 'string' && (call[0] as string).endsWith('.hb'),
    );
    const lastHb = hbWriteCalls[hbWriteCalls.length - 1];
    if (lastHb) {
      const hbData = JSON.parse(lastHb[1] as string);
      expect(hbData.status).toBe('DONE');
    }
  });

  it('should write fallback .result for OOM kill (exit 137) with signal_info', async () => {
    const waitChild = setupSpawnMocks();

    backend.spawn('oom-001', 'claude-sonnet-5', 'test prompt', TEST_EXECUTION_OPTIONS);

    // OOM kill → exit 137 (128 + 9 = SIGKILL)
    await finishExit(waitChild, 137);

    const resultWriteCalls = mockWriteFileSync.mock.calls.filter(
      (call) => typeof call[0] === 'string' && (call[0] as string).endsWith('.result'),
    );
    expect(resultWriteCalls.length).toBeGreaterThanOrEqual(1);

    const result = JSON.parse(resultWriteCalls[0][1] as string);
    expect(result.selfAssessment).toBe('NO_GO');
    expect(result.exitCode).toBe(137);
    expect(result.notes).toContain('signal=9');
    expect(result.workerId).toBe('docker-oom-001');
    expect(result.tokenUsage).toBeDefined();
    expect(result.tokenUsage.inputTokens).toBe(0);
    expect(result.tokenUsage.cacheReadTokens).toBe(0);
  });

  it('should detect partial write (corrupt .result) and overwrite with NO_GO', async () => {
    // .result exists but contains truncated/corrupt JSON
    const waitChild = setupSpawnMocks({ resultExistsOnExit: true, resultCorrupt: true });

    // Track whether .result was unlinked — so existsSync reflects reality
    let resultDeleted = false;
    mockUnlinkSync.mockImplementation((path: unknown) => {
      if (typeof path === 'string' && path.endsWith('.result')) {
        resultDeleted = true;
      }
    });

    // Override existsSync to respect unlink state
    mockExistsSync.mockImplementation((path: unknown) => {
      const p = path as string;
      if (p.endsWith('.result')) return !resultDeleted;
      if (p.endsWith('.partial-result')) return false;
      if (p.endsWith('.timeout')) return false;
      if (p.endsWith('.claude.json')) return false;
      return true;
    });

    // Override writeFileSync to re-mark result as existing
    mockWriteFileSync.mockImplementation((path: unknown) => {
      if (typeof path === 'string' && path.endsWith('.result')) {
        resultDeleted = false;
      }
    });

    backend.spawn('partial-001', 'claude-sonnet-5', 'test prompt', TEST_EXECUTION_OPTIONS);

    // Container exits with error
    await finishExit(waitChild, 1);

    // Partial write detection: unlinkSync called to remove corrupt file
    const unlinkCalls = mockUnlinkSync.mock.calls.filter(
      (call) => typeof call[0] === 'string' && (call[0] as string).endsWith('.result'),
    );
    expect(unlinkCalls.length).toBeGreaterThanOrEqual(1);

    // Then fallback .result should be written
    const resultWriteCalls = mockWriteFileSync.mock.calls.filter(
      (call) => typeof call[0] === 'string' && (call[0] as string).endsWith('.result'),
    );
    expect(resultWriteCalls.length).toBeGreaterThanOrEqual(1);

    const result = JSON.parse(resultWriteCalls[0][1] as string);
    expect(result.selfAssessment).toBe('NO_GO');
  });

  it('should use docker stop --time=15 and fallback to SIGTERM (not SIGKILL) in kill()', () => {
    const waitChild = setupSpawnMocks();

    backend.spawn('kill-test-001', 'claude-sonnet-5', 'test prompt', TEST_EXECUTION_OPTIONS);

    // Make docker stop fail so fallback triggers
    mockSpawnSync.mockImplementation((cmd: unknown, args: unknown[]) => {
      if (cmd === 'docker' && args?.[0] === 'stop') {
        return { stdout: '', stderr: 'container not found', status: 1, signal: null, pid: 1, output: [] } as any;
      }
      return { stdout: '', stderr: '', status: 0, signal: null, pid: 1, output: [] } as any;
    });

    // Also mock existsSync to return false for .result during polling
    mockExistsSync.mockReturnValue(false);

    backend.kill('kill-test-001');

    // Verify docker stop was called with --time=15
    const stopCalls = mockSpawnSync.mock.calls.filter(
      (call) => call[0] === 'docker' && (call[1] as string[])?.[0] === 'stop',
    );
    expect(stopCalls.length).toBeGreaterThanOrEqual(1);
    expect(stopCalls[0][1]).toContain('--time=15');

    // Verify fallback uses --signal=SIGTERM (not bare docker kill = SIGKILL)
    const killCalls = mockSpawnSync.mock.calls.filter(
      (call) => call[0] === 'docker' && (call[1] as string[])?.[0] === 'kill',
    );
    expect(killCalls.length).toBeGreaterThanOrEqual(1);
    expect(killCalls[0][1]).toContain('--signal=SIGTERM');
  });
});
