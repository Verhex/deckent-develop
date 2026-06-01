/**
 * tests/orchestra/docker-auth-precedence.test.ts
 *
 * Sprint 214 T-214-001 — Docker env-forwarding must be provider + auth-aware.
 *
 * Regression guard for the long-standing footgun where ANTHROPIC_API_KEY in
 * host env was forwarded into the container UNCONDITIONALLY, silently
 * demoting `auth_mode: subscription` into API mode (the claude CLI inside
 * the container preferred the env var over the mounted ~/.claude session,
 * causing Tier-1 timeouts under post-beta budgets).
 *
 * Forwarding rules tested here:
 * - claude provider + subscription → ANTHROPIC_API_KEY NOT forwarded
 * - claude provider + api authMode → ANTHROPIC_API_KEY forwarded
 * - codex provider               → OPENAI_API_KEY forwarded (no Anthropic)
 * - gemini provider              → GOOGLE_API_KEY forwarded (no Anthropic)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';

// ─── Mocks ───────────────────────────────────────────────────────────────────

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

// fs mock is mutable per-test so we can simulate task JSON presence + content
// (needed to flip useApiOnly via readTaskAuthMode).
const fsState = {
  existsSyncImpl: (_path: string): boolean => false,
  readFileSyncImpl: (_path: string): string => '{}',
};

vi.mock('node:fs', () => ({
  existsSync: vi.fn((p: string) => fsState.existsSyncImpl(p)),
  readFileSync: vi.fn((p: string) => fsState.readFileSyncImpl(p)),
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
import { DockerSpawnBackend } from '../../src/orchestra/spawn-backend-docker.js';
import type { ModelType } from '../../src/core/types.js';

const mockSpawnSync = vi.mocked(spawnSync);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const capturedDockerRunArgs: string[][] = [];

function installSpawnRouter(): void {
  capturedDockerRunArgs.length = 0;
  mockSpawnSync.mockImplementation((cmd, args) => {
    const argv = (args as string[] | undefined) ?? [];
    const sub = argv[0];
    let stdout = '';

    if (cmd === 'docker' && sub === 'images') {
      stdout = 'imghash';
    } else if (cmd === 'docker' && sub === 'run') {
      capturedDockerRunArgs.push([...argv]);
      stdout = 'container-id-abc123';
    } else if (cmd === 'docker' && sub === 'inspect') {
      stdout = 'true|0';
    }

    return {
      stdout,
      stderr: '',
      status: 0,
      signal: null,
      pid: 1,
      output: ['', stdout, ''],
    } as unknown as ReturnType<typeof spawnSync>;
  });
}

/** Returns true iff `-e <KEY>=...` appears in argv. */
function hasEnvFlag(argv: string[], key: string): boolean {
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i] === '-e' && typeof argv[i + 1] === 'string') {
      const spec = argv[i + 1]!;
      if (spec.startsWith(`${key}=`)) return true;
    }
  }
  return false;
}

/**
 * Configure the fs mock so readTaskAuthMode() returns the requested authMode
 * value for taskId. existsSync returns true ONLY for the task JSON path; all
 * other existsSync queries (auth mount, .claude.json) default to false to
 * mirror the existing docker-provider-auth.test.ts isolation.
 */
function stubTaskAuthMode(taskId: string, authMode: 'subscription' | 'api'): void {
  fsState.existsSyncImpl = (p: string) => p.endsWith(`task-${taskId}.json`);
  fsState.readFileSyncImpl = (p: string) => {
    if (p.endsWith(`task-${taskId}.json`)) {
      return JSON.stringify({ authMode, scope: { filesWrite: [] } });
    }
    return '{}';
  };
}

function resetFsStubs(): void {
  fsState.existsSyncImpl = () => false;
  fsState.readFileSyncImpl = () => '{}';
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DockerSpawnBackend: env-forwarding auth-precedence (Sprint 214 T-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSpawnRouter();
    resetFsStubs();
    // Test-default: clear all four keys so each test sets only what it needs.
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('GOOGLE_API_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('subscription + ANTHROPIC_API_KEY set → does NOT forward ANTHROPIC_API_KEY', () => {
    // Subscription = no task-level "Auth: api" override. existsSync defaults
    // to false → readTaskAuthMode → undefined → useApiOnly === false.
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-host-leak');

    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('t-auth-sub', 'sonnet' as ModelType, 'prompt');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasEnvFlag(argv, 'ANTHROPIC_API_KEY')).toBe(false);
  });

  it('api authMode + ANTHROPIC_API_KEY set → forwards ANTHROPIC_API_KEY', () => {
    stubTaskAuthMode('t-auth-api', 'api');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-api-mode');

    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('t-auth-api', 'sonnet' as ModelType, 'prompt');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasEnvFlag(argv, 'ANTHROPIC_API_KEY')).toBe(true);
  });

  it('codex provider (gpt-4.1) → forwards OPENAI_API_KEY, NOT ANTHROPIC_API_KEY', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-openai');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-anthropic-irrelevant');

    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('t-auth-codex', 'gpt-4.1' as ModelType, 'prompt');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasEnvFlag(argv, 'OPENAI_API_KEY')).toBe(true);
    // Non-claude provider must not receive Anthropic's key (cross-provider
    // confusion guard).
    expect(hasEnvFlag(argv, 'ANTHROPIC_API_KEY')).toBe(false);
  });

  it('gemini provider (gemini-2.5-flash) → forwards GOOGLE_API_KEY, NOT ANTHROPIC_API_KEY', () => {
    vi.stubEnv('GOOGLE_API_KEY', 'ya29-google');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-anthropic-irrelevant');

    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('t-auth-gemini', 'gemini-2.5-flash' as ModelType, 'prompt');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasEnvFlag(argv, 'GOOGLE_API_KEY')).toBe(true);
    expect(hasEnvFlag(argv, 'ANTHROPIC_API_KEY')).toBe(false);
  });

  it('claude provider + subscription → does NOT forward OPENAI_API_KEY even if set', () => {
    // Regression bonus: OPENAI_API_KEY should also not leak into a claude
    // worker (cross-provider auth confusion guard, symmetric to ANTHROPIC).
    vi.stubEnv('OPENAI_API_KEY', 'sk-openai-leak');

    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('t-auth-claude-pure', 'haiku' as ModelType, 'prompt');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasEnvFlag(argv, 'OPENAI_API_KEY')).toBe(false);
  });
});
