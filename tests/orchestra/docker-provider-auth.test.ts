/**
 * tests/orchestra/docker-provider-auth.test.ts
 *
 * Tests for provider-aware auth mount in DockerSpawnBackend.
 * Sprint 203 Task 203-002.
 *
 * Each subscription provider receives only its own credential files, never a
 * complete provider home or a foreign provider credential.
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
  existsSync: vi.fn((path: string) => /\.(claude|codex|gemini)\/(\.credentials\.json|auth\.json|gemini-credentials\.json|google_accounts\.json)$/.test(path)),
  readFileSync: vi.fn((path: string) => path.endsWith('/.gemini/settings.json')
    ? '{"security":{"auth":{"selectedType":"gemini-api-key"}}}'
    : '{}'),
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

vi.mock('../../src/core/task-result-settlement.js', () => {
  return import('../helpers/task-result-settlement-stub.js')
    .then(({ createTaskResultSettlementModuleStub }) => createTaskResultSettlementModuleStub());
});

import { spawnSync } from 'node:child_process';
import { buildProviderAuthIsolation } from '../../src/orchestra/spawn-backend-docker.js';

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

/** Check if any Docker bind mount source contains the given substring. */
function hasVolumeMount(argv: string[], srcSubstring: string): boolean {
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i] === '--mount') {
      const spec = argv[i + 1] ?? '';
      const src = spec.split(',').find(part => part.startsWith('src='));
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

  it('mounts only the Claude credential for claude-sonnet-5 subscription', () => {
    const argv = buildProviderAuthIsolation('/home/test', 'claude', '.claude', false).mountArgs;
    expect(hasVolumeMount(argv, '.claude/.credentials.json')).toBe(true);
    expect(argv.some(arg => arg.includes('/.claude:'))).toBe(false);
  });

  it('does NOT mount ~/.claude for a codex model (gpt-4.1)', () => {
    const argv = buildProviderAuthIsolation('/home/test', 'codex', '.codex', false).mountArgs;
    expect(hasVolumeMount(argv, '.claude')).toBe(false);
    expect(hasVolumeMount(argv, '.codex/auth.json')).toBe(true);
  });

  it('does NOT mount ~/.claude for a gemini model (gemini-2.5-flash)', () => {
    const argv = buildProviderAuthIsolation('/home/test', 'gemini', '.gemini', false).mountArgs;
    expect(hasVolumeMount(argv, '.claude')).toBe(false);
    expect(hasVolumeMount(argv, '.gemini/gemini-credentials.json')).toBe(true);
  });

  it('mounts only the Claude credential for claude-haiku-4-5-20251001', () => {
    const argv = buildProviderAuthIsolation('/home/test', 'claude', '.claude', false).mountArgs;
    expect(hasVolumeMount(argv, '.claude/.credentials.json')).toBe(true);
  });

  it('does NOT mount ~/.claude for gpt-5.6-sol (codex model)', () => {
    const argv = buildProviderAuthIsolation('/home/test', 'codex', '.codex', false).mountArgs;
    expect(hasVolumeMount(argv, '.claude')).toBe(false);
    expect(hasVolumeMount(argv, '.codex/auth.json')).toBe(true);
  });

  it('does NOT mount ~/.claude for gemini-2.5-pro (gemini model)', () => {
    const argv = buildProviderAuthIsolation('/home/test', 'gemini', '.gemini', false).mountArgs;
    expect(hasVolumeMount(argv, '.claude')).toBe(false);
  });
});
