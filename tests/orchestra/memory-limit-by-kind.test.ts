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
      stdout: { on: vi.fn(), resume: vi.fn() },
      stderr: { on: vi.fn(), resume: vi.fn() },
      on: vi.fn(),
      once: vi.fn(),
    };
    return stub as unknown as ChildProcess;
  }),
}));

// Task JSON returned by readFileSync — configured per test via mockTaskJson
let mockTaskJson = '{}';
const mockFiles = new Map<string, string>();

vi.mock('node:fs', () => ({
  existsSync: vi.fn((p: unknown) => {
    const path = String(p).replaceAll('\\', '/');
    if (path.includes('/.deckent/runtime/')) return mockFiles.has(String(p));
    return true;
  }),
  readFileSync: vi.fn((p: unknown) => {
    const path = String(p);
    const persisted = mockFiles.get(path);
    if (persisted !== undefined) return persisted;
    if (path.endsWith('.json')) return mockTaskJson;
    return '{}';
  }),
  writeFileSync: vi.fn((p: unknown, value: unknown) => {
    mockFiles.set(String(p), String(value));
  }),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn((p: unknown) => {
    mockFiles.delete(String(p));
  }),
  readdirSync: vi.fn(() => []),
  openSync: vi.fn(() => 0),
  fsyncSync: vi.fn(),
  closeSync: vi.fn(),
  chmodSync: vi.fn(),
  statSync: vi.fn(() => ({ mode: 0o100600 })),
  linkSync: vi.fn((source: unknown, target: unknown) => {
    const sourcePath = String(source);
    const targetPath = String(target);
    if (mockFiles.has(targetPath)) {
      const error = new Error(`EEXIST: ${targetPath}`) as NodeJS.ErrnoException;
      error.code = 'EEXIST';
      throw error;
    }
    mockFiles.set(targetPath, mockFiles.get(sourcePath) ?? '');
  }),
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
import { SpawnBackendFactory } from '../../src/orchestra/spawn-backend.js';

const mockSpawnSync = vi.mocked(spawnSync);
const TEST_EXECUTION_OPTIONS = {
  executionBudget: { maxTurns: 1 },
  executionLandingPolicy: { reserve_ratio: 0.25 },
} as const;
const TEST_POLICY_DIGEST = '9'.repeat(64);

function persistedTaskJson(taskId: string, type?: string): string {
  return JSON.stringify({
    id: taskId,
    title: 'Memory limit fixture',
    description: 'Exercise Docker memory limit selection',
    model: 'claude-sonnet-5',
    effort: 'low',
    priority: 'NORMAL',
    reason: 'Regression fixture',
    scope: {
      directories: ['src'],
      filesRead: ['src/input.ts'],
      filesWrite: [],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'Docker arguments carry the expected memory limit',
      noGoCriteria: 'Docker arguments use an unexpected memory limit',
      techDebtAcceptable: 'None',
    },
    status: 'QUEUED',
    ...(type ? { type } : {}),
    budget: TEST_EXECUTION_OPTIONS.executionBudget,
    budgetPolicy: {
      state: 'allow',
      role: 'worker',
      ...(type ? { taskKind: type } : {}),
      resolvedProvider: 'claude',
      executionCostClass: 'remote',
      profileRef: 'tests.orchestra.memory-limit-by-kind',
      policyDigest: TEST_POLICY_DIGEST,
      admissionMode: 'unattended',
      landingPolicy: TEST_EXECUTION_OPTIONS.executionLandingPolicy,
    },
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface SpawnSyncOutcome {
  stdout: string;
  stderr: string;
  status: number;
}

const capturedDockerRunArgs: string[][] = [];

function installSpawnRouter(): void {
  capturedDockerRunArgs.length = 0;
  mockFiles.clear();
  const successOutcome: SpawnSyncOutcome = { stdout: 'a'.repeat(64), stderr: '', status: 0 };
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
    } else if (cmd === 'claude' && argv.join(' ') === 'auth status --json') {
      // A23: strict auth truth requires the structured loggedIn envelope.
      outcome = { stdout: '{"loggedIn":true}', stderr: '', status: 0 };
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
    mockTaskJson = persistedTaskJson('task-doc-001', 'documentation');
    const backend = new DockerSpawnBackend('/test/project', {
      kindMemoryLimits: { documentation: '768m', 'code-development': '1536m' },
    });
    backend.spawn('task-doc-001', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(flagValue(argv, '--memory')).toBe('768m');
    // swap = 768 * 1.5 = 1152 MB
    expect(flagValue(argv, '--memory-swap')).toBe('1152m');
  });

  it('applies code-development kind limit when task type matches', () => {
    mockTaskJson = persistedTaskJson('task-code-001', 'code-development');
    const backend = new DockerSpawnBackend('/test/project', {
      kindMemoryLimits: { documentation: '768m', 'code-development': '1536m' },
    });
    backend.spawn('task-code-001', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(flagValue(argv, '--memory')).toBe('1536m');
    // swap = 1536 * 1.5 = 2304 MB
    expect(flagValue(argv, '--memory-swap')).toBe('2304m');
  });

  it('falls back to default 4g when task kind is not in kindMemoryLimits', () => {
    mockTaskJson = persistedTaskJson('task-audit-001', 'audit'); // 'audit' not in map
    const backend = new DockerSpawnBackend('/test/project', {
      kindMemoryLimits: { documentation: '768m', 'code-development': '1536m' },
    });
    backend.spawn('task-audit-001', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(flagValue(argv, '--memory')).toBe(DEFAULT_WORKER_MEMORY_LIMIT);
    expect(flagValue(argv, '--memory-swap')).toBe(DEFAULT_WORKER_MEMORY_SWAP);
  });

  it('falls back to default 4g when kindMemoryLimits is empty (zero-config behavior)', () => {
    mockTaskJson = persistedTaskJson('task-noconfig-001', 'code-development');
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('task-noconfig-001', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(flagValue(argv, '--memory')).toBe(DEFAULT_WORKER_MEMORY_LIMIT);
    expect(flagValue(argv, '--memory-swap')).toBe(DEFAULT_WORKER_MEMORY_SWAP);
  });

  it('fails closed before Docker dispatch when task JSON has no canonical kind', () => {
    mockTaskJson = persistedTaskJson('task-notype-001'); // no type
    const backend = new DockerSpawnBackend('/test/project', {
      kindMemoryLimits: { 'code-development': '1536m' },
    });
    expect(() => backend.spawn(
      'task-notype-001',
      'claude-sonnet-5',
      'prompt-body',
      TEST_EXECUTION_OPTIONS,
    )).toThrow(/requires a canonical task kind/i);

    expect(capturedDockerRunArgs).toHaveLength(0);
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
    mockTaskJson = persistedTaskJson('task-test-001', 'test');
    const backend = new DockerSpawnBackend('/test/project', {
      kindMemoryLimits: {
        'code-development': '1536m',
        documentation: '768m',
        test: '1024m',
        devops: '512m',
      },
    });
    backend.spawn('task-test-001', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(flagValue(argv, '--memory')).toBe('1024m');
    // swap = 1024 * 1.5 = 1536 MB
    expect(flagValue(argv, '--memory-swap')).toBe('1536m');
  });
});

// ─── B-WORKERMEM (Sprint 318): config-driven --memory via the spawn factory ───
// The factory used to drop the per-worker memory limit (hardcoded 4g default),
// so config.worker_memory_limit was display-only. Now SpawnBackendFactory threads
// dockerMemoryLimit → DockerSpawnBackend → docker --memory.
describe('SpawnBackendFactory: B-WORKERMEM config-driven --memory wire', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSpawnRouter();
    mockTaskJson = '{}';
  });

  it('threads dockerMemoryLimit into the docker --memory flag', () => {
    mockTaskJson = persistedTaskJson('task-mem-1', 'code-development');
    const backend = SpawnBackendFactory.create({
      backend: 'docker', projectDir: '/test/project', dockerMemoryLimit: '2g',
    });
    backend.spawn('task-mem-1', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);
    const argv = capturedDockerRunArgs.at(-1) ?? [];
    // Pre-wire the factory ignored dockerMemoryLimit → '4g' (RED). Now '2g'.
    expect(flagValue(argv, '--memory')).toBe('2g');
  });

  it('falls back to DEFAULT_WORKER_MEMORY_LIMIT when dockerMemoryLimit unset', () => {
    mockTaskJson = persistedTaskJson('task-mem-2', 'code-development');
    const backend = SpawnBackendFactory.create({
      backend: 'docker', projectDir: '/test/project',
    });
    backend.spawn('task-mem-2', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);
    const argv = capturedDockerRunArgs.at(-1) ?? [];
    expect(flagValue(argv, '--memory')).toBe(DEFAULT_WORKER_MEMORY_LIMIT);
  });
});
