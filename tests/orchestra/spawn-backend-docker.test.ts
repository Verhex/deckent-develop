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
  WORKER_NODE_OPTIONS,
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
  // Returns null when the live project config is absent (gitignored → not present
  // in a fresh CI checkout). These are dogfood self-checks of THIS project's
  // .deckent/config.json conventions; they skip where the file doesn't exist
  // rather than failing CI with ENOENT (hermeticity: no dependence on local state).
  async function loadProjectConfig(): Promise<ConfigShape | null> {
    const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const path = await vi.importActual<typeof import('node:path')>('node:path');
    const p = path.resolve(process.cwd(), '.deckent/config.json');
    try {
      const raw = fs.readFileSync(p, 'utf-8');
      return JSON.parse(raw) as ConfigShape;
    } catch {
      return null;
    }
  }

  // Sprint 238 İŞ6 redesign — PRESENT-then-conform, not REQUIRE-present.
  // These are dogfood self-checks of THIS repo's gitignored .deckent/config.json.
  // The original tests asserted exact values (worker_memory_limit === '2g') and
  // REQUIRED top-level fields to exist. Two problems:
  //   (1) Forcing '2g' is actively unsafe — it is BELOW the code default
  //       DEFAULT_WORKER_MEMORY_LIMIT='4g' (spawn-backend-docker.ts:40), so a
  //       worker container could OOM. Absence is the SAFE state (the 4g/6g code
  //       default applies via config merge); requiring a lower override inverted
  //       the safety intent.
  //   (2) An absent top-level override is legitimate (the mode preset / code
  //       default supplies the value), so REQUIRE-present produced false failures.
  // Redesign: when a field is PRESENT in the live config it must conform to the
  // safe contract; when ABSENT the runtime falls back to the safe code default,
  // so the check passes. Hermetic either way (and skips entirely on a fresh CI
  // checkout where the gitignored file is absent).
  //
  // Note on the api ≤ 4 / modes ≤ 8 ceilings: these are deliberately STRICTER
  // than the shipped MODE_PRESETS default (api=10) — a WSL2 host-OOM safety
  // policy for this dev box, not derivable from the code default (which is
  // higher). They are bounds, not exact values, so they don't suffer the drift
  // fragility the old exact-value asserts had.

  it('top-level max_workers, when present, is a number in [1, 20] (no string "3" pre-191 drift)', async (ctx) => {
    const cfg = await loadProjectConfig();
    if (!cfg) return ctx.skip();
    if (cfg.max_workers === undefined) return; // absent → code default applies (safe)
    expect(typeof cfg.max_workers).toBe('number');
    expect(cfg.max_workers).toBeGreaterThanOrEqual(1);
    expect(cfg.max_workers).toBeLessThanOrEqual(20);
  });

  it('worker_memory_limit/swap, when present, are valid docker memory strings (absent → safe 4g/6g default)', async (ctx) => {
    const cfg = await loadProjectConfig();
    if (!cfg) return ctx.skip();
    // Format check only — NOT an exact value. Forcing a specific low value (the
    // old '2g'/'3g') risked worker OOM below the 4g code default; the safe state
    // is to omit the override and inherit DEFAULT_WORKER_MEMORY_LIMIT.
    const dockerMem = /^\d+(\.\d+)?[bkmgBKMG]?$/;
    if (cfg.worker_memory_limit !== undefined) {
      expect(cfg.worker_memory_limit).toMatch(dockerMem);
    }
    if (cfg.worker_memory_swap !== undefined) {
      expect(cfg.worker_memory_swap).toMatch(dockerMem);
    }
  });

  it('every mode max_workers is a number within the WSL2-safe range [1, 8]', async (ctx) => {
    const cfg = await loadProjectConfig();
    if (!cfg) return ctx.skip();
    for (const [modeName, modeCfg] of Object.entries(cfg.modes)) {
      if (modeCfg.max_workers === undefined) continue; // absent → preset default
      expect(typeof modeCfg.max_workers, `${modeName}.max_workers should be a number`).toBe('number');
      expect(modeCfg.max_workers).toBeGreaterThanOrEqual(1);
      // Pre-191 api mode was 10 (host-OOM territory on WSL2). 8 is the ceiling.
      expect(modeCfg.max_workers).toBeLessThanOrEqual(8);
    }
  });

  it('api mode max_workers, when present, is bounded (<=4) for WSL2 host-OOM safety', async (ctx) => {
    const cfg = await loadProjectConfig();
    if (!cfg) return ctx.skip();
    const api = cfg.modes['api'];
    if (!api || api.max_workers === undefined) return; // absent → preset default
    expect(typeof api.max_workers).toBe('number');
    expect(api.max_workers).toBeLessThanOrEqual(4);
  });
});

