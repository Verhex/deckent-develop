// ─── Sprint 191 T-001: Docker Worker Memory Budget Reform ──────────────────
//
// Verifies the Sprint 191 changes that broke the Sprint 189+190 exit-137 cycle:
//   1. parseMemoryString — pure helper for byte-normalizing docker memory strings
//   2. DockerSpawnBackend — defaults to --memory 4g --memory-swap 6g (was 8g/12g)
//   3. DockerSpawnBackend — constructor opts override the defaults
//   4. .deckent/config.json — max_workers is a NUMBER everywhere (top-level + modes),
//      api mode is capped to a safe value, worker_memory_limit/swap fields present.
//
// Test pattern mirrors tests/orchestra/docker-container-start-failed.test.ts:
// mock spawnSync, route `docker run` args into a capture buffer, then assert
// the captured argv contains the expected --memory / --memory-swap pair.

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

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
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
import {
  DockerSpawnBackend,
  DEFAULT_WORKER_MEMORY_LIMIT,
  DEFAULT_WORKER_MEMORY_SWAP,
  parseMemoryString,
} from '../../src/orchestra/spawn-backend-docker.js';

const mockSpawnSync = vi.mocked(spawnSync);

// ─── Helpers ────────────────────────────────────────────────────────────────

interface SpawnSyncOutcome {
  stdout: string;
  stderr: string;
  status: number;
}

/** Capture every `docker run` argv list invoked during a spawn(). */
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

/** Pull the value that follows a flag in a captured docker-run argv. */
function flagValue(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx === -1 || idx === argv.length - 1) return undefined;
  return argv[idx + 1];
}

// ─── parseMemoryString ──────────────────────────────────────────────────────

describe('parseMemoryString', () => {
  it('normalizes binary unit suffixes (k/m/g/t, case-insensitive) to bytes', () => {
    // 4g == 4 * 1024^3 == 4294967296 bytes
    const fourGB = 4 * 1024 * 1024 * 1024;
    expect(parseMemoryString('4g')).toBe(fourGB);
    expect(parseMemoryString('4G')).toBe(fourGB);
    expect(parseMemoryString('4096m')).toBe(fourGB);
    expect(parseMemoryString('4194304k')).toBe(fourGB);
    expect(parseMemoryString(String(fourGB))).toBe(fourGB);
    expect(parseMemoryString(String(fourGB) + 'b')).toBe(fourGB);
  });

  it('returns null for malformed / missing / non-positive input', () => {
    expect(parseMemoryString(undefined)).toBeNull();
    expect(parseMemoryString(null)).toBeNull();
    expect(parseMemoryString('')).toBeNull();
    expect(parseMemoryString('   ')).toBeNull();
    expect(parseMemoryString('garbage')).toBeNull();
    expect(parseMemoryString('4xyz')).toBeNull();
    expect(parseMemoryString('-1g')).toBeNull();
    expect(parseMemoryString('0g')).toBeNull();
  });

  it('accepts decimal values like 0.5g', () => {
    const halfGB = Math.floor(0.5 * 1024 * 1024 * 1024);
    expect(parseMemoryString('0.5g')).toBe(halfGB);
  });
});

// ─── DockerSpawnBackend: memory budget defaults ─────────────────────────────

describe('DockerSpawnBackend: memory budget defaults (Sprint 191 T-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSpawnRouter();
  });

  it('exports DEFAULT_WORKER_MEMORY_LIMIT=4g and DEFAULT_WORKER_MEMORY_SWAP=6g', () => {
    // Hardcoded values pre-Sprint-191 were 8g/12g — proven OOM-hostile on WSL2.
    // The new defaults are the contract that breaks the exit-137 cycle.
    expect(DEFAULT_WORKER_MEMORY_LIMIT).toBe('4g');
    expect(DEFAULT_WORKER_MEMORY_SWAP).toBe('6g');
  });

  it('passes --memory 4g --memory-swap 6g to docker run when opts omitted', () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('test-default-mem', 'sonnet', 'prompt-body');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(flagValue(argv, '--memory')).toBe('4g');
    expect(flagValue(argv, '--memory-swap')).toBe('6g');
  });

  it('uses constructor opts to override --memory / --memory-swap', () => {
    const backend = new DockerSpawnBackend('/test/project', {
      memoryLimit: '8g',
      memorySwap: '12g',
    });
    backend.spawn('test-override-mem', 'sonnet', 'prompt-body');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(flagValue(argv, '--memory')).toBe('8g');
    expect(flagValue(argv, '--memory-swap')).toBe('12g');
  });

  it('keeps the new memory cap below the 8g pre-191 hardcoded value', () => {
    // Regression sentinel: parseMemoryString helps cross-check that the new
    // default actually budgets *less* host RAM than the old hardcoded number.
    const oldHardcoded = parseMemoryString('8g')!;
    const newDefault = parseMemoryString(DEFAULT_WORKER_MEMORY_LIMIT)!;
    expect(newDefault).toBeLessThan(oldHardcoded);
    expect(newDefault).toBeGreaterThan(0);
  });
});

// ─── .deckent/config.json sanity (Sprint 191 T-001) ─────────────────────────

describe('.deckent/config.json — Sprint 191 max_workers + memory normalization', () => {
  type ConfigShape = {
    max_workers: number | string;
    worker_memory_limit?: string;
    worker_memory_swap?: string;
    modes: Record<string, { max_workers: number | string }>;
  };

  /**
   * Real fs/path access, bypassing the top-of-file `vi.mock('node:fs')`.
   * vi.importActual returns the unmocked module so the JSON read works.
   */
  async function loadProjectConfig(): Promise<ConfigShape> {
    const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const path = await vi.importActual<typeof import('node:path')>('node:path');
    const p = path.resolve(process.cwd(), '.deckent/config.json');
    const raw = fs.readFileSync(p, 'utf-8');
    return JSON.parse(raw) as ConfigShape;
  }

  it('top-level max_workers is a NUMBER equal to 3 (was string "3" pre-191)', async () => {
    const cfg = await loadProjectConfig();
    expect(typeof cfg.max_workers).toBe('number');
    expect(cfg.max_workers).toBe(3);
  });

  it('worker_memory_limit and worker_memory_swap are present at top level', async () => {
    const cfg = await loadProjectConfig();
    expect(cfg.worker_memory_limit).toBe('4g');
    expect(cfg.worker_memory_swap).toBe('6g');
  });

  it('all modes have a numeric max_workers within the safe range [1, 8]', async () => {
    const cfg = await loadProjectConfig();
    for (const [modeName, modeCfg] of Object.entries(cfg.modes)) {
      expect(typeof modeCfg.max_workers, `${modeName}.max_workers should be a number`).toBe('number');
      expect(modeCfg.max_workers).toBeGreaterThanOrEqual(1);
      // Pre-191 api mode was 10 (host-OOM territory on WSL2). 8 is the new ceiling.
      expect(modeCfg.max_workers).toBeLessThanOrEqual(8);
    }
  });

  it('api mode max_workers is bounded (<=4) for WSL2 safety', async () => {
    const cfg = await loadProjectConfig();
    const api = cfg.modes['api'];
    expect(api).toBeDefined();
    expect(typeof api!.max_workers).toBe('number');
    expect(api!.max_workers).toBeLessThanOrEqual(4);
  });
});
