/**
 * tests/orchestra/docker-provider-auth.test.ts
 *
 * Tests for provider-aware auth mount in DockerSpawnBackend.
 * Sprint 203 Task 203-002.
 *
 * claude→~/.claude mount, codex→OPENAI_API_KEY env only, gemini→GOOGLE_API_KEY env only.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => '{}'),
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
    let status = 0;

    if (cmd === 'docker' && sub === 'images') {
      stdout = 'imghash';
    } else if (cmd === 'docker' && sub === 'run') {
      capturedDockerRunArgs.push([...argv]);
      stdout = 'container-id-abc123';
    } else if (cmd === 'docker' && sub === 'inspect') {
      stdout = 'true|0';
    } else if (cmd === 'claude' && sub === '--version') {
      stdout = 'claude 1.0.0 (host auth ok)';
    }

    return {
      stdout,
      stderr: '',
      status,
      signal: null,
      pid: 1,
      output: ['', stdout, ''],
    } as unknown as ReturnType<typeof spawnSync>;
  });
}

/** Check if any `-v src:dst` in argv has `src` containing the given substring. */
function hasVolumeMount(argv: string[], srcSubstring: string): boolean {
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i] === '-v') {
      const spec = argv[i + 1] ?? '';
      const [src] = spec.split(':');
      if (src?.includes(srcSubstring)) return true;
    }
  }
  return false;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DockerSpawnBackend: provider-aware auth mount (Sprint 203 T-002)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSpawnRouter();
  });

  it('mounts ~/.claude for a claude model (sonnet) in subscription mode', () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('t-auth-claude', 'sonnet' as ModelType, 'prompt');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasVolumeMount(argv, '.claude')).toBe(true);
  });

  it('does NOT mount ~/.claude for a codex model (gpt-4.1)', () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('t-auth-codex', 'gpt-4.1' as ModelType, 'prompt');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasVolumeMount(argv, '.claude')).toBe(false);
  });

  it('does NOT mount ~/.claude for a gemini model (gemini-2.5-flash)', () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('t-auth-gemini', 'gemini-2.5-flash' as ModelType, 'prompt');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasVolumeMount(argv, '.claude')).toBe(false);
  });

  it('mounts ~/.claude for haiku (subscription default)', () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('t-auth-haiku', 'haiku' as ModelType, 'prompt');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasVolumeMount(argv, '.claude')).toBe(true);
  });

  it('does NOT mount ~/.claude for gpt-5 (codex model)', () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('t-auth-gpt5', 'gpt-5' as ModelType, 'prompt');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasVolumeMount(argv, '.claude')).toBe(false);
  });

  it('does NOT mount ~/.claude for gemini-2.5-pro (gemini model)', () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('t-auth-gemini-pro', 'gemini-2.5-pro' as ModelType, 'prompt');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasVolumeMount(argv, '.claude')).toBe(false);
  });
});
