// ─── Sprint 349 T-001: DOCKER-FIXPACK — stale-shadow EACCES + inert kind-memlimit ──
//
// Two verified defects in src/orchestra/spawn-backend-docker.ts:
//   (a) STALE-SHADOW-PERMS — ensureDeckShadowFile threw EACCES against a
//       pre-existing read-only (0o400) .deck-shadow left by an older build,
//       because writeFileSync's `mode` option only applies on file CREATE,
//       not on the O_TRUNC write against an existing file.
//   (b) KIND-MEMLIMIT-DEAD — resolveKindMemoryLimits/readTaskKind correctly
//       resolve a task's kind-specific --memory limit whenever kindMemoryLimits
//       is populated (proven here against the CURRENT live .deckent/config.json
//       worker_memory_limit_by_kind map). The reason no kind limit has ever
//       fired in production is an upstream wiring gap outside this file's
//       write scope — see the task 349-001 .result notes for file:line.
//
// Both suites use REAL fs + tmpdir fixtures, no node:fs/child_process mocks —
// neither code path under test spawns a subprocess or touches the network, so
// hermetic real-fs fixtures are simpler and more faithful than mocking (Test
// Hermeticity rule: tmpdir, cleaned up in afterEach).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DockerSpawnBackend,
  ensureDeckShadowFile,
  DEFAULT_WORKER_MEMORY_LIMIT,
  DEFAULT_WORKER_MEMORY_SWAP,
} from '../../src/orchestra/spawn-backend-docker.js';

// ─── (a) STALE-SHADOW-PERMS ─────────────────────────────────────────────────

describe('ensureDeckShadowFile: STALE-SHADOW-PERMS (349-001a)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deckent-shadow-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('converges a pre-existing read-only (0o400) shadow to writable 0o600 without throwing', () => {
    const shadowPath = join(dir, '.deck-shadow');
    // `mode` applies on CREATE — this reproduces the exact stale-perm state an
    // older build would leave behind (the bug: a later O_TRUNC write against
    // this file used to throw EACCES because mode is ignored on existing files).
    writeFileSync(shadowPath, 'stale-content-from-older-build', { mode: 0o400 });

    let resultPath = '';
    expect(() => {
      resultPath = ensureDeckShadowFile(dir);
    }).not.toThrow();

    expect(resultPath).toBe(shadowPath);
    expect(readFileSync(shadowPath, 'utf-8')).toBe('');
    if (process.platform !== 'win32') {
      expect(statSync(shadowPath).mode & 0o777).toBe(0o600);
    }
  });

  it('creates a fresh 0o600 shadow when none exists', () => {
    const shadowPath = join(dir, '.deck-shadow');
    expect(existsSync(shadowPath)).toBe(false);

    const resultPath = ensureDeckShadowFile(dir);

    expect(resultPath).toBe(shadowPath);
    if (process.platform !== 'win32') {
      expect(statSync(shadowPath).mode & 0o777).toBe(0o600);
    }
  });

  it('is idempotent across repeated calls sharing the same path (multi-worker sprint)', () => {
    const shadowPath = join(dir, '.deck-shadow');
    ensureDeckShadowFile(dir);
    chmodSync(shadowPath, 0o400); // a sibling worker / prior run left it read-only
    expect(() => ensureDeckShadowFile(dir)).not.toThrow();
    expect(() => ensureDeckShadowFile(dir)).not.toThrow();
    if (process.platform !== 'win32') {
      expect(statSync(shadowPath).mode & 0o777).toBe(0o600);
    }
  });
});

// ─── (b) KIND-MEMLIMIT-DEAD ─────────────────────────────────────────────────

// Mirrors the CURRENT live `.deckent/config.json` `worker_memory_limit_by_kind`
// map — proves the in-file resolution chain (readTaskKind → resolveKindMemoryLimits)
// is correct whenever kindMemoryLimits is actually populated via the constructor.
const LIVE_KIND_MEMORY_LIMITS: Record<string, string> = {
  documentation: '1536m',
  'code-development': '3g',
  test: '3g',
  refactor: '3g',
  security: '3g',
  devops: '3g',
  audit: '3g',
  config: '2g',
};

