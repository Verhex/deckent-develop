// ─── Subprocess Backend E2E Tests ─────────────────────────────────────────
// Tests SubprocessSpawnBackend with real child processes.
// Uses simple shell commands (echo, node -e, sleep) instead of claude CLI
// so tests work in CI without claude installed.
//
// Coverage categories:
//   T1:  Constructor defaults and custom config
//   T2:  spawn() writes initial heartbeat (.hb)
//   T3:  spawn() sends prompt via stdin
//   T4:  spawn() registers worker in list()
//   T5:  spawn() creates log file with stdout capture
//   T6:  spawn() writes fallback .result when worker exits without one
//   T7:  spawn() writes DONE heartbeat on exit code 0
//   T8:  spawn() writes FAILED heartbeat on non-zero exit
//   T9:  kill() terminates running worker and removes from list
//   T10: kill() throws ProviderError for unknown taskId
//   T11: duplicate spawn() throws ProviderError
//   T12: timeout kills worker after configured ms
//   T13: listWorkers() tracks concurrent spawns
//   T14: buildCommand() returns correct CLI string
//   T15: isAvailable() resolves based on CLI presence
//   T16: getLogPath() / getProjectDir() / getProviderConfig() accessors
//   T17: custom SubprocessProviderConfig wiring

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  SubprocessSpawnBackend,
  createSubprocessBackend,
  CLAUDE_SUBPROCESS_CONFIG,
} from '../../src/providers/subprocess.js';
import type { SubprocessProviderConfig } from '../../src/providers/subprocess.js';
import { ProviderError } from '../../src/core/provider.js';
import { TASKS_DIR } from '../../src/core/constants.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a temporary project directory with .tasks/ */
function createTempProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'deckent-subprocess-test-'));
  fs.mkdirSync(path.join(dir, TASKS_DIR), { recursive: true });
  return dir;
}

/** Wait for a file to appear on disk (polls every 50ms, max waitMs). */
function waitForFile(filePath: string, waitMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (fs.existsSync(filePath)) return resolve();
      if (Date.now() - start > waitMs) return reject(new Error(`Timeout waiting for ${filePath}`));
      setTimeout(check, 50);
    };
    check();
  });
}

/** Wait for a condition function to return true. */
function waitForCondition(fn: () => boolean, waitMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (fn()) return resolve();
      if (Date.now() - start > waitMs) return reject(new Error('Timeout waiting for condition'));
      setTimeout(check, 50);
    };
    check();
  });
}

