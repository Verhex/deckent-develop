// ─── 593-001 F2c: design-catalog mount mask (flag-gated, default OFF) ───────
//
// Measured leak: spawn-backend-docker bind-mounts the WHOLE project root read-write
// at /workspace, so the repo's design catalogs travel into every worker container —
// `.claude/skills/` (11 SKILL.md, ~118.8KB) + `.claude/agents/` (3 files, ~8KB) —
// irrelevant to the typical worker task. `buildCatalogMaskMountArgs` overlays an
// EMPTY read-only host directory on those paths (same nested-overlay technique as
// buildDeckShadowMountArgs / buildDistReadOnlyMountArgs), so the worker sees them
// empty while the host tree is untouched.
//
// ADR-G-027 boundary: the mask closes MOUNT-side discovery only. The bodies of the
// skills ASSIGNED to a task are injected verbatim into the prompt by buildSkillBlock
// (prompt-god-template.ts) and are not touched here — no truncation, no access loss.
//
// Coverage:
//   1. buildCatalogMaskMountArgs — pure helper: flag OFF ⇒ zero args (byte-identical
//      argv pin), flag ON ⇒ one `:ro` overlay per PRESENT catalog, absent catalog ⇒
//      no arg (nested bind over a missing target would phantom-create it in the repo).
//   2. ensureCatalogMaskDir — idempotent empty mask source under `.tasks/`.
//   3. Wiring — DockerSpawnBackend.spawn() emits ZERO catalog mounts by default and
//      threads the overlays into the real `docker run` argv when the flag is on, with
//      every pre-existing mount arg unchanged.
//
// Hermetic: node:child_process + node:fs mocked (this file only, same pattern as
// tests/orchestra/docker-dist-guard.test.ts) — no real docker/filesystem touched.

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

// Path-aware existsSync so a single test can flip JUST one catalog directory to
// "absent" while every other existsSync call on the happy path keeps returning true.
let absentPaths: Set<string> = new Set();

vi.mock('node:fs', () => ({
  linkSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 2, mtimeMs: 0 })),
  chmodSync: vi.fn(),
  existsSync: vi.fn((p: string) => !absentPaths.has(String(p))),
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

vi.mock('../../src/core/task-result-settlement.js', () => {
  return import('../helpers/task-result-settlement-stub.js')
    .then(({ createTaskResultSettlementModuleStub }) => createTaskResultSettlementModuleStub());
});

vi.mock('../../src/orchestra/execution-landing-coordinator.js', async (importActual) => ({
  ...(await importActual<typeof import('../../src/orchestra/execution-landing-coordinator.js')>()),
  prepareDockerExecutionLanding: vi.fn(({ prompt }: { prompt: string }) => ({ prompt, context: null })),
}));

import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import {
  DockerSpawnBackend,
  buildCatalogMaskMountArgs,
  ensureCatalogMaskDir,
  CATALOG_MASK_RELATIVE_PATHS,
} from '../../src/orchestra/spawn-backend-docker.js';
import { SpawnBackendFactory } from '../../src/orchestra/spawn-backend.js';
import { DEFAULT_PROMPT_CONFIG, getConfigHelp } from '../../src/core/config.js';
import {
  TEST_DOCKER_EXECUTION_OPTIONS,
  budgetedDockerTaskJson,
} from '../helpers/budgeted-docker-execution-fixture.js';