interface KindLimitsAccessor {
  resolveKindMemoryLimits(projectDir: string, taskId: string): { memory: string; swap: string } | undefined;
}

interface MemoryDefaultsAccessor {
  memoryLimit: string;
  memorySwap: string;
}

describe('DockerSpawnBackend.resolveKindMemoryLimits: KIND-MEMLIMIT-DEAD (349-001b)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deckent-kindlimit-'));
    mkdirSync(join(dir, '.tasks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeTaskKind(taskId: string, type: string): void {
    writeFileSync(join(dir, '.tasks', `task-${taskId}.json`), JSON.stringify({ type }), 'utf-8');
  }

  it('resolves the configured "documentation" kind to the current live config value (1536m)', () => {
    writeTaskKind('doc-001', 'documentation');
    const backend = new DockerSpawnBackend(dir, { kindMemoryLimits: LIVE_KIND_MEMORY_LIMITS });
    const resolved = (backend as unknown as KindLimitsAccessor).resolveKindMemoryLimits(dir, 'doc-001');

    expect(resolved).toEqual({ memory: '1536m', swap: '2304m' }); // swap = 1536 * 1.5
  });

  it('resolves a differently-configured kind ("code-development") to its own limit', () => {
    writeTaskKind('code-001', 'code-development');
    const backend = new DockerSpawnBackend(dir, { kindMemoryLimits: LIVE_KIND_MEMORY_LIMITS });
    const resolved = (backend as unknown as KindLimitsAccessor).resolveKindMemoryLimits(dir, 'code-001');

    expect(resolved).toEqual({ memory: '3g', swap: '4608m' }); // swap = 3072 * 1.5
  });

  it('returns undefined for an unconfigured kind ("design" is not in the live map)', () => {
    writeTaskKind('design-001', 'design');
    const backend = new DockerSpawnBackend(dir, { kindMemoryLimits: LIVE_KIND_MEMORY_LIMITS });
    const resolved = (backend as unknown as KindLimitsAccessor).resolveKindMemoryLimits(dir, 'design-001');

    expect(resolved).toBeUndefined();
  });

  it('short-circuits to undefined when kindMemoryLimits is empty (today\'s production reality — the wiring gap)', () => {
    writeTaskKind('any-001', 'documentation');
    // No kindMemoryLimits passed — this is exactly what SpawnBackendFactory.create()
    // does in production today (it never threads config.worker_memory_limit_by_kind
    // through), which is why no kind-based limit has ever fired despite the config
    // being set (see .result notes for the upstream file:line).
    const backend = new DockerSpawnBackend(dir);
    const resolved = (backend as unknown as KindLimitsAccessor).resolveKindMemoryLimits(dir, 'any-001');

    expect(resolved).toBeUndefined();
  });

  it('returns undefined when the task JSON is missing (readTaskKind graceful degradation)', () => {
    const backend = new DockerSpawnBackend(dir, { kindMemoryLimits: LIVE_KIND_MEMORY_LIMITS });
    const resolved = (backend as unknown as KindLimitsAccessor).resolveKindMemoryLimits(dir, 'missing-001');

    expect(resolved).toBeUndefined();
  });

  it('constructor default is what an unconfigured/unresolved kind falls back to', () => {
    const defaultBackend = new DockerSpawnBackend(dir);
    const defaults = defaultBackend as unknown as MemoryDefaultsAccessor;
    expect(defaults.memoryLimit).toBe(DEFAULT_WORKER_MEMORY_LIMIT);
    expect(defaults.memorySwap).toBe(DEFAULT_WORKER_MEMORY_SWAP);

    const overriddenBackend = new DockerSpawnBackend(dir, { memoryLimit: '2g', memorySwap: '3g' });
    const overridden = overriddenBackend as unknown as MemoryDefaultsAccessor;
    expect(overridden.memoryLimit).toBe('2g');
    expect(overridden.memorySwap).toBe('3g');
  });
});