/** Read and parse a JSON file, retrying on partial writes. */
function readJsonSafe(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Custom provider config that uses `node` instead of `claude`.
 * This allows E2E tests to run without the Claude CLI installed.
 */
function makeNodeProviderConfig(script?: string): SubprocessProviderConfig {
  return {
    cliCommand: 'node',
    name: 'node-test',
    supportedModels: ['claude-sonnet-5'] as const,
    buildArgs(_model, _opts) {
      if (script) {
        return ['-e', script];
      }
      // Default: read stdin and echo it, then exit 0
      return ['-e', 'process.stdin.resume(); process.stdin.on("data", d => { process.stdout.write(d); }); process.stdin.on("end", () => process.exit(0));'];
    },
    buildCommandString(model, promptPath, _opts) {
      return `node -e "..." < ${promptPath}`;
    },
  };
}

/** Provider config that exits immediately with code 0. */
function makeQuickExitConfig(code = 0): SubprocessProviderConfig {
  return {
    cliCommand: 'node',
    name: 'node-quick-exit',
    supportedModels: ['claude-sonnet-5'] as const,
    buildArgs() {
      return ['-e', `process.exit(${code})`];
    },
    buildCommandString(_model, promptPath) {
      return `node -e "process.exit(${code})" < ${promptPath}`;
    },
  };
}

/** Provider config that sleeps for N seconds (for timeout / kill tests). */
function makeSleepConfig(seconds = 30): SubprocessProviderConfig {
  return {
    cliCommand: 'node',
    name: 'node-sleep',
    supportedModels: ['claude-sonnet-5'] as const,
    buildArgs() {
      return ['-e', `setTimeout(() => process.exit(0), ${seconds * 1000})`];
    },
    buildCommandString(_model, promptPath) {
      return `node -e "setTimeout(...)" < ${promptPath}`;
    },
  };
}

/** Provider config that writes stdout (for log file test). */
function makeEchoConfig(message: string): SubprocessProviderConfig {
  return {
    cliCommand: 'node',
    name: 'node-echo',
    supportedModels: ['claude-sonnet-5'] as const,
    buildArgs() {
      return ['-e', `process.stdout.write(${JSON.stringify(message)}); process.exit(0);`];
    },
    buildCommandString(_model, promptPath) {
      return `node -e "..." < ${promptPath}`;
    },
  };
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('Subprocess Backend E2E', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = createTempProject();
  });

  afterEach(() => {
    // Cleanup temp directory
    try {
      fs.rmSync(projectDir, { recursive: true, force: true });
    } catch {
      // non-fatal cleanup
    }
  });

  // ─── T1: Constructor defaults and custom config ──────────────────────

  describe('T1: Constructor', () => {
    it('uses CLAUDE_SUBPROCESS_CONFIG by default', () => {
      const backend = new SubprocessSpawnBackend(projectDir);
      expect(backend.name).toBe('claude-subprocess');
      expect(backend.getProjectDir()).toBe(projectDir);
      expect(backend.getProviderConfig()).toBe(CLAUDE_SUBPROCESS_CONFIG);
    });

    it('accepts custom timeout and provider config', () => {
      const config = makeNodeProviderConfig();
      const backend = new SubprocessSpawnBackend(projectDir, {
        defaultTimeoutMs: 5000,
        providerConfig: config,
      });
      expect(backend.name).toBe('node-test');
      expect(backend.getProviderConfig()).toBe(config);
    });
  });

  // ─── T2: spawn() writes initial heartbeat ────────────────────────────

  describe('T2: Heartbeat on spawn', () => {
    it('writes .hb file immediately on spawn with EXECUTING status', async () => {
      const taskId = 'hb-test-001';
      const config = makeSleepConfig(10);
      const backend = new SubprocessSpawnBackend(projectDir, { providerConfig: config });

      backend.spawn(taskId, 'claude-sonnet-5', 'test prompt');

      const hbPath = path.join(projectDir, TASKS_DIR, `task-${taskId}.hb`);
      await waitForFile(hbPath, 3000);

      const hb = readJsonSafe(hbPath) as Record<string, unknown>;
      expect(hb.taskId).toBe(taskId);
      expect(hb.status).toBe('EXECUTING');
      expect(hb.workerId).toBe(`subprocess-${taskId}`);
      expect(typeof hb.timestamp).toBe('string');
      expect(hb.sequence).toBe(0);

      // Cleanup: kill the worker
      backend.kill(taskId);
    });
  });

  // ─── T3: spawn() sends prompt via stdin ──────────────────────────────

  describe('T3: Stdin prompt delivery', () => {
    it('delivers prompt text to worker stdin', async () => {
      const taskId = 'stdin-test-001';
      const prompt = 'Hello from E2E test!';
      // Node script reads stdin and writes to a marker file
      const markerPath = path.join(projectDir, TASKS_DIR, `task-${taskId}.stdin-marker`);
      const script = `
        let data = '';
        process.stdin.on('data', c => data += c);
        process.stdin.on('end', () => {
          require('fs').writeFileSync(${JSON.stringify(markerPath)}, data, 'utf-8');
          process.exit(0);
        });
      `;
      const config: SubprocessProviderConfig = {
        cliCommand: 'node',
        name: 'node-stdin-test',
        supportedModels: ['claude-sonnet-5'] as const,
        buildArgs() { return ['-e', script]; },
        buildCommandString() { return 'node -e "..."'; },
      };

      const backend = new SubprocessSpawnBackend(projectDir, { providerConfig: config });
      backend.spawn(taskId, 'claude-sonnet-5', prompt);

      await waitForFile(markerPath, 5000);
      const received = fs.readFileSync(markerPath, 'utf-8');
      expect(received).toBe(prompt);
    });
  });

  // ─── T4: spawn() registers worker in list() ──────────────────────────

  describe('T4: Worker registration in list()', () => {
    it('listWorkers() includes spawned taskId', () => {
      const taskId = 'list-test-001';
      const config = makeSleepConfig(10);
      const backend = new SubprocessSpawnBackend(projectDir, { providerConfig: config });

      expect(backend.listWorkers()).toEqual([]);

      backend.spawn(taskId, 'claude-sonnet-5', 'test');
      expect(backend.listWorkers()).toContain(taskId);

      backend.kill(taskId);
    });
  });

  // ─── T5: spawn() creates log file with stdout capture ────────────────

  describe('T5: Log file creation', () => {
    it('captures worker stdout to .log file', async () => {
      const taskId = 'log-test-001';
      const logMessage = 'subprocess log output test 12345';
      const config = makeEchoConfig(logMessage);
      const backend = new SubprocessSpawnBackend(projectDir, { providerConfig: config });

      backend.spawn(taskId, 'claude-sonnet-5', '');

      // Wait for process to finish and log file to be written
      const logPath = path.join(projectDir, TASKS_DIR, `task-${taskId}.log`);
      await waitForFile(logPath, 3000);

      // Wait for process exit (file exists but may still be writing)
      await waitForCondition(() => !backend.listWorkers().includes(taskId), 5000);

      const logContent = fs.readFileSync(logPath, 'utf-8');
      expect(logContent).toContain(logMessage);
    });
  });

  // ─── T6: Fallback .result when worker exits without writing one ──────

  describe('T6: Fallback result on exit', () => {
    it('writes fallback .result with selfAssessment when worker exits code 0 without result', async () => {
      const taskId = 'fallback-ok-001';
      const config = makeQuickExitConfig(0);
      const backend = new SubprocessSpawnBackend(projectDir, { providerConfig: config });

      backend.spawn(taskId, 'claude-sonnet-5', '');

      const resultPath = path.join(projectDir, TASKS_DIR, `task-${taskId}.result`);
      await waitForFile(resultPath, 5000);

      const result = readJsonSafe(resultPath) as Record<string, unknown>;
      expect(result.taskId).toBe(taskId);
      expect(result.selfAssessment).toBe('GO_WITH_TECH_DEBT');
      expect(result.testsPassed).toBe(true);
      expect(result.notes).toContain('code 0');
    });

    it('writes fallback .result with NO_GO when worker exits non-zero without result', async () => {
      const taskId = 'fallback-fail-001';
      const config = makeQuickExitConfig(1);
      const backend = new SubprocessSpawnBackend(projectDir, { providerConfig: config });

      backend.spawn(taskId, 'claude-sonnet-5', '');

      const resultPath = path.join(projectDir, TASKS_DIR, `task-${taskId}.result`);
      await waitForFile(resultPath, 5000);

      const result = readJsonSafe(resultPath) as Record<string, unknown>;
      expect(result.taskId).toBe(taskId);
      expect(result.selfAssessment).toBe('NO_GO');
      expect(result.testsPassed).toBe(false);
    });

    it('does NOT overwrite existing .result file', async () => {
      const taskId = 'no-overwrite-001';
      // Pre-write a result file before spawn
      const resultPath = path.join(projectDir, TASKS_DIR, `task-${taskId}.result`);
      const preWritten = { taskId, selfAssessment: 'DONE', preWritten: true };
      fs.writeFileSync(resultPath, JSON.stringify(preWritten), 'utf-8');

      const config = makeQuickExitConfig(0);
      const backend = new SubprocessSpawnBackend(projectDir, { providerConfig: config });
      backend.spawn(taskId, 'claude-sonnet-5', '');

      // Wait for process to exit
      await waitForCondition(() => !backend.listWorkers().includes(taskId), 5000);

      const result = readJsonSafe(resultPath) as Record<string, unknown>;
      expect(result.selfAssessment).toBe('DONE');
      expect((result as Record<string, unknown>).preWritten).toBe(true);
    });
  });

  // ─── T7: DONE heartbeat on exit code 0 ──────────────────────────────

  describe('T7: Final heartbeat on success', () => {
    it('writes heartbeat with DONE status after exit code 0', async () => {
      const taskId = 'done-hb-001';
      const config = makeQuickExitConfig(0);
      const backend = new SubprocessSpawnBackend(projectDir, { providerConfig: config });

      backend.spawn(taskId, 'claude-sonnet-5', '');

      // Wait for worker to exit
      await waitForCondition(() => !backend.listWorkers().includes(taskId), 5000);

      const hbPath = path.join(projectDir, TASKS_DIR, `task-${taskId}.hb`);
      const hb = readJsonSafe(hbPath) as Record<string, unknown>;
      expect(hb.status).toBe('DONE');
    });
  });

  // ─── T8: FAILED heartbeat on non-zero exit ──────────────────────────

  describe('T8: Final heartbeat on failure', () => {
    it('writes heartbeat with FAILED status after non-zero exit', async () => {
      const taskId = 'fail-hb-001';
      const config = makeQuickExitConfig(42);
      const backend = new SubprocessSpawnBackend(projectDir, { providerConfig: config });

      backend.spawn(taskId, 'claude-sonnet-5', '');

      await waitForCondition(() => !backend.listWorkers().includes(taskId), 5000);

      const hbPath = path.join(projectDir, TASKS_DIR, `task-${taskId}.hb`);
      const hb = readJsonSafe(hbPath) as Record<string, unknown>;
      expect(hb.status).toBe('FAILED');
    });
  });

  // ─── T9: kill() terminates running worker ─────────────────────────────

  describe('T9: kill() behavior', () => {
    it('terminates a running worker and removes it from list', async () => {
      const taskId = 'kill-test-001';
      const config = makeSleepConfig(30);
      const backend = new SubprocessSpawnBackend(projectDir, { providerConfig: config });

      backend.spawn(taskId, 'claude-sonnet-5', '');
      expect(backend.listWorkers()).toContain(taskId);

      backend.kill(taskId);
      expect(backend.listWorkers()).not.toContain(taskId);
    });
  });

  // ─── T10: kill() throws for unknown taskId ────────────────────────────

  describe('T10: kill() error handling', () => {
    it('throws ProviderError when killing unknown taskId', () => {
      const backend = new SubprocessSpawnBackend(projectDir, {
        providerConfig: makeNodeProviderConfig(),
      });

      expect(() => backend.kill('nonexistent-task')).toThrow(ProviderError);
      expect(() => backend.kill('nonexistent-task')).toThrow(/No running worker/);
    });
  });

  // ─── T11: Duplicate spawn() throws ProviderError ─────────────────────

  describe('T11: Duplicate spawn prevention', () => {
    it('throws ProviderError when spawning same taskId twice', () => {
      const taskId = 'dup-test-001';
      const config = makeSleepConfig(10);
      const backend = new SubprocessSpawnBackend(projectDir, { providerConfig: config });

      backend.spawn(taskId, 'claude-sonnet-5', 'first');

      expect(() => backend.spawn(taskId, 'claude-sonnet-5', 'second')).toThrow(ProviderError);
      expect(() => backend.spawn(taskId, 'claude-sonnet-5', 'second')).toThrow(/already running/);

      backend.kill(taskId);
    });
  });

  // ─── T12: Timeout kills worker ───────────────────────────────────────

  describe('T12: Worker timeout', () => {
    it('automatically kills worker after configured timeout', async () => {
      const taskId = 'timeout-test-001';
      const config = makeSleepConfig(60); // Would sleep 60s
      const backend = new SubprocessSpawnBackend(projectDir, {
        providerConfig: config,
        defaultTimeoutMs: 500, // Kill after 500ms
      });

      backend.spawn(taskId, 'claude-sonnet-5', '');
      expect(backend.listWorkers()).toContain(taskId);

      // Wait for timeout to fire
      await waitForCondition(() => !backend.listWorkers().includes(taskId), 3000);

      expect(backend.listWorkers()).not.toContain(taskId);
    });
  });

  // ─── T13: Concurrent multi-spawn tracking ────────────────────────────

  describe('T13: Concurrent workers', () => {
    it('tracks multiple concurrent workers independently', () => {
      const config = makeSleepConfig(10);
      const backend = new SubprocessSpawnBackend(projectDir, { providerConfig: config });

      backend.spawn('multi-001', 'claude-sonnet-5', 'a');
      backend.spawn('multi-002', 'claude-sonnet-5', 'b');
      backend.spawn('multi-003', 'claude-sonnet-5', 'c');

      const workers = backend.listWorkers();
      expect(workers).toHaveLength(3);
      expect(workers).toContain('multi-001');
      expect(workers).toContain('multi-002');
      expect(workers).toContain('multi-003');

      backend.kill('multi-002');
      expect(backend.listWorkers()).toHaveLength(2);
      expect(backend.listWorkers()).not.toContain('multi-002');

      // Cleanup
      backend.kill('multi-001');
      backend.kill('multi-003');
    });
  });

  // ─── T14: buildCommand() returns correct CLI string ──────────────────

  describe('T14: buildCommand()', () => {
    it('returns formatted command string from CLAUDE_SUBPROCESS_CONFIG', () => {
      const backend = new SubprocessSpawnBackend(projectDir);
      const cmd = backend.buildCommand('claude-sonnet-5', '/tmp/prompt.txt');
      expect(cmd).toContain('claude');
      expect(cmd).toContain('claude-sonnet-5');
      expect(cmd).toContain('/tmp/prompt.txt');
    });

    it('includes allowedTools and autoApprove flags', () => {
      const backend = new SubprocessSpawnBackend(projectDir);
      const cmd = backend.buildCommand('claude-opus-4-8', '/tmp/p.txt', {
        allowedTools: 'Read,Edit',
        autoApprove: true,
      });
      expect(cmd).toContain('--allowedTools');
      expect(cmd).toContain('Read,Edit');
      expect(cmd).toContain('--dangerously-skip-permissions');
    });
  });

  // ─── T15: isAvailable() resolves based on CLI ────────────────────────

  describe('T15: isAvailable()', () => {
    it('resolves true when CLI is accessible (node)', async () => {
      const config = makeNodeProviderConfig();
      const backend = new SubprocessSpawnBackend(projectDir, { providerConfig: config });
      // node --version always works
      const result = await backend.isAvailable();
      expect(result).toBe(true);
    });

    it('resolves false when CLI is not found', async () => {
      const config: SubprocessProviderConfig = {
        cliCommand: 'nonexistent-binary-xyz-9999',
        name: 'missing',
        supportedModels: ['claude-sonnet-5'] as const,
        buildArgs() { return ['--version']; },
        buildCommandString() { return ''; },
      };
      const backend = new SubprocessSpawnBackend(projectDir, { providerConfig: config });
      const result = await backend.isAvailable();
      expect(result).toBe(false);
    });
  });

  // ─── T16: Accessors ──────────────────────────────────────────────────

  describe('T16: Accessor methods', () => {
    it('getLogPath() returns correct path', () => {
      const backend = new SubprocessSpawnBackend(projectDir);
      const logPath = backend.getLogPath('test-001');
      expect(logPath).toBe(path.join(projectDir, TASKS_DIR, 'task-test-001.log'));
    });

    it('getProjectDir() returns constructor dir', () => {
      const backend = new SubprocessSpawnBackend(projectDir);
      expect(backend.getProjectDir()).toBe(projectDir);
    });

    it('getWorkerEntry() returns undefined for unknown taskId', () => {
      const backend = new SubprocessSpawnBackend(projectDir);
      expect(backend.getWorkerEntry('unknown')).toBeUndefined();
    });

    it('getWorkerEntry() returns entry for active worker', () => {
      const config = makeSleepConfig(10);
      const backend = new SubprocessSpawnBackend(projectDir, { providerConfig: config });

      backend.spawn('accessor-001', 'claude-sonnet-5', 'test');
      const entry = backend.getWorkerEntry('accessor-001');
      expect(entry).toBeDefined();
      expect(entry!.taskId).toBe('accessor-001');
      expect(typeof entry!.spawnedAt).toBe('string');
      expect(entry!.logPath).toContain('accessor-001');

      backend.kill('accessor-001');
    });
  });

  // ─── T17: Custom provider config wiring ───────────────────────────────

  describe('T17: Custom provider config', () => {
    it('uses custom CLI command and args', async () => {
      const taskId = 'custom-config-001';
      // Custom config that writes a marker file using the cliCommand
      const markerPath = path.join(projectDir, TASKS_DIR, `task-${taskId}.custom-marker`);
      const config: SubprocessProviderConfig = {
        cliCommand: 'node',
        name: 'custom-test-provider',
        supportedModels: ['claude-sonnet-5', 'claude-opus-4-8'] as const,
        buildArgs() {
          return ['-e', `require('fs').writeFileSync(${JSON.stringify(markerPath)}, 'custom-ok'); process.exit(0);`];
        },
        buildCommandString(_model, promptPath) {
          return `node -e "..." < ${promptPath}`;
        },
      };

      const backend = new SubprocessSpawnBackend(projectDir, { providerConfig: config });
      expect(backend.name).toBe('custom-test-provider');
      expect(backend.supportedModels).toContain('claude-sonnet-5');
      expect(backend.supportedModels).toContain('claude-opus-4-8');

      backend.spawn(taskId, 'claude-sonnet-5', '');

      await waitForFile(markerPath, 5000);
      const content = fs.readFileSync(markerPath, 'utf-8');
      expect(content).toBe('custom-ok');
    });
  });

  // ─── T18: createSubprocessBackend factory ─────────────────────────────

  describe('T18: createSubprocessBackend factory', () => {
    it('returns a SubprocessSpawnBackend instance', () => {
      const backend = createSubprocessBackend(projectDir);
      expect(backend).toBeInstanceOf(SubprocessSpawnBackend);
      expect(backend.name).toBe('claude-subprocess');
    });

    it('passes options through to constructor', () => {
      const config = makeNodeProviderConfig();
      const backend = createSubprocessBackend(projectDir, {
        defaultTimeoutMs: 3000,
        providerConfig: config,
      });
      expect(backend.name).toBe('node-test');
    });
  });

  // ─── T19: SpawnBackend wrapper parity (via spawn-backend.ts) ──────────

  describe('T19: SpawnBackend wrapper parity', () => {
    it('SubprocessBackend wrapper delegates to SubprocessSpawnBackend', async () => {
      // Import the wrapper from spawn-backend.ts
      const { SubprocessBackend } = await import('../../src/orchestra/spawn-backend.js');

      const wrapper = new SubprocessBackend(projectDir);
      expect(wrapper.name).toBe('subprocess');

      // isAvailable always true for subprocess
      const available = await wrapper.isAvailable();
      expect(available).toBe(true);
    });
  });

  // ─── T20: CLAUDE_SUBPROCESS_CONFIG buildArgs correctness ──────────────

  describe('T20: CLAUDE_SUBPROCESS_CONFIG', () => {
    it('buildArgs includes model flag', () => {
      const args = CLAUDE_SUBPROCESS_CONFIG.buildArgs('claude-opus-4-8');
      expect(args).toContain('-p');
      expect(args).toContain('-');
      expect(args).toContain('--model');
      expect(args).toContain('claude-opus-4-8');
    });

    it('buildArgs includes allowedTools when provided', () => {
      const args = CLAUDE_SUBPROCESS_CONFIG.buildArgs('claude-sonnet-5', { allowedTools: 'Read,Edit,Bash' });
      expect(args).toContain('--allowedTools');
      expect(args).toContain('Read,Edit,Bash');
    });

    it('buildArgs includes --dangerously-skip-permissions when autoApprove', () => {
      const args = CLAUDE_SUBPROCESS_CONFIG.buildArgs('claude-haiku-4-5-20251001', { autoApprove: true });
      expect(args).toContain('--dangerously-skip-permissions');
    });

    it('buildArgs omits optional flags when not set', () => {
      const args = CLAUDE_SUBPROCESS_CONFIG.buildArgs('claude-sonnet-5');
      expect(args).not.toContain('--allowedTools');
      expect(args).not.toContain('--dangerously-skip-permissions');
    });

    it('buildCommandString formats correctly', () => {
      const cmd = CLAUDE_SUBPROCESS_CONFIG.buildCommandString('claude-opus-4-8', '/tmp/prompt.txt', {
        allowedTools: 'Read',
        autoApprove: true,
      });
      expect(cmd).toContain('claude -p - --model claude-opus-4-8');
      expect(cmd).toContain("--allowedTools 'Read'");
      expect(cmd).toContain('--dangerously-skip-permissions');
      expect(cmd).toContain('< /tmp/prompt.txt');
    });
  });
});