const mockSpawnSync = vi.mocked(spawnSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const TEST_EXECUTION_OPTIONS = TEST_DOCKER_EXECUTION_OPTIONS;

const MASK_SOURCE = '/test/project/.tasks/.catalog-mask';
const SKILLS_HOST = '/test/project/.claude/skills';
const AGENTS_HOST = '/test/project/.claude/agents';

// ─── 1. Config default — the flag ships OFF ─────────────────────────────────

describe('prompt.catalog_mount_mask default (593-001 F2c)', () => {
  it('defaults to false so worker mounts stay byte-identical until opted in', () => {
    expect(DEFAULT_PROMPT_CONFIG.catalog_mount_mask).toBe(false);
  });

  it('publishes English and Turkish config-reference metadata', () => {
    expect(getConfigHelp('prompt.catalog_mount_mask')).toMatchObject({
      type: 'boolean',
      default: false,
      category: 'Prompt',
      description: expect.any(String),
      descriptionTr: expect.any(String),
    });
  });
});

// ─── 2. Pure helper — mask-arg generation ───────────────────────────────────

describe('buildCatalogMaskMountArgs (593-001 F2c)', () => {
  it('masks exactly the two design catalogs, read-only, when the flag is on', () => {
    const args = buildCatalogMaskMountArgs(true, MASK_SOURCE, CATALOG_MASK_RELATIVE_PATHS);
    expect(args).toEqual([
      '-v', `${MASK_SOURCE}:/workspace/.claude/skills:ro`,
      '-v', `${MASK_SOURCE}:/workspace/.claude/agents:ro`,
    ]);
  });

  it('emits ZERO args when the flag is off — the default, byte-identical argv pin', () => {
    // The whole point of the gate: nothing new lands in `docker run` argv while
    // prompt.catalog_mount_mask is false, even if both catalogs exist on the host.
    expect(buildCatalogMaskMountArgs(false, MASK_SOURCE, CATALOG_MASK_RELATIVE_PATHS)).toEqual([]);
    expect(buildCatalogMaskMountArgs(false, MASK_SOURCE, ['.claude/skills'])).toEqual([]);
  });

  it('emits NO arg for a catalog the caller reports absent (no phantom host dir)', () => {
    // A nested bind mount materializes a MISSING target on the host underlying dir
    // before mounting, and /workspace IS the project root (same inode) — masking a
    // non-existent `.claude/agents` would create it inside the user's repo.
    const args = buildCatalogMaskMountArgs(true, MASK_SOURCE, ['.claude/skills']);
    expect(args).toEqual(['-v', `${MASK_SOURCE}:/workspace/.claude/skills:ro`]);
    expect(args.some(a => a.includes('.claude/agents'))).toBe(false);
  });

  it('emits zero args when NO catalog exists on the host, even with the flag on', () => {
    expect(buildCatalogMaskMountArgs(true, MASK_SOURCE, [])).toEqual([]);
  });

  it('always mounts read-only (a worker must never write through the mask)', () => {
    const args = buildCatalogMaskMountArgs(true, MASK_SOURCE, CATALOG_MASK_RELATIVE_PATHS);
    for (let i = 0; i < args.length; i += 2) {
      expect(args[i]).toBe('-v');
      expect(args[i + 1]).toMatch(/:ro$/);
    }
  });
});

describe('ensureCatalogMaskDir (593-001 F2c)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the shared empty mask source under .tasks/ idempotently', () => {
    expect(ensureCatalogMaskDir('/test/project/.tasks')).toBe(MASK_SOURCE);
    expect(ensureCatalogMaskDir('/test/project/.tasks')).toBe(MASK_SOURCE);
    // recursive: true — a second worker in the same sprint must not throw on EEXIST.
    expect(mockMkdirSync).toHaveBeenCalledWith(MASK_SOURCE, { recursive: true });
    expect(mockMkdirSync).toHaveBeenCalledTimes(2);
  });
});

