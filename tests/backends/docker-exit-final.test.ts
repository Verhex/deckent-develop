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

vi.mock('../../src/core/constants.js', () => ({
  TASKS_DIR: '.tasks',
}));

import { spawnSync, spawn } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync, readdirSync, openSync, fsyncSync, closeSync, unlinkSync } from 'node:fs';
import { DockerSpawnBackend } from '../../src/orchestra/spawn-backend-docker.js';

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

// ─── Helpers ────────────────────────────────────────────────────────

function createMockDockerWait(): EventEmitter & { stdout: EventEmitter; stderr: EventEmitter } {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
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

  mockSpawn.mockReturnValue(waitChild as any);

  mockExistsSync.mockImplementation((path: unknown) => {
    const p = path as string;
    if (p.endsWith('.result')) return resultFileExists;
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
    return '';
  });

  mockOpenSync.mockReturnValue(42 as any);
  mockFsyncSync.mockImplementation(() => {});
  mockCloseSync.mockImplementation(() => {});
  mockReaddirSync.mockReturnValue([] as any);
  mockUnlinkSync.mockImplementation(() => {});

  return waitChild;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Docker Worker Exit Pattern Final Fix (Sprint 149)', () => {
  let backend: DockerSpawnBackend;

  beforeEach(() => {
    vi.restoreAllMocks();
    backend = new DockerSpawnBackend('/test/project', {
      image: 'test-image:latest',
      timeoutSeconds: 600,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should write fallback .result with signal_info when SIGKILL (exit 137) and no result', () => {
    const waitChild = setupSpawnMocks();

    backend.spawn('exit-137-001', 'sonnet', 'test prompt');

    // Simulate container exit with SIGKILL (137 = 128 + 9)
    waitChild.stdout.emit('data', Buffer.from('137\n'));

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

  it('should NOT write fallback .result when worker wrote result normally (exit 0)', () => {
    const waitChild = setupSpawnMocks({ resultExistsOnExit: true });

    backend.spawn('normal-001', 'sonnet', 'test prompt');

    // Normal exit
    waitChild.stdout.emit('data', Buffer.from('0\n'));

    const resultWriteCalls = mockWriteFileSync.mock.calls.filter(
      (call) => typeof call[0] === 'string' && (call[0] as string).endsWith('.result'),
    );
    expect(resultWriteCalls.length).toBe(0);
  });

  it('should handle SIGTERM gracefully — result written by container EXIT trap, host reconciles to DONE', () => {
    const waitChild = setupSpawnMocks({ resultExistsOnExit: true });

    mockReadFileSync.mockImplementation((path: unknown) => {
      if (typeof path === 'string' && path.endsWith('.result')) {
        return JSON.stringify({ selfAssessment: 'DONE', taskId: 'sigterm-001' });
      }
      return '';
    });

    backend.spawn('sigterm-001', 'sonnet', 'test prompt');

    // SIGTERM exit (143 = 128 + 15)
    waitChild.stdout.emit('data', Buffer.from('143\n'));

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

  it('should write fallback .result for OOM kill (exit 137) with signal_info', () => {
    const waitChild = setupSpawnMocks();

    backend.spawn('oom-001', 'sonnet', 'test prompt');

    // OOM kill → exit 137 (128 + 9 = SIGKILL)
    waitChild.stdout.emit('data', Buffer.from('137\n'));

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

  it('should detect partial write (corrupt .result) and overwrite with NO_GO', () => {
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

    backend.spawn('partial-001', 'sonnet', 'test prompt');

    // Container exits with error
    waitChild.stdout.emit('data', Buffer.from('1\n'));

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

    backend.spawn('kill-test-001', 'sonnet', 'test prompt');

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
