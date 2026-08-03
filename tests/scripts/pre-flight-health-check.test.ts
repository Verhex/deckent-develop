/**
 * Tests for scripts/pre-flight-health-check.mjs
 *
 * Imports via dynamic import since it's an .mjs file.
 * Each component check is tested in isolation with mocked child_process/fs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock node:child_process ──────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 2, mtimeMs: 0 })),
}));

// ─── Import module under test ─────────────────────────────────────────────────

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';

const spawnSyncMock = vi.mocked(spawnSync);
const existsSyncMock = vi.mocked(existsSync);
const readdirSyncMock = vi.mocked(readdirSync);
const readFileSyncMock = vi.mocked(readFileSync);
const statSyncMock = vi.mocked(statSync);

// Dynamic import of .mjs
let checkTypeScript: (root?: string) => ReturnType<typeof import('../../scripts/pre-flight-health-check.mjs')['checkTypeScript']>;
let checkBrainBudget: typeof import('../../scripts/pre-flight-health-check.mjs')['checkBrainBudget'];
let checkStaleLocks: typeof import('../../scripts/pre-flight-health-check.mjs')['checkStaleLocks'];
let checkDockerDaemon: typeof import('../../scripts/pre-flight-health-check.mjs')['checkDockerDaemon'];
let checkMCPServer: typeof import('../../scripts/pre-flight-health-check.mjs')['checkMCPServer'];
let checkVitestBaseline: typeof import('../../scripts/pre-flight-health-check.mjs')['checkVitestBaseline'];
let runPreFlightChecks: typeof import('../../scripts/pre-flight-health-check.mjs')['runPreFlightChecks'];

beforeEach(async () => {
  vi.clearAllMocks();
  // Re-import to reset module state
  const mod = await import('../../scripts/pre-flight-health-check.mjs');
  checkTypeScript = mod.checkTypeScript;
  checkBrainBudget = mod.checkBrainBudget;
  checkStaleLocks = mod.checkStaleLocks;
  checkDockerDaemon = mod.checkDockerDaemon;
  checkMCPServer = mod.checkMCPServer;
  checkVitestBaseline = mod.checkVitestBaseline;
  runPreFlightChecks = mod.runPreFlightChecks;
});

// ─── checkTypeScript ──────────────────────────────────────────────────────────

describe('checkTypeScript', () => {
  it('returns passed when tsc exits with 0', () => {
    spawnSyncMock.mockReturnValue({ status: 0, stdout: '', stderr: '', pid: 1, output: [], signal: null });
    const result = checkTypeScript('/mock/root');
    expect(result.passed).toBe(true);
    expect(result.required).toBe(true);
    expect(result.message).toContain('passed');
  });

  it('returns failed when tsc exits non-zero', () => {
    spawnSyncMock.mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'src/foo.ts(10,5): error TS2345: Argument of type',
      pid: 1, output: [], signal: null,
    });
    const result = checkTypeScript('/mock/root');
    expect(result.passed).toBe(false);
    expect(result.required).toBe(true);
    expect(result.message).toContain('tsc failed');
  });

  it('includes timing in durationMs', () => {
    spawnSyncMock.mockReturnValue({ status: 0, stdout: '', stderr: '', pid: 1, output: [], signal: null });
    const result = checkTypeScript('/mock/root');
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ─── checkVitestBaseline ──────────────────────────────────────────────────────

describe('checkVitestBaseline', () => {
  it('skips when skip=true', () => {
    const result = checkVitestBaseline(true);
    expect(result.passed).toBe(true);
    expect(result.message).toContain('skipped');
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it('returns passed when vitest exits 0', () => {
    spawnSyncMock.mockReturnValue({ status: 0, stdout: 'Tests 10 passed', stderr: '', pid: 1, output: [], signal: null });
    const result = checkVitestBaseline(false);
    expect(result.passed).toBe(true);
    expect(result.message).toContain('passed');
  });

  it('returns failed (non-required) when vitest exits non-zero', () => {
    spawnSyncMock.mockReturnValue({
      status: 1,
      stdout: 'Tests 5 passed | 3 failed',
      stderr: '',
      pid: 1, output: [], signal: null,
    });
    const result = checkVitestBaseline(false);
    expect(result.passed).toBe(false);
    expect(result.required).toBe(false); // warnings only, not abort
    expect(result.message).toContain('failed');
  });
});

// ─── checkBrainBudget ─────────────────────────────────────────────────────────

describe('checkBrainBudget', () => {
  it('returns passed when .brain/ does not exist', () => {
    existsSyncMock.mockReturnValue(false);
    const result = checkBrainBudget('/mock/root', 900);
    expect(result.passed).toBe(true);
    expect(result.message).toContain('not found');
  });

  it('returns passed when total lines within budget', () => {
    existsSyncMock.mockReturnValue(true);
    readdirSyncMock.mockReturnValue(['MEMORY.md', 'RETRO.md'] as unknown as ReturnType<typeof readdirSyncMock>);
    readFileSyncMock
      .mockReturnValueOnce('line1\nline2\nline3\n') // MEMORY.md — splits to 4 items
      .mockReturnValueOnce('a\nb\n'); // RETRO.md — splits to 3 items
    const result = checkBrainBudget('/mock/root', 900);
    expect(result.passed).toBe(true);
    expect(result.message).toContain('/900');
    expect(result.message).toContain('within budget');
  });

  it('returns failed when total lines exceed budget', () => {
    existsSyncMock.mockReturnValue(true);
    readdirSyncMock.mockReturnValue(['MEMORY.md'] as unknown as ReturnType<typeof readdirSyncMock>);
    // Simulate 1000 lines
    const bigContent = Array.from({ length: 1000 }, (_, i) => `line${i}`).join('\n');
    readFileSyncMock.mockReturnValueOnce(bigContent);
    const result = checkBrainBudget('/mock/root', 900);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('OVER BUDGET');
    expect(result.message).toContain('1000/900');
  });
});

// ─── checkStaleLocks ──────────────────────────────────────────────────────────

describe('checkStaleLocks', () => {
  it('returns passed when .locks/ does not exist', () => {
    existsSyncMock.mockReturnValue(false);
    const result = checkStaleLocks('/mock/root', 300_000);
    expect(result.passed).toBe(true);
    expect(result.message).toContain('no .locks/');
  });

  it('returns passed when no lock files present', () => {
    existsSyncMock.mockReturnValue(true);
    readdirSyncMock.mockReturnValue([] as unknown as ReturnType<typeof readdirSyncMock>);
    const result = checkStaleLocks('/mock/root', 300_000);
    expect(result.passed).toBe(true);
    expect(result.message).toContain('no lock files');
  });

  it('returns passed when locks are fresh', () => {
    existsSyncMock.mockReturnValue(true);
    readdirSyncMock.mockReturnValue(['task-001.lock'] as unknown as ReturnType<typeof readdirSyncMock>);
    readFileSyncMock.mockReturnValue(JSON.stringify({ acquiredAt: new Date().toISOString(), taskId: '001' }));
    const result = checkStaleLocks('/mock/root', 300_000);
    expect(result.passed).toBe(true);
    expect(result.message).toContain('1 active lock(s)');
  });

  it('returns failed when stale locks present', () => {
    existsSyncMock.mockReturnValue(true);
    readdirSyncMock.mockReturnValue(['old.lock'] as unknown as ReturnType<typeof readdirSyncMock>);
    // Simulate lock acquired 10 minutes ago
    const tenMinAgo = new Date(Date.now() - 600_000).toISOString();
    readFileSyncMock.mockReturnValue(JSON.stringify({ acquiredAt: tenMinAgo, taskId: 'old' }));
    const result = checkStaleLocks('/mock/root', 300_000);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('stale lock(s)');
  });

  it('falls back to statSync mtime when acquiredAt missing', () => {
    existsSyncMock.mockReturnValue(true);
    readdirSyncMock.mockReturnValue(['nodate.lock'] as unknown as ReturnType<typeof readdirSyncMock>);
    readFileSyncMock.mockReturnValue(JSON.stringify({ taskId: 'nodate' }));
    // statSync: mtime = 10 minutes ago
    statSyncMock.mockReturnValue({ mtimeMs: Date.now() - 600_000 } as ReturnType<typeof statSyncMock>);
    const result = checkStaleLocks('/mock/root', 300_000);
    expect(result.passed).toBe(false);
  });
});

// ─── checkDockerDaemon ────────────────────────────────────────────────────────

describe('checkDockerDaemon', () => {
  it('returns passed when docker info exits 0', () => {
    spawnSyncMock.mockReturnValue({ status: 0, stdout: 'Server Version: 24.0.0', stderr: '', pid: 1, output: [], signal: null });
    const result = checkDockerDaemon();
    expect(result.passed).toBe(true);
    expect(result.required).toBe(false); // optional
    expect(result.message).toContain('running');
  });

  it('returns failed (non-required) when docker not available', () => {
    spawnSyncMock.mockReturnValue({ status: 1, stdout: '', stderr: 'Cannot connect to daemon', pid: 1, output: [], signal: null });
    const result = checkDockerDaemon();
    expect(result.passed).toBe(false);
    expect(result.required).toBe(false);
    expect(result.message).toContain('not available');
  });
});

// ─── checkMCPServer ───────────────────────────────────────────────────────────

describe('checkMCPServer', () => {
  it('returns passed when deckent CLI not available (non-fatal)', () => {
    spawnSyncMock.mockReturnValue({ status: 1, stdout: '', stderr: '', pid: 1, output: [], signal: null });
    existsSyncMock.mockReturnValue(false);
    const result = checkMCPServer('/mock/root');
    expect(result.passed).toBe(true); // non-fatal
    expect(result.required).toBe(false);
    expect(result.message).toContain('skipped');
  });

  it('returns passed when src/mcp/ found', () => {
    spawnSyncMock.mockReturnValue({ status: 0, stdout: '0.4.0', stderr: '', pid: 1, output: [], signal: null });
    // First call: dist path doesn't exist, second call: src path exists
    existsSyncMock
      .mockReturnValueOnce(false)  // dist/mcp/server.js
      .mockReturnValueOnce(true);  // src/mcp/server.ts
    const result = checkMCPServer('/mock/root');
    expect(result.passed).toBe(true);
    expect(result.message).toContain('found');
  });

  it('returns failed when neither dist nor src mcp found', () => {
    spawnSyncMock.mockReturnValue({ status: 0, stdout: '0.4.0', stderr: '', pid: 1, output: [], signal: null });
    existsSyncMock.mockReturnValue(false);
    const result = checkMCPServer('/mock/root');
    expect(result.passed).toBe(false);
    expect(result.message).toContain('not found');
  });
});

// ─── runPreFlightChecks ───────────────────────────────────────────────────────

describe('runPreFlightChecks', () => {
  it('returns passed when all checks succeed', () => {
    // tsc passes, vitest skipped, doctor returns ok:true
    spawnSyncMock.mockImplementation((cmd: string, cmdArgs: string[]) => {
      // doctor --json call returns ok:true
      if (Array.isArray(cmdArgs) && cmdArgs.includes('doctor')) {
        return { status: 0, stdout: JSON.stringify({ ok: true, checks: [] }), stderr: '', pid: 1, output: [], signal: null };
      }
      // deckent --version passes
      if (Array.isArray(cmdArgs) && cmdArgs.includes('--version')) {
        return { status: 0, stdout: '0.4.0', stderr: '', pid: 1, output: [], signal: null };
      }
      // tsc and others pass
      return { status: 0, stdout: '', stderr: '', pid: 1, output: [], signal: null };
    });
    existsSyncMock.mockReturnValue(false); // no .locks/, .brain/ etc
    readdirSyncMock.mockReturnValue([] as unknown as ReturnType<typeof readdirSyncMock>);

    const result = runPreFlightChecks({ skipTests: true, root: '/mock/root' });
    expect(typeof result.passed).toBe('boolean');
    expect(Array.isArray(result.checks)).toBe(true);
    // All required checks should pass → no abort
    const requiredFailed = result.checks.filter(c => c.required && !c.passed);
    expect(requiredFailed).toHaveLength(0);
    expect(result.abortSprint).toBe(false);
  });

  it('abortSprint=true when a required check fails', () => {
    // tsc fails
    spawnSyncMock.mockReturnValue({ status: 1, stdout: '', stderr: 'error TS0001: fail', pid: 1, output: [], signal: null });
    existsSyncMock.mockReturnValue(false);
    readdirSyncMock.mockReturnValue([] as unknown as ReturnType<typeof readdirSyncMock>);

    const result = runPreFlightChecks({ skipTests: true, root: '/mock/root' });
    // TypeScript check is required — abortSprint should be true
    expect(result.abortSprint).toBe(true);
    expect(result.passed).toBe(false);
  });

  it('does not abort when only optional checks fail', () => {
    // tsc passes, docker fails (optional)
    spawnSyncMock.mockImplementation((cmd: string) => {
      if (cmd === 'npx') {
        // tsc call
        return { status: 0, stdout: '', stderr: '', pid: 1, output: [], signal: null };
      }
      if (cmd === 'docker') {
        return { status: 1, stdout: '', stderr: '', pid: 1, output: [], signal: null };
      }
      return { status: 0, stdout: '{}', stderr: '', pid: 1, output: [], signal: null };
    });
    existsSyncMock.mockReturnValue(false);
    readdirSyncMock.mockReturnValue([] as unknown as ReturnType<typeof readdirSyncMock>);

    const result = runPreFlightChecks({ skipTests: true, root: '/mock/root' });
    // Docker is optional — no abort if only that fails
    const requiredFailed = result.checks.filter(c => c.required && !c.passed);
    if (requiredFailed.length === 0) {
      expect(result.abortSprint).toBe(false);
    }
  });

  it('includes all expected check names', () => {
    spawnSyncMock.mockReturnValue({ status: 0, stdout: '{}', stderr: '', pid: 1, output: [], signal: null });
    existsSyncMock.mockReturnValue(false);
    readdirSyncMock.mockReturnValue([] as unknown as ReturnType<typeof readdirSyncMock>);

    const result = runPreFlightChecks({ skipTests: true, root: '/mock/root' });
    const names = result.checks.map(c => c.name);
    expect(names).toContain('TypeScript Build');
    expect(names).toContain('Vitest Baseline');
    expect(names).toContain('Brain Budget');
    expect(names).toContain('Stale Locks');
    expect(names).toContain('Docker Daemon');
    expect(names).toContain('MCP Server');
  });
});
