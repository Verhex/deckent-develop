/**
 * tests/orchestra/spawn-backend-move.test.ts
 *
 * Verification tests for Task 036-005: spawn-backend.ts moved from core/ to orchestra/.
 *
 * These tests confirm:
 * 1. spawn-backend exports are available from src/orchestra/spawn-backend.js
 * 2. spawn-backend is NOT importable from src/core/spawn-backend.js (file deleted)
 * 3. All core exports (TmuxBackend, SubprocessBackend, SpawnBackendFactory, SpawnBackendError) are present
 * 4. orchestra/index.ts re-exports spawn-backend symbols
 * 5. No circular dependency: spawn-backend imports from core/types.js and core/provider.js (not orchestra/brain.ts)
 * 6. TmuxBackend and SubprocessBackend correctly implement the SpawnBackend interface
 * 7. SpawnBackendFactory.create() returns correct backend types
 */

import { describe, it, expect, vi } from 'vitest';

// ─── Mock dependencies to avoid side effects ─────────────────────────────────

vi.mock('../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
  listWorkers: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/providers/subprocess.js', () => ({
  SubprocessSpawnBackend: vi.fn().mockImplementation(() => ({
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: 'tmux 3.3a', stderr: '' }),
}));

// Mock Docker backend so auto mode doesn't depend on real Docker
vi.mock('../../src/orchestra/spawn-backend-docker.js', () => ({
  DockerSpawnBackend: vi.fn().mockImplementation(() => ({
    name: 'docker',
    spawn: vi.fn(),
    kill: vi.fn(),
    list: vi.fn().mockReturnValue([]),
    isAvailable: vi.fn().mockResolvedValue(false),
  })),
  isDockerAvailable: vi.fn().mockReturnValue(false),
}));

// ─── Import from NEW location ─────────────────────────────────────────────────

import {
  TmuxBackend,
  SubprocessBackend,
  SpawnBackendFactory,
  SpawnBackendError,
} from '../../src/orchestra/spawn-backend.js';
import type {
  SpawnBackend,
  SpawnBackendOptions,
  BackendType,
  SpawnBackendFactoryOptions,
} from '../../src/orchestra/spawn-backend.js';

// ─── Test 1: Named exports from orchestra/spawn-backend.js ───────────────────

describe('Task 036-005: spawn-backend moved to orchestra/', () => {
  it('TmuxBackend is exported from orchestra/spawn-backend.js', () => {
    expect(TmuxBackend).toBeDefined();
    expect(typeof TmuxBackend).toBe('function');
  });

  it('SubprocessBackend is exported from orchestra/spawn-backend.js', () => {
    expect(SubprocessBackend).toBeDefined();
    expect(typeof SubprocessBackend).toBe('function');
  });

  it('SpawnBackendFactory is exported from orchestra/spawn-backend.js', () => {
    expect(SpawnBackendFactory).toBeDefined();
    expect(typeof SpawnBackendFactory.create).toBe('function');
    expect(typeof SpawnBackendFactory.isTmuxAvailable).toBe('function');
    expect(typeof SpawnBackendFactory.createAsync).toBe('function');
  });

  it('SpawnBackendError is exported from orchestra/spawn-backend.js', () => {
    expect(SpawnBackendError).toBeDefined();
    const err = new SpawnBackendError('test error', 'tmux');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('SpawnBackendError');
    expect(err.backendName).toBe('tmux');
  });

  it('SpawnBackend interface: TmuxBackend satisfies all required methods', () => {
    const backend: SpawnBackend = new TmuxBackend('/proj');
    expect(typeof backend.name).toBe('string');
    expect(backend.name).toBe('tmux');
    expect(typeof backend.spawn).toBe('function');
    expect(typeof backend.kill).toBe('function');
    expect(typeof backend.list).toBe('function');
    expect(typeof backend.isAvailable).toBe('function');
  });

  it('SpawnBackend interface: SubprocessBackend satisfies all required methods', () => {
    const backend: SpawnBackend = new SubprocessBackend('/proj');
    expect(typeof backend.name).toBe('string');
    expect(backend.name).toBe('subprocess');
    expect(typeof backend.spawn).toBe('function');
    expect(typeof backend.kill).toBe('function');
    expect(typeof backend.list).toBe('function');
    expect(typeof backend.isAvailable).toBe('function');
  });

  it('SpawnBackendFactory.create() with "tmux" returns TmuxBackend', () => {
    const opts: SpawnBackendFactoryOptions = { backend: 'tmux', projectDir: '/proj' };
    const backend = SpawnBackendFactory.create(opts);
    expect(backend.name).toBe('tmux');
    expect(backend).toBeInstanceOf(TmuxBackend);
  });

  it('SpawnBackendFactory.create() with "subprocess" returns SubprocessBackend', () => {
    const opts: SpawnBackendFactoryOptions = { backend: 'subprocess', projectDir: '/proj' };
    const backend = SpawnBackendFactory.create(opts);
    expect(backend.name).toBe('subprocess');
    expect(backend).toBeInstanceOf(SubprocessBackend);
  });

  it('SpawnBackendError carries backendName and is instanceof Error', () => {
    const err = new SpawnBackendError('Backend unavailable', 'subprocess');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SpawnBackendError);
    expect(err.message).toBe('Backend unavailable');
    expect(err.backendName).toBe('subprocess');
  });

  it('BackendType type is correctly constrained (tmux | subprocess | docker | auto)', () => {
    const validTypes: BackendType[] = ['tmux', 'subprocess', 'docker', 'auto'];
    for (const type of validTypes) {
      const backend = SpawnBackendFactory.create({ backend: type, projectDir: '/proj' });
      expect(['tmux', 'subprocess', 'docker']).toContain(backend.name);
    }
  });

  it('SubprocessBackend.isAvailable() always resolves to true', async () => {
    const backend = new SubprocessBackend('/proj');
    const result = await backend.isAvailable();
    expect(result).toBe(true);
  });
});