// ─── Sprint 193+: per-task authMode wire ──────────────────────────────────
// feedback_container_auth_precedence: task.authMode === 'api' MUST skip the
// ~/.claude session mount and REQUIRE ANTHROPIC_API_KEY. Default (undefined /
// 'subscription') preserves the original mount so rate-limit-free subscription
// workers keep working.

describe('DockerSpawnBackend: per-task authMode (Sprint 193 wire)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSpawnRouter();
  });

  it('default (no authMode in task JSON) mounts ~/.claude into the container', async () => {
    const fs = await import('node:fs');
    vi.mocked(fs.readFileSync).mockImplementation(() => '{}');

    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('auth-default', 'sonnet', 'prompt');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    const hasClaudeMount = argv.some(arg => arg.includes('/.claude:'));
    expect(hasClaudeMount).toBe(true);
    const authEnvIdx = argv.indexOf('DECKENT_AUTH_MODE=subscription');
    expect(authEnvIdx).toBeGreaterThan(-1);
  });

  it('authMode="api" in task JSON skips ~/.claude mount and stamps env=api', async () => {
    const fs = await import('node:fs');
    vi.mocked(fs.readFileSync).mockImplementation(() => JSON.stringify({ authMode: 'api' }));
    const prevKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

    try {
      const backend = new DockerSpawnBackend('/test/project');
      backend.spawn('auth-api', 'sonnet', 'prompt');

      expect(capturedDockerRunArgs.length).toBe(1);
      const argv = capturedDockerRunArgs[0]!;
      const hasClaudeMount = argv.some(arg => arg.includes('/.claude:'));
      expect(hasClaudeMount).toBe(false);
      expect(argv.indexOf('DECKENT_AUTH_MODE=api')).toBeGreaterThan(-1);
    } finally {
      if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prevKey;
    }
  });

  it('authMode="api" without ANTHROPIC_API_KEY throws SpawnBackendError', async () => {
    const fs = await import('node:fs');
    vi.mocked(fs.readFileSync).mockImplementation(() => JSON.stringify({ authMode: 'api' }));
    const prevKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    try {
      const backend = new DockerSpawnBackend('/test/project');
      expect(() => backend.spawn('auth-api-noenv', 'sonnet', 'prompt'))
        .toThrow(/ANTHROPIC_API_KEY/);
    } finally {
      if (prevKey !== undefined) process.env.ANTHROPIC_API_KEY = prevKey;
    }
  });
});

// ─── Sprint 194 T-004 (W-M M-2): NODE_OPTIONS container env ────────────────
// Node 24's --max-old-space-size-percentage=75 binds V8 heap to the container
// memory cgroup instead of host RAM. The explicit `-e NODE_OPTIONS=...` pair
// must be present on every docker run, must encode 75 as the percentage, and
// must override anything the host shell leaks via process.env.NODE_OPTIONS.

