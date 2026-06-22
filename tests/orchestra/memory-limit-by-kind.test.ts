// ─── Sprint 272 T-005: F1-LIM faz-2a — Kind-Based Docker Memory Limits ────────
//
// Tests the opt-in `worker_memory_limit_by_kind` feature in DockerSpawnBackend:
//   - Kind match applies configured limit
//   - Fallback to default when kind not configured
//   - Swap is derived at limit × 1.5
//   - Invalid limit strings rejected at construction time
//   - readTaskKind reads task JSON correctly

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  spawn: vi.fn(() => {
    const stub = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
    };
    return stub as unknown as ChildProcess;
  }),
}));

// Task JSON returned by readFileSync — configured per test via mockTaskJson
let mockTaskJson = '{}';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn((p: unknown) => {
    if (typeof p === 'string' && p.endsWith('.json')) return mockTaskJson;
    return '{}';
  }),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  openSync: vi.fn(() => 0),
  fsyncSync: vi.fn(),
  closeSync: vi.fn(),
  renameSync: vi.fn(),
  rmdirSync: vi.fn(),
}));

vi.mock('../../src/core/utils.js', () => ({
  debugLog: vi.fn(),
}));

vi.mock('../../src/core/file-lock.js', () => ({
  acquireSpawnLocks: vi.fn(),
  releaseAllSpawnLocks: vi.fn(() => 0),
  releaseStaleSpawnLocksForTask: vi.fn(() => 0),
  SpawnLockError: class extends Error {},
}));

vi.mock('../../src/core/active-workers.js', () => ({
  markPending: vi.fn(),
  markActive: vi.fn(),
  clearPending: vi.fn(),
}));

import { spawnSync } from 'node:child_process';
import {
  DockerSpawnBackend,
  DEFAULT_WORKER_MEMORY_LIMIT,
  DEFAULT_WORKER_MEMORY_SWAP,
  parseMemoryString,
  deriveSwapFromLimitBytes,
} from '../../src/orchestra/spawn-backend-docker.js';

const mockSpawnSync = vi.mocked(spawnSync);

// ─── Helpers ────────────────────────────────────────────────────────────────

interface SpawnSyncOutcome {
  stdout: string;
  stderr: string;
  status: number;
}

const capturedDockerRunArgs: string[][] = [];

function installSpawnRouter(): void {
  capturedDockerRunArgs.length = 0;
  const successOutcome: SpawnSyncOutcome = { stdout: 'container-id-x', stderr: '', status: 0 };
  const imageOutcome: SpawnSyncOutcome = { stdout: 'imghash', stderr: '', status: 0 };
  const inspectOutcome: SpawnSyncOutcome = { stdout: 'true|0', stderr: '', status: 0 };
  const fallback: SpawnSyncOutcome = { stdout: '', stderr: '', status: 0 };

  mockSpawnSync.mockImplementation((cmd, args) => {
    const argv = (args as string[] | undefined) ?? [];
    const sub = argv[0];

    let outcome: SpawnSyncOutcome;
    if (cmd === 'sleep') {
      outcome = fallback;
    } else if (cmd === 'docker' && sub === 'images') {
      outcome = imageOutcome;
    } else if (cmd === 'docker' && sub === 'run') {
      capturedDockerRunArgs.push([...argv]);
      outcome = successOutcome;
    } else if (cmd === 'docker' && sub === 'inspect') {
      outcome = inspectOutcome;
    } else if (cmd === 'claude' && sub === '--version') {
      // A23: host-side authHealthCheck runs claude --version before a claude spawn.
      outcome = { stdout: 'claude 1.0.0 (host auth ok)', stderr: '', status: 0 };
    } else {
      outcome = fallback;
    }

    return {
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      status: outcome.status,
      signal: null,
      pid: 1,
      output: ['', outcome.stdout, outcome.stderr],
    } as unknown as ReturnType<typeof spawnSync>;
  });
}

function flagValue(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx === -1 || idx === argv.length - 1) return undefined;
  return argv[idx + 1];
}

// ─── deriveSwapFromLimitBytes ───────────────────────────────────────────────

describe('deriveSwapFromLimitBytes', () => {
  it('derives swap at 1.5× the limit (matches 4g/6g default ratio)', () => {
    const fourGB = 4 * 1024 * 1024 * 1024;
    const sixGB = 6 * 1024 * 1024 * 1024;
    const sixGBmb = Math.floor(sixGB / (1024 * 1024));
    expect(deriveSwapFromLimitBytes(fourGB)).toBe(`${sixGBmb}m`);
  });

  it('derives swap for 768m limit → 1152m', () => {
    const limitBytes = parseMemoryString('768m')!;
    expect(deriveSwapFromLimitBytes(limitBytes)).toBe('1152m');
  });

  it('derives swap for 1536m limit → 2304m', () => {
    const limitBytes = parseMemoryString('1536m')!;
    expect(deriveSwapFromLimitBytes(limitBytes)).toBe('2304m');
  });
});