// ─── 3. Wiring — DockerSpawnBackend.spawn() argv ────────────────────────────

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
    } else if (cmd === 'claude' && argv.join(' ') === 'auth status --json') {
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

/** Args from a captured `docker run` argv that touch /workspace/.claude/. */
function catalogMountArgs(argv: string[]): string[] {
  return argv.filter(a => a.includes(':/workspace/.claude/'));
}

describe('DockerSpawnBackend: catalog mount mask wiring (593-001 F2c)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    absentPaths = new Set();
    // Heartbeat-authority identity readbacks must surface ENOENT: the full node:fs
    // mock cannot carry the WorkerHeartbeatAuthorityStore write→readback chain, and
    // the '{}' fallback would trip its schema guard. ENOENT routes the store onto
    // its honest uninitialized-attempt path (proven in the store's own suite).
    mockReadFileSync.mockImplementation(((path: unknown) => {
      if (String(path).includes('worker-heartbeat-authority')) {
        const error = new Error(`ENOENT: no such file or directory, open '${String(path)}'`) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }
      return budgetedDockerTaskJson(path);
    }) as typeof readFileSync);
    installSpawnRouter();
  });

  it('emits ZERO catalog mounts by DEFAULT (flag off) even though both catalogs exist', async () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('catalog-mask-default', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);
    await backend.lastSpawnCompletion;

    expect(capturedDockerRunArgs.length).toBe(1);
    expect(catalogMountArgs(capturedDockerRunArgs[0]!)).toEqual([]);
    // No mask source directory is created either — the gate is fully inert.
    expect(mockMkdirSync).not.toHaveBeenCalledWith(MASK_SOURCE, { recursive: true });
  });

  it('threads effective prompt.catalog_mount_mask through the factory into docker argv', async () => {
    const backend = SpawnBackendFactory.create({
      backend: 'docker',
      projectDir: '/test/project',
      effectiveConfig: {
        prompt: {
          ...DEFAULT_PROMPT_CONFIG,
          catalog_mount_mask: true,
        },
      },
    });

    backend.spawn('catalog-mask-factory', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);
    await (backend as DockerSpawnBackend).lastSpawnCompletion;

    expect(capturedDockerRunArgs.length).toBe(1);
    expect(catalogMountArgs(capturedDockerRunArgs[0]!)).toEqual([
      `${MASK_SOURCE}:/workspace/.claude/skills:ro`,
      `${MASK_SOURCE}:/workspace/.claude/agents:ro`,
    ]);
  });

  it('masks both catalogs read-only when the flag is on and both exist on the host', async () => {
    const backend = new DockerSpawnBackend('/test/project', { catalogMountMask: true });
    backend.spawn('catalog-mask-on', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);
    await backend.lastSpawnCompletion;

    expect(capturedDockerRunArgs.length).toBe(1);
    expect(catalogMountArgs(capturedDockerRunArgs[0]!)).toEqual([
      `${MASK_SOURCE}:/workspace/.claude/skills:ro`,
      `${MASK_SOURCE}:/workspace/.claude/agents:ro`,
    ]);
    expect(mockMkdirSync).toHaveBeenCalledWith(MASK_SOURCE, { recursive: true });
  });

  it('skips a catalog missing on the host (no phantom .claude/agents in the repo)', async () => {
    absentPaths = new Set([AGENTS_HOST]);
    const backend = new DockerSpawnBackend('/test/project', { catalogMountMask: true });
    backend.spawn('catalog-mask-partial', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);
    await backend.lastSpawnCompletion;

    expect(capturedDockerRunArgs.length).toBe(1);
    expect(catalogMountArgs(capturedDockerRunArgs[0]!)).toEqual([
      `${MASK_SOURCE}:/workspace/.claude/skills:ro`,
    ]);
  });

  it('emits no catalog mount at all when NEITHER catalog exists on the host', async () => {
    absentPaths = new Set([SKILLS_HOST, AGENTS_HOST]);
    const backend = new DockerSpawnBackend('/test/project', { catalogMountMask: true });
    backend.spawn('catalog-mask-none', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);
    await backend.lastSpawnCompletion;

    expect(capturedDockerRunArgs.length).toBe(1);
    expect(catalogMountArgs(capturedDockerRunArgs[0]!)).toEqual([]);
    expect(mockMkdirSync).not.toHaveBeenCalledWith(MASK_SOURCE, { recursive: true });
  });

  it('keeps every pre-existing mount byte-identical — the mask is purely additive', async () => {
    const backend = new DockerSpawnBackend('/test/project', { catalogMountMask: true });
    backend.spawn('catalog-mask-parity', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);
    await backend.lastSpawnCompletion;

    const argv = capturedDockerRunArgs[0]!;
    // Project root still read-write, .tasks/ and .locks/ untouched, dist/ still :ro.
    expect(argv).toContain('/test/project:/workspace');
    expect(argv).toContain('/test/project/.tasks:/workspace/.tasks');
    expect(argv).toContain('/test/project/.locks:/workspace/.locks');
    expect(argv).toContain('/test/project/dist:/workspace/dist:ro');
  });

  it('produces argv identical to the unmasked spawn except for the mask args', async () => {
    // The per-spawn random promptId legitimately differs between two spawns (it rides
    // the git-guard dir name and IDEMPOTENCY_KEY); normalize ONLY those two tokens so
    // the comparison measures the mask's argv impact and nothing else.
    const normalize = (argv: string[]): string[] => argv.map(a => a
      .replace(/IDEMPOTENCY_KEY=[0-9a-f]+$/, 'IDEMPOTENCY_KEY=<promptId>')
      .replace(/(deckent-git-guard\/[^:]*?)-[0-9a-f]{8}:/, '$1-<promptId>:'));

    const backendOff = new DockerSpawnBackend('/test/project');
    backendOff.spawn('catalog-parity-off', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);
    await backendOff.lastSpawnCompletion;
    const offArgv = normalize(capturedDockerRunArgs[0]!);

    installSpawnRouter();
    const backendOn = new DockerSpawnBackend('/test/project', { catalogMountMask: true });
    backendOn.spawn('catalog-parity-off', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);
    await backendOn.lastSpawnCompletion;
    const onArgv = normalize(capturedDockerRunArgs[0]!);

    // Strip the two `-v <mask>` pairs; what remains must equal the flag-off argv.
    const stripped: string[] = [];
    for (let i = 0; i < onArgv.length; i++) {
      const arg = onArgv[i]!;
      if (arg === '-v' && (onArgv[i + 1] ?? '').includes(':/workspace/.claude/')) {
        i++;
        continue;
      }
      stripped.push(arg);
    }
    expect(stripped).toEqual(offArgv);
    // Sanity: the normalization did not erase the mask itself.
    expect(onArgv.length - stripped.length).toBe(4);
  });
});