describe('DockerSpawnBackend: NODE_OPTIONS container env (Sprint 194 T-004)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset readFileSync mock: authMode tests override it with JSON.stringify({authMode:'api'})
    // and vi.clearAllMocks() does not reset implementations — only call history.
    const fs = await import('node:fs');
    vi.mocked(fs.readFileSync).mockReturnValue('{}' as unknown as Buffer);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    installSpawnRouter();
  });

  it('passes -e NODE_OPTIONS=... to docker run argv', () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('node-opts-present', 'sonnet', 'prompt-body');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    const idx = argv.indexOf(WORKER_NODE_OPTIONS);
    expect(idx).toBeGreaterThan(-1);
    // The value MUST be preceded by `-e` so docker treats it as an env-var spec.
    expect(argv[idx - 1]).toBe('-e');
  });

  it('encodes the percentage value as 75 in the NODE_OPTIONS string', () => {
    // Sentinel test: catches accidental edits to the percentage (e.g. 50/90)
    // that would silently change every worker's V8 heap ceiling.
    expect(WORKER_NODE_OPTIONS).toBe('NODE_OPTIONS=--max-old-space-size-percentage=75');

    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('node-opts-value', 'sonnet', 'prompt-body');

    const argv = capturedDockerRunArgs[0]!;
    const optsEntry = argv.find(a => a.startsWith('NODE_OPTIONS='));
    expect(optsEntry).toBe('NODE_OPTIONS=--max-old-space-size-percentage=75');
    expect(optsEntry).toMatch(/--max-old-space-size-percentage=75$/);
  });

  it('overrides any host process.env.NODE_OPTIONS — container always gets the Deckent value', () => {
    // Simulate a host shell that has leaked a different NODE_OPTIONS into the
    // parent process (e.g. a developer setting --inspect on their box). The
    // container MUST still receive only the Deckent-defined value, exactly
    // once, with no extra `-e NODE_OPTIONS=<host-value>` pair.
    const prev = process.env.NODE_OPTIONS;
    process.env.NODE_OPTIONS = '--inspect --max-old-space-size=2048';

    try {
      const backend = new DockerSpawnBackend('/test/project');
      backend.spawn('node-opts-override', 'sonnet', 'prompt-body');

      const argv = capturedDockerRunArgs[0]!;
      const nodeOptionEntries = argv.filter(a => a.startsWith('NODE_OPTIONS='));
      expect(nodeOptionEntries).toEqual([WORKER_NODE_OPTIONS]);
      // The leaked host value must NOT have piggy-backed in.
      expect(argv.some(a => a.includes('--inspect'))).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.NODE_OPTIONS;
      else process.env.NODE_OPTIONS = prev;
    }
  });
});

describe('DockerSpawnBackend: PSL-1 provider-aware command + OAuth mount (Sprint 252)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSpawnRouter();
  });

  async function workerScriptFor(taskId: string): Promise<string> {
    const fs = await import('node:fs');
    const wf = vi.mocked(fs.writeFileSync);
    const call = wf.mock.calls.find(c =>
      String(c[0]).includes(`.worker-${taskId}`) && String(c[0]).endsWith('.sh'));
    return call ? String(call[1]) : '';
  }

  it('claude: docker worker script uses claude command + mounts ~/.claude (regression)', async () => {
    new DockerSpawnBackend('/test/project').spawn('psl-claude', 'sonnet', 'prompt-body');
    const script = await workerScriptFor('psl-claude');
    expect(script).toContain('claude -p -');
    expect(script).toContain('--dangerously-skip-permissions');
    expect(capturedDockerRunArgs[0]!.some(a => a.includes('/.claude:'))).toBe(true);
  });

  it('gemini: docker worker script uses gemini command (yolo/skip-trust, NOT claude flags) + mounts ~/.gemini', async () => {
    new DockerSpawnBackend('/test/project').spawn('psl-gemini', 'gemini-2.5-flash', 'prompt-body');
    const script = await workerScriptFor('psl-gemini');
    expect(script).toContain('gemini -p "$(cat');
    expect(script).toContain('--approval-mode yolo');
    expect(script).toContain('--skip-trust');
    expect(script).toContain('-m gemini-2.5-flash');
    expect(script).not.toContain('--dangerously-skip-permissions'); // claude-only flag must NOT leak
    expect(capturedDockerRunArgs[0]!.some(a => a.includes('/.gemini:'))).toBe(true);
  });

  it('codex: docker worker script uses validated codex flags (--dangerously-bypass…, apiId, stdin) + mounts ~/.codex', async () => {
    new DockerSpawnBackend('/test/project').spawn('psl-codex', 'gpt-5', 'prompt-body');
    const script = await workerScriptFor('psl-codex');
    expect(script).toContain('codex exec --skip-git-repo-check');
    expect(script).toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(script).toContain('--model gpt-5.5'); // apiId, not the gpt-5 alias
    expect(script).not.toContain('--full-auto');  // deprecated; not used
    expect(script).toMatch(/codex exec .*< "/);   // stdin promptFeed → prompt file piped in
    expect(capturedDockerRunArgs[0]!.some(a => a.includes('/.codex:'))).toBe(true);
  });
});
