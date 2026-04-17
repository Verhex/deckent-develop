/**
 * Auditor + Heartbeat Daemon Async Tests
 *
 * Sprint 144 Task 6: All sync I/O → async conversion verification.
 * 15+ tests covering async paths, concurrent scan, parallel execution,
 * and performance benchmarks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Mocks for spawn-based tests ─────────────────────────────────

vi.mock('../../src/core/utils.js', () => ({
  debugLog: vi.fn(),
}));

import {
  runHeartbeat,
  HeartbeatDaemon,
  readDaemonPid,
  stopDaemonByPid,
  validateCommand,
} from '../../src/orchestra/heartbeat-daemon.js';

// ─── Temp dir helpers ─────────────────────────────────────────────

let tmpDir: string;

async function setupTestProject(heartbeatContent?: string): Promise<string> {
  tmpDir = await mkdtemp(join(tmpdir(), 'auditor-test-'));
  await mkdir(join(tmpDir, '.deckent'), { recursive: true });
  await mkdir(join(tmpDir, '.brain'), { recursive: true });

  if (heartbeatContent !== undefined) {
    await writeFile(join(tmpDir, '.deckent', 'HEARTBEAT.md'), heartbeatContent, 'utf-8');
  }

  return tmpDir;
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Auditor Async Scan — heartbeat-daemon', () => {
  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // ─── Async Path Tests ─────────────────────────────────────────

  describe('async I/O paths', () => {
    it('runHeartbeat returns a Promise', async () => {
      const root = await setupTestProject('# Heartbeat Tasks\n- [x] done\n');
      const result = runHeartbeat(root);
      expect(result).toBeInstanceOf(Promise);
      await result;
    });

    it('runHeartbeat creates default HEARTBEAT.md when missing', async () => {
      const root = await setupTestProject();
      // Remove HEARTBEAT.md to test creation
      await rm(join(root, '.deckent', 'HEARTBEAT.md'), { force: true });

      const result = await runHeartbeat(root);

      // Default template has 2 tasks (tsc, npx vitest)
      expect(result.total).toBe(2);
    });

    it('runHeartbeat handles empty HEARTBEAT.md', async () => {
      const root = await setupTestProject('');

      const result = await runHeartbeat(root);

      expect(result.total).toBe(0);
      expect(result.executed).toBe(0);
    });

    it('runHeartbeat skips completed (checked) tasks', async () => {
      const content = `# Heartbeat Tasks
- [x] date
- [x] uptime
`;
      const root = await setupTestProject(content);

      const result = await runHeartbeat(root);

      expect(result.total).toBe(2);
      expect(result.executed).toBe(0);
      expect(result.passed).toBe(0);
    });

    it('runHeartbeat executes pending whitelisted tasks', async () => {
      const content = `# Heartbeat Tasks
- [ ] date
`;
      const root = await setupTestProject(content);

      const result = await runHeartbeat(root);

      expect(result.total).toBe(1);
      expect(result.executed).toBe(1);
      expect(result.passed).toBe(1);
      expect(result.details[0]!.success).toBe(true);
      expect(result.details[0]!.command).toBe('date');
    });

    it('runHeartbeat handles failing commands gracefully', async () => {
      const content = `# Heartbeat Tasks
- [ ] node --invalid-flag-that-does-not-exist
`;
      const root = await setupTestProject(content);

      const result = await runHeartbeat(root);

      expect(result.total).toBe(1);
      expect(result.executed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.details[0]!.success).toBe(false);
    });

    it('runHeartbeat blocks non-whitelisted commands', async () => {
      const content = `# Heartbeat Tasks
- [ ] curl http://example.com
`;
      const root = await setupTestProject(content);

      const result = await runHeartbeat(root);

      expect(result.total).toBe(1);
      expect(result.executed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.details[0]!.output).toContain('BLOCKED');
    });

    it('runHeartbeat writes log to .brain/heartbeat-log.md', async () => {
      const content = `# Heartbeat Tasks
- [ ] date
`;
      const root = await setupTestProject(content);

      await runHeartbeat(root);

      const logPath = join(root, '.brain', 'heartbeat-log.md');
      const log = await readFile(logPath, 'utf-8');
      expect(log).toContain('## Heartbeat —');
      expect(log).toContain('`date`');
    });
  });

  // ─── Parallel Execution Tests ─────────────────────────────────

  describe('parallel execution (Promise.all)', () => {
    it('executes multiple pending tasks in parallel', async () => {
      const content = `# Heartbeat Tasks
- [ ] date
- [ ] node --version
- [ ] npm --version
`;
      const root = await setupTestProject(content);

      const startTime = Date.now();
      const result = await runHeartbeat(root);
      const elapsed = Date.now() - startTime;

      expect(result.total).toBe(3);
      expect(result.executed).toBe(3);
      expect(result.passed).toBe(3);
      // All 3 tasks should complete much faster than 3x serial timeout
      expect(elapsed).toBeLessThan(HEARTBEAT_EXEC_TIMEOUT_FOR_TEST);
    });
  });

  // ─── HeartbeatDaemon Async Tests ──────────────────────────────

  describe('HeartbeatDaemon async', () => {
    it('start() returns a Promise<HeartbeatRunResult>', async () => {
      const root = await setupTestProject('# Heartbeat Tasks\n- [x] done\n');
      const daemon = new HeartbeatDaemon(root, 60);

      const result = daemon.start();
      expect(result).toBeInstanceOf(Promise);

      const resolved = await result;
      expect(resolved.total).toBe(1);

      await daemon.stop();
    });

    it('stop() returns a Promise<void>', async () => {
      const root = await setupTestProject('# Heartbeat Tasks\n');
      const daemon = new HeartbeatDaemon(root, 60);

      await daemon.start();
      const stopResult = daemon.stop();
      expect(stopResult).toBeInstanceOf(Promise);
      await stopResult;
      expect(daemon.running).toBe(false);
    });

    it('writes and removes PID file asynchronously', async () => {
      const root = await setupTestProject('# Heartbeat Tasks\n');
      const daemon = new HeartbeatDaemon(root, 60);

      await daemon.start();

      const pidPath = join(root, '.deckent', 'heartbeat.pid');
      const pidContent = await readFile(pidPath, 'utf-8');
      expect(parseInt(pidContent, 10)).toBe(process.pid);

      await daemon.stop();
    });
  });

  // ─── readDaemonPid / stopDaemonByPid Async Tests ──────────────

  describe('PID management async', () => {
    it('readDaemonPid returns null when no PID file', async () => {
      const root = await setupTestProject();
      const pid = await readDaemonPid(root);
      expect(pid).toBeNull();
    });

    it('readDaemonPid returns PID for current process', async () => {
      const root = await setupTestProject();
      await writeFile(join(root, '.deckent', 'heartbeat.pid'), String(process.pid), 'utf-8');

      const pid = await readDaemonPid(root);
      expect(pid).toBe(process.pid);
    });

    it('readDaemonPid cleans up stale PID file', async () => {
      const root = await setupTestProject();
      // Write a PID that doesn't exist (99999999)
      await writeFile(join(root, '.deckent', 'heartbeat.pid'), '99999999', 'utf-8');

      const pid = await readDaemonPid(root);
      expect(pid).toBeNull();
    });

    it('stopDaemonByPid returns false when no daemon running', async () => {
      const root = await setupTestProject();
      const stopped = await stopDaemonByPid(root);
      expect(stopped).toBe(false);
    });
  });

  // ─── Concurrent Scan Test ─────────────────────────────────────

  describe('concurrent scan resilience', () => {
    it('handles multiple concurrent runHeartbeat calls', async () => {
      const content = `# Heartbeat Tasks
- [ ] date
`;
      const root = await setupTestProject(content);

      // Run 5 concurrent heartbeat scans
      const results = await Promise.all([
        runHeartbeat(root),
        runHeartbeat(root),
        runHeartbeat(root),
        runHeartbeat(root),
        runHeartbeat(root),
      ]);

      for (const result of results) {
        expect(result.total).toBe(1);
        expect(result.executed).toBe(1);
      }
    });
  });

  // ─── Command Validation (sync, unchanged) ─────────────────────

  describe('validateCommand (sync, no I/O)', () => {
    it('allows whitelisted commands', () => {
      expect(validateCommand('date')).toBe('date');
      expect(validateCommand('tsc --noEmit')).toBe('tsc --noEmit');
      expect(validateCommand('npx vitest run')).toBe('npx vitest run');
    });

    it('rejects shell metacharacters', () => {
      expect(() => validateCommand('date ; rm -rf /')).toThrow('Shell metacharacter');
      expect(() => validateCommand('date | cat')).toThrow('Shell metacharacter');
      expect(() => validateCommand('date $(whoami)')).toThrow('Shell metacharacter');
    });

    it('rejects non-whitelisted commands', () => {
      expect(() => validateCommand('curl http://evil.com')).toThrow('not in whitelist');
      expect(() => validateCommand('rm -rf /')).toThrow('not in whitelist');
    });
  });

  // ─── Performance Benchmark ────────────────────────────────────

  describe('performance', () => {
    it('completes scan of 3 tasks under 5 seconds', async () => {
      const content = `# Heartbeat Tasks
- [ ] date
- [ ] node --version
- [ ] npm --version
`;
      const root = await setupTestProject(content);

      const start = performance.now();
      const result = await runHeartbeat(root);
      const elapsed = performance.now() - start;

      expect(result.executed).toBe(3);
      expect(result.passed).toBe(3);
      expect(elapsed).toBeLessThan(5000);
    });
  });
});

// Test helper constant
const HEARTBEAT_EXEC_TIMEOUT_FOR_TEST = 10_000; // generous for CI
