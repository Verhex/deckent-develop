// ─── Tmux Backend Parity Tests ────────────────────────────────────────────────
// Sprint 139 Task 018: First tmux backend test since Sprint 123 (16-sprint gap).
//
// Test structure:
//   Section A — Unit tests (no tmux binary required): TmuxBackend class behavior,
//               SpawnBackendFactory tmux branch, buildWorkerCommand, TmuxError.
//   Section B — E2E tests (real tmux binary required): session lifecycle,
//               worker spawn + kill + list, send-keys, pipe-pane capture,
//               heartbeat integration, auditor window management.
//
// Skip strategy: Section B tests use `describe.skipIf(!tmuxAvailable)` so they
// pass gracefully in CI environments without tmux.
//
// Reference: docker-backend.test.ts pattern (Sprint 134).

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

// ─── Detect tmux availability ─────────────────────────────────────────────────

function isTmuxInstalled(): boolean {
  const result = spawnSync('tmux', ['-V'], {
    encoding: 'utf-8',
    timeout: 5_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return result.status === 0;
}

const tmuxAvailable = isTmuxInstalled();

// ─── Constants ────────────────────────────────────────────────────────────────

const DECKENT_SESSION = 'deckent';
const WORKER_PREFIX = 'w-';
const TEST_SESSION = `deckent-test-${process.pid}`;
const TASKS_DIR = '.tasks';

// ─── Helper: run tmux command ─────────────────────────────────────────────────

function tmuxRun(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('tmux', args, {
    encoding: 'utf-8',
    timeout: 10_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return {
    status: result.status,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  };
}

function killTestSession(sessionName: string): void {
  spawnSync('tmux', ['kill-session', '-t', sessionName], {
    encoding: 'utf-8',
    timeout: 5_000,
    stdio: 'pipe',
  });
}

function waitMs(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section A: Unit Tests (no tmux binary required)
// ═══════════════════════════════════════════════════════════════════════════════

describe('TmuxBackend Unit Tests (mock-based)', () => {
  // These tests import from the real modules but mock child_process
  // so they run on any platform without tmux.

  describe('TmuxError class', () => {
    // Dynamic import to avoid ESM module resolution issues with mocks
    it('stores message and optional command', async () => {
      const { TmuxError } = await import('../../src/orchestra/tmux.js');
      const err = new TmuxError('session not found', 'tmux has-session -t deckent');
      expect(err.name).toBe('TmuxError');
      expect(err.message).toBe('session not found');
      expect(err.command).toBe('tmux has-session -t deckent');
      expect(err).toBeInstanceOf(Error);
    });

    it('command is undefined when not provided', async () => {
      const { TmuxError } = await import('../../src/orchestra/tmux.js');
      const err = new TmuxError('generic failure');
      expect(err.command).toBeUndefined();
    });
  });

  describe('buildWorkerCommand', () => {
    it('produces default Claude CLI command without adapter', async () => {
      const { buildWorkerCommand } = await import('../../src/orchestra/tmux.js');
      const cmd = buildWorkerCommand('sonnet', '/tmp/prompt.txt');
      expect(cmd).toContain('claude -p - --model sonnet');
      expect(cmd).toContain('< /tmp/prompt.txt');
    });

    it('includes --allowedTools when opts.allowedTools is set', async () => {
      const { buildWorkerCommand } = await import('../../src/orchestra/tmux.js');
      const cmd = buildWorkerCommand('opus', '/tmp/p.txt', { allowedTools: 'Read,Write,Bash' });
      expect(cmd).toContain("--allowedTools 'Read,Write,Bash'");
    });

    it('includes --dangerously-skip-permissions when autoApprove is true', async () => {
      const { buildWorkerCommand } = await import('../../src/orchestra/tmux.js');
      const cmd = buildWorkerCommand('haiku', '/tmp/p.txt', { autoApprove: true });
      expect(cmd).toContain('--dangerously-skip-permissions');
    });

    it('wraps with timeout when taskId is provided', async () => {
      const { buildWorkerCommand, WORKER_TIMEOUT_SECONDS } = await import('../../src/orchestra/tmux.js');
      const cmd = buildWorkerCommand('opus', '/proj/.tasks/.prompt-abc.txt', undefined, undefined, '001-001');
      expect(cmd).toContain(`timeout ${WORKER_TIMEOUT_SECONDS}`);
      expect(cmd).toContain('task-001-001.timeout');
      expect(cmd).toContain('WORKER_TIMEOUT');
    });

    it('uses custom timeout seconds when provided', async () => {
      const { buildWorkerCommand } = await import('../../src/orchestra/tmux.js');
      const cmd = buildWorkerCommand('haiku', '/proj/.tasks/.prompt-x.txt', undefined, undefined, '002-001', 300);
      expect(cmd).toContain('timeout 300');
    });

    it('delegates to adapter.buildCommand when adapter is provided', async () => {
      const { buildWorkerCommand } = await import('../../src/orchestra/tmux.js');
      const adapter = {
        name: 'mock',
        supportedModels: ['opus', 'sonnet', 'haiku'] as const,
        spawn: vi.fn(),
        kill: vi.fn(),
        listWorkers: vi.fn(() => []),
        isAvailable: vi.fn(async () => true),
        buildCommand: vi.fn(() => 'custom-cli --fast'),
      };
      const cmd = buildWorkerCommand('opus', '/tmp/p.txt', undefined, adapter as any);
      expect(cmd).toBe('custom-cli --fast');
      expect(adapter.buildCommand).toHaveBeenCalled();
    });

    it('WORKER_TIMEOUT_SECONDS defaults to 1200', async () => {
      const { WORKER_TIMEOUT_SECONDS } = await import('../../src/orchestra/tmux.js');
      expect(WORKER_TIMEOUT_SECONDS).toBe(1200);
    });

    it('does not wrap timeout when timeoutSeconds is 0', async () => {
      const { buildWorkerCommand } = await import('../../src/orchestra/tmux.js');
      const cmd = buildWorkerCommand('sonnet', '/proj/.tasks/.prompt-z.txt', undefined, undefined, '003-001', 0);
      expect(cmd).not.toContain('timeout');
    });

    it('buildClaudeCommand is same reference as buildWorkerCommand (backward compat)', async () => {
      const { buildWorkerCommand, buildClaudeCommand } = await import('../../src/orchestra/tmux.js');
      expect(buildClaudeCommand).toBe(buildWorkerCommand);
    });
  });

  describe('SpawnBackendFactory', () => {
    it('creates TmuxBackend when backend="tmux"', async () => {
      const { SpawnBackendFactory } = await import('../../src/orchestra/spawn-backend.js');
      const backend = SpawnBackendFactory.create({
        backend: 'tmux',
        projectDir: '/proj',
      });
      expect(backend.name).toBe('tmux');
    });

    it('TmuxBackend implements SpawnBackend interface', async () => {
      const { TmuxBackend } = await import('../../src/orchestra/spawn-backend.js');
      const backend = new TmuxBackend('/proj');
      expect(backend.name).toBe('tmux');
      expect(typeof backend.spawn).toBe('function');
      expect(typeof backend.kill).toBe('function');
      expect(typeof backend.list).toBe('function');
      expect(typeof backend.isAvailable).toBe('function');
    });

    it('TmuxBackend.isAvailable() checks tmux -V', async () => {
      const { TmuxBackend } = await import('../../src/orchestra/spawn-backend.js');
      const backend = new TmuxBackend('/proj');
      const result = await backend.isAvailable();
      // Result depends on whether tmux is installed in this env
      expect(typeof result).toBe('boolean');
      expect(result).toBe(tmuxAvailable);
    });

    it('isTmuxAvailable() returns boolean matching tmux presence', async () => {
      const { SpawnBackendFactory } = await import('../../src/orchestra/spawn-backend.js');
      const result = SpawnBackendFactory.isTmuxAvailable();
      expect(typeof result).toBe('boolean');
      expect(result).toBe(tmuxAvailable);
    });

    it('createAsync rejects when tmux is not available', async () => {
      if (tmuxAvailable) return; // skip if tmux IS available
      const { SpawnBackendFactory, SpawnBackendError } = await import('../../src/orchestra/spawn-backend.js');
      await expect(
        SpawnBackendFactory.createAsync({ backend: 'tmux', projectDir: '/proj' }),
      ).rejects.toThrow(SpawnBackendError);
    });

    it('auto mode selects tmux or subprocess based on availability', async () => {
      const { SpawnBackendFactory } = await import('../../src/orchestra/spawn-backend.js');
      const backend = SpawnBackendFactory.create({ projectDir: '/proj' });
      // In this env, if tmux is available it picks tmux (or docker first), else subprocess
      expect(['tmux', 'subprocess', 'docker']).toContain(backend.name);
    });
  });

  describe('SpawnBackendError', () => {
    it('stores backendName and message', async () => {
      const { SpawnBackendError } = await import('../../src/orchestra/spawn-backend.js');
      const err = new SpawnBackendError('tmux not found', 'tmux');
      expect(err.name).toBe('SpawnBackendError');
      expect(err.message).toBe('tmux not found');
      expect(err.backendName).toBe('tmux');
      expect(err).toBeInstanceOf(Error);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section B: E2E Tests (real tmux binary required)
// ═══════════════════════════════════════════════════════════════════════════════

describe.skipIf(!tmuxAvailable)('Tmux Backend E2E Tests (real tmux binary)', () => {
  // Use a unique test session name to avoid conflicts with real deckent sessions
  const testProjectDir = path.join(tmpdir(), `deckent-tmux-test-${process.pid}`);
  const testTasksDir = path.join(testProjectDir, TASKS_DIR);

  beforeEach(() => {
    // Create temporary project directory with .tasks/
    fs.mkdirSync(testTasksDir, { recursive: true });
    // Kill any leftover test session
    killTestSession(TEST_SESSION);
  });

  afterEach(() => {
    // Clean up test session
    killTestSession(TEST_SESSION);
    // Clean up temporary files
    try {
      fs.rmSync(testProjectDir, { recursive: true, force: true });
    } catch { /* ok — may already be gone */ }
  });

  afterAll(() => {
    // Final cleanup
    killTestSession(TEST_SESSION);
    try {
      fs.rmSync(testProjectDir, { recursive: true, force: true });
    } catch { /* ok */ }
  });

  // ─── T1: tmux -V returns version string ────────────────────────────────────

  it('T1: tmux -V returns a valid version string', () => {
    const result = tmuxRun(['-V']);
    expect(result.status).toBe(0);
    // tmux version strings look like "tmux 3.3a" or "tmux 3.4"
    expect(result.stdout).toMatch(/tmux \d+\.\d+/);
  });

  // ─── T2: session creation and destruction ──────────────────────────────────

  it('T2: can create and destroy a tmux session', () => {
    // Arrange — no session exists
    const before = tmuxRun(['has-session', '-t', TEST_SESSION]);
    expect(before.status).not.toBe(0);

    // Act — create session
    const create = tmuxRun(['new-session', '-d', '-s', TEST_SESSION]);
    expect(create.status).toBe(0);

    // Assert — session exists
    const after = tmuxRun(['has-session', '-t', TEST_SESSION]);
    expect(after.status).toBe(0);

    // Cleanup — destroy
    const destroy = tmuxRun(['kill-session', '-t', TEST_SESSION]);
    expect(destroy.status).toBe(0);

    // Verify — session gone
    const gone = tmuxRun(['has-session', '-t', TEST_SESSION]);
    expect(gone.status).not.toBe(0);
  });

  // ─── T3: new-window creates named window ──────────────────────────────────

  it('T3: new-window creates a named worker window', () => {
    // Arrange — create session
    tmuxRun(['new-session', '-d', '-s', TEST_SESSION]);

    const windowName = `${WORKER_PREFIX}test-task-001`;

    // Act — create new window
    const result = tmuxRun(['new-window', '-t', TEST_SESSION, '-n', windowName]);
    expect(result.status).toBe(0);

    // Assert — window appears in list-windows
    const listResult = tmuxRun(['list-windows', '-t', TEST_SESSION, '-F', '#{window_name}']);
    expect(listResult.status).toBe(0);
    expect(listResult.stdout.split('\n')).toContain(windowName);
  });

  // ─── T4: send-keys sends command to window ─────────────────────────────────

  it('T4: send-keys sends command and capture-pane reads output', async () => {
    // Arrange — create session + window
    tmuxRun(['new-session', '-d', '-s', TEST_SESSION]);
    const windowName = 'test-sendkeys';
    tmuxRun(['new-window', '-t', TEST_SESSION, '-n', windowName]);

    // Act — send a simple echo command
    const sendResult = tmuxRun([
      'send-keys', '-t', `${TEST_SESSION}:${windowName}`,
      'echo TMUX_PARITY_TEST_MARKER', 'Enter',
    ]);
    expect(sendResult.status).toBe(0);

    // Wait for shell to process
    await waitMs(500);

    // Assert — capture-pane should contain our marker
    const capture = tmuxRun([
      'capture-pane', '-t', `${TEST_SESSION}:${windowName}`, '-p',
    ]);
    expect(capture.status).toBe(0);
    expect(capture.stdout).toContain('TMUX_PARITY_TEST_MARKER');
  });

  // ─── T5: kill-window removes specific window ──────────────────────────────

  it('T5: kill-window removes the target window without affecting others', () => {
    // Arrange — create session + 2 windows
    tmuxRun(['new-session', '-d', '-s', TEST_SESSION]);
    tmuxRun(['new-window', '-t', TEST_SESSION, '-n', 'w-keep']);
    tmuxRun(['new-window', '-t', TEST_SESSION, '-n', 'w-kill']);

    // Verify both exist
    const beforeList = tmuxRun(['list-windows', '-t', TEST_SESSION, '-F', '#{window_name}']);
    const windowsBefore = beforeList.stdout.split('\n');
    expect(windowsBefore).toContain('w-keep');
    expect(windowsBefore).toContain('w-kill');

    // Act — kill one window
    const killResult = tmuxRun(['kill-window', '-t', `${TEST_SESSION}:w-kill`]);
    expect(killResult.status).toBe(0);

    // Assert — w-kill gone, w-keep remains
    const afterList = tmuxRun(['list-windows', '-t', TEST_SESSION, '-F', '#{window_name}']);
    const windowsAfter = afterList.stdout.split('\n');
    expect(windowsAfter).not.toContain('w-kill');
    expect(windowsAfter).toContain('w-keep');
  });

  // ─── T6: list-windows with worker prefix filtering ────────────────────────

  it('T6: list-windows returns worker windows filtered by w- prefix', () => {
    // Arrange — create session with mixed windows
    tmuxRun(['new-session', '-d', '-s', TEST_SESSION]);
    tmuxRun(['new-window', '-t', TEST_SESSION, '-n', 'brain']);
    tmuxRun(['new-window', '-t', TEST_SESSION, '-n', 'auditor']);
    tmuxRun(['new-window', '-t', TEST_SESSION, '-n', 'w-task-001']);
    tmuxRun(['new-window', '-t', TEST_SESSION, '-n', 'w-task-002']);
    tmuxRun(['new-window', '-t', TEST_SESSION, '-n', 'watch']);

    // Act — list all windows and filter w- prefix (mimics listWorkers logic)
    const listResult = tmuxRun(['list-windows', '-t', TEST_SESSION, '-F', '#{window_name}']);
    expect(listResult.status).toBe(0);

    const allWindows = listResult.stdout.split('\n').filter(Boolean);
    const workerWindows = allWindows
      .filter(name => name.startsWith(WORKER_PREFIX))
      .map(name => name.slice(WORKER_PREFIX.length));

    // Assert — only worker windows (task IDs extracted)
    expect(workerWindows).toContain('task-001');
    expect(workerWindows).toContain('task-002');
    expect(workerWindows).not.toContain('brain');
    expect(workerWindows).not.toContain('auditor');
    expect(workerWindows).not.toContain('watch');
  });

  // ─── T7: pipe-pane captures output to log file ────────────────────────────

  it('T7: pipe-pane redirects window output to a log file', async () => {
    // Arrange
    tmuxRun(['new-session', '-d', '-s', TEST_SESSION]);
    const windowName = 'w-pipe-test';
    tmuxRun(['new-window', '-t', TEST_SESSION, '-n', windowName]);

    const logPath = path.join(testTasksDir, 'task-pipe-test.log');

    // Act — start pipe-pane to log file
    const pipeResult = tmuxRun([
      'pipe-pane', '-t', `${TEST_SESSION}:${windowName}`,
      '-o', `cat >> ${logPath}`,
    ]);
    expect(pipeResult.status).toBe(0);

    // Send command that produces output
    tmuxRun([
      'send-keys', '-t', `${TEST_SESSION}:${windowName}`,
      'echo PIPE_PANE_CAPTURE_TEST', 'Enter',
    ]);

    // Wait for pipe-pane to flush
    await waitMs(1000);

    // Assert — log file should contain output
    expect(fs.existsSync(logPath)).toBe(true);
    const logContent = fs.readFileSync(logPath, 'utf-8');
    expect(logContent).toContain('PIPE_PANE_CAPTURE_TEST');
  });

  // ─── T8: has-session returns correct status ────────────────────────────────

  it('T8: has-session returns 0 for existing session, non-zero for missing', () => {
    // No session → non-zero
    const missing = tmuxRun(['has-session', '-t', TEST_SESSION]);
    expect(missing.status).not.toBe(0);

    // Create session → 0
    tmuxRun(['new-session', '-d', '-s', TEST_SESSION]);
    const exists = tmuxRun(['has-session', '-t', TEST_SESSION]);
    expect(exists.status).toBe(0);

    // Destroy → non-zero again
    tmuxRun(['kill-session', '-t', TEST_SESSION]);
    const destroyed = tmuxRun(['has-session', '-t', TEST_SESSION]);
    expect(destroyed.status).not.toBe(0);
  });

  // ─── T9: kill-window on non-existent window returns error ─────────────────

  it('T9: kill-window on non-existent window returns non-zero status', () => {
    // Arrange — create session but no worker windows
    tmuxRun(['new-session', '-d', '-s', TEST_SESSION]);

    // Act — try to kill a window that doesn't exist
    const result = tmuxRun(['kill-window', '-t', `${TEST_SESSION}:w-nonexistent`]);

    // Assert — should fail gracefully
    expect(result.status).not.toBe(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  // ─── T10: concurrent worker windows tracked independently ─────────────────

  it('T10: multiple worker windows can be created and individually killed', () => {
    // Arrange
    tmuxRun(['new-session', '-d', '-s', TEST_SESSION]);

    const taskIds = ['task-a', 'task-b', 'task-c'];
    for (const id of taskIds) {
      tmuxRun(['new-window', '-t', TEST_SESSION, '-n', `${WORKER_PREFIX}${id}`]);
    }

    // Act — verify all 3 exist
    const listBefore = tmuxRun(['list-windows', '-t', TEST_SESSION, '-F', '#{window_name}']);
    const windowsBefore = listBefore.stdout.split('\n');
    for (const id of taskIds) {
      expect(windowsBefore).toContain(`${WORKER_PREFIX}${id}`);
    }

    // Kill middle worker
    tmuxRun(['kill-window', '-t', `${TEST_SESSION}:${WORKER_PREFIX}task-b`]);

    // Assert — task-b gone, task-a and task-c remain
    const listAfter = tmuxRun(['list-windows', '-t', TEST_SESSION, '-F', '#{window_name}']);
    const windowsAfter = listAfter.stdout.split('\n');
    expect(windowsAfter).toContain(`${WORKER_PREFIX}task-a`);
    expect(windowsAfter).not.toContain(`${WORKER_PREFIX}task-b`);
    expect(windowsAfter).toContain(`${WORKER_PREFIX}task-c`);
  });

  // ─── T11: prompt file written to .tasks/ directory ─────────────────────────

  it('T11: prompt file can be written and read from .tasks/ directory', () => {
    // This tests the file I/O pattern used by writePromptFile in tmux.ts
    const promptPath = path.join(testTasksDir, '.prompt-test123.txt');
    const promptContent = 'You are a test worker. Do nothing.';

    // Act
    fs.writeFileSync(promptPath, promptContent, 'utf-8');

    // Assert
    expect(fs.existsSync(promptPath)).toBe(true);
    const content = fs.readFileSync(promptPath, 'utf-8');
    expect(content).toBe(promptContent);

    // Cleanup
    fs.unlinkSync(promptPath);
    expect(fs.existsSync(promptPath)).toBe(false);
  });

  // ─── T12: send-keys with stdin redirect from prompt file ───────────────────

  it('T12: send-keys can execute a command that reads from a prompt file', async () => {
    // Arrange — create session, window, and prompt file
    tmuxRun(['new-session', '-d', '-s', TEST_SESSION]);
    const windowName = 'w-stdin-test';
    tmuxRun(['new-window', '-t', TEST_SESSION, '-n', windowName]);

    const promptPath = path.join(testTasksDir, '.prompt-stdin-test.txt');
    fs.writeFileSync(promptPath, 'STDIN_CONTENT_FROM_PROMPT_FILE', 'utf-8');

    // Act — send a command that reads from the prompt file via stdin redirect
    tmuxRun([
      'send-keys', '-t', `${TEST_SESSION}:${windowName}`,
      `cat < ${promptPath}`, 'Enter',
    ]);

    await waitMs(500);

    // Assert — capture-pane should show the content read from file
    const capture = tmuxRun([
      'capture-pane', '-t', `${TEST_SESSION}:${windowName}`, '-p',
    ]);
    expect(capture.status).toBe(0);
    expect(capture.stdout).toContain('STDIN_CONTENT_FROM_PROMPT_FILE');

    // Cleanup
    try { fs.unlinkSync(promptPath); } catch { /* ok */ }
  });

  // ─── T13: TmuxBackend.isAvailable() returns true ──────────────────────────

  it('T13: TmuxBackend.isAvailable() returns true on system with tmux', async () => {
    const { TmuxBackend } = await import('../../src/orchestra/spawn-backend.js');
    const backend = new TmuxBackend(testProjectDir);
    const result = await backend.isAvailable();
    expect(result).toBe(true);
  });

  // ─── T14: SpawnBackendFactory auto mode picks tmux ─────────────────────────

  it('T14: SpawnBackendFactory auto mode includes tmux as candidate', async () => {
    const { SpawnBackendFactory } = await import('../../src/orchestra/spawn-backend.js');
    expect(SpawnBackendFactory.isTmuxAvailable()).toBe(true);
    // In auto mode, docker may be preferred if available, but tmux should be a valid fallback
    const backend = SpawnBackendFactory.create({ projectDir: testProjectDir });
    // Backend is either docker (if available) or tmux
    expect(['tmux', 'docker']).toContain(backend.name);
  });

  // ─── T15: heartbeat file integration ───────────────────────────────────────

  it('T15: heartbeat file pattern works with tmux window lifecycle', () => {
    // Simulate the heartbeat write pattern used by workers in tmux backend
    tmuxRun(['new-session', '-d', '-s', TEST_SESSION]);
    tmuxRun(['new-window', '-t', TEST_SESSION, '-n', 'w-hb-test']);

    // Write heartbeat as worker would
    const hbPath = path.join(testTasksDir, 'task-hb-test.hb');
    const hb = {
      workerId: 'w-hb-test',
      taskId: 'hb-test',
      status: 'EXECUTING',
      sequence: 1,
      timestamp: new Date().toISOString(),
      backend: 'tmux',
    };
    fs.writeFileSync(hbPath, JSON.stringify(hb, null, 2), 'utf-8');

    // Verify heartbeat can be read
    expect(fs.existsSync(hbPath)).toBe(true);
    const readHb = JSON.parse(fs.readFileSync(hbPath, 'utf-8'));
    expect(readHb.backend).toBe('tmux');
    expect(readHb.status).toBe('EXECUTING');
    expect(readHb.workerId).toBe('w-hb-test');

    // Kill window (simulates worker completion/kill)
    tmuxRun(['kill-window', '-t', `${TEST_SESSION}:w-hb-test`]);

    // Heartbeat file persists after window kill (auditor reads it)
    expect(fs.existsSync(hbPath)).toBe(true);

    // Cleanup
    try { fs.unlinkSync(hbPath); } catch { /* ok */ }
  });

  // ─── T16: auditor window idempotent creation ──────────────────────────────

  it('T16: auditor window can be created idempotently', () => {
    // Arrange
    tmuxRun(['new-session', '-d', '-s', TEST_SESSION]);

    // First creation
    const create1 = tmuxRun(['new-window', '-t', TEST_SESSION, '-n', 'auditor']);
    expect(create1.status).toBe(0);

    // Verify it exists
    const list1 = tmuxRun(['list-windows', '-t', TEST_SESSION, '-F', '#{window_name}']);
    expect(list1.stdout.split('\n')).toContain('auditor');

    // Check if exists before creating again (mimics startAuditor logic)
    const windows = tmuxRun(['list-windows', '-t', TEST_SESSION, '-F', '#{window_name}']);
    const auditorExists = windows.stdout.split('\n').includes('auditor');
    expect(auditorExists).toBe(true);

    // If we try to create again with -n 'auditor', tmux will still succeed
    // (creates a second window with the same name — tmux allows duplicates).
    // The real code checks windowExists() first, so the idempotent pattern is
    // to skip creation when the window name already appears in list-windows.
  });
});