// ─── Kind-based memory limits ───────────────────────────────────────────────

describe('DockerSpawnBackend: kind-based memory limits (Sprint 272 T-005)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSpawnRouter();
    mockTaskJson = '{}';
  });

  it('applies documentation kind limit when task type matches', () => {
    mockTaskJson = JSON.stringify({ type: 'documentation' });
    const backend = new DockerSpawnBackend('/test/project', {
      kindMemoryLimits: { documentation: '768m', 'code-development': '1536m' },
    });
    backend.spawn('task-doc-001', 'sonnet', 'prompt-body');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(flagValue(argv, '--memory')).toBe('768m');
    // swap = 768 * 1.5 = 1152 MB
    expect(flagValue(argv, '--memory-swap')).toBe('1152m');
  });

  it('applies code-development kind limit when task type matches', () => {
    mockTaskJson = JSON.stringify({ type: 'code-development' });
    const backend = new DockerSpawnBackend('/test/project', {
      kindMemoryLimits: { documentation: '768m', 'code-development': '1536m' },
    });
    backend.spawn('task-code-001', 'sonnet', 'prompt-body');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(flagValue(argv, '--memory')).toBe('1536m');
    // swap = 1536 * 1.5 = 2304 MB
    expect(flagValue(argv, '--memory-swap')).toBe('2304m');
  });

  it('falls back to default 4g when task kind is not in kindMemoryLimits', () => {
    mockTaskJson = JSON.stringify({ type: 'audit' }); // 'audit' not in map
    const backend = new DockerSpawnBackend('/test/project', {
      kindMemoryLimits: { documentation: '768m', 'code-development': '1536m' },
    });
    backend.spawn('task-audit-001', 'sonnet', 'prompt-body');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(flagValue(argv, '--memory')).toBe(DEFAULT_WORKER_MEMORY_LIMIT);
    expect(flagValue(argv, '--memory-swap')).toBe(DEFAULT_WORKER_MEMORY_SWAP);
  });

  it('falls back to default 4g when kindMemoryLimits is empty (zero-config behavior)', () => {
    mockTaskJson = JSON.stringify({ type: 'code-development' });
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('task-noconfig-001', 'sonnet', 'prompt-body');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(flagValue(argv, '--memory')).toBe(DEFAULT_WORKER_MEMORY_LIMIT);
    expect(flagValue(argv, '--memory-swap')).toBe(DEFAULT_WORKER_MEMORY_SWAP);
  });

  it('falls back to default when task JSON has no type field', () => {
    mockTaskJson = JSON.stringify({ model: 'sonnet', effort: 'normal' }); // no type
    const backend = new DockerSpawnBackend('/test/project', {
      kindMemoryLimits: { 'code-development': '1536m' },
    });
    backend.spawn('task-notype-001', 'sonnet', 'prompt-body');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(flagValue(argv, '--memory')).toBe(DEFAULT_WORKER_MEMORY_LIMIT);
    expect(flagValue(argv, '--memory-swap')).toBe(DEFAULT_WORKER_MEMORY_SWAP);
  });

  it('throws at construction time for invalid memory limit strings', () => {
    expect(() => new DockerSpawnBackend('/test/project', {
      kindMemoryLimits: { 'code-development': 'not-valid-memory' },
    })).toThrow(/Invalid memory limit for kind 'code-development'/);
  });

  it('throws at construction time for zero memory limit', () => {
    expect(() => new DockerSpawnBackend('/test/project', {
      kindMemoryLimits: { documentation: '0m' },
    })).toThrow(/Invalid memory limit for kind 'documentation'/);
  });

  it('accepts mixed kinds and applies the matching one only', () => {
    mockTaskJson = JSON.stringify({ type: 'test' });
    const backend = new DockerSpawnBackend('/test/project', {
      kindMemoryLimits: {
        'code-development': '1536m',
        documentation: '768m',
        test: '1024m',
        devops: '512m',
      },
    });
    backend.spawn('task-test-001', 'sonnet', 'prompt-body');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(flagValue(argv, '--memory')).toBe('1024m');
    // swap = 1024 * 1.5 = 1536 MB
    expect(flagValue(argv, '--memory-swap')).toBe('1536m');
  });
});
