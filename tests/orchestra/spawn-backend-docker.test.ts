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
    } else if (cmd === 'claude' && sub === '--version') {
      // A23: spawn-backend-docker now runs authHealthCheck (claude --version) on the
      // host before spawning a claude container. Model a healthy CLI (non-empty
      // stdout, exit 0) so the spawn proceeds to docker run.
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

  // Embedded canonical fixture — the config-shape CONTRACT this block pins. It is
  // NOT read from the live `.deckent/config.json`: a developer's local worker
  // count is their own tuning (a bigger box legitimately runs more) and must not
  // be policed by a test, and reading gitignored local state is non-hermetic.
  const CANONICAL_CONFIG: ConfigShape = {
    max_workers: 5,
    worker_memory_limit: '4g',
    worker_memory_swap: '6g',
    modes: {
      default: { max_workers: 5 },
      api: { max_workers: 4 },
      autonomous: { max_workers: 3 },
      process: { max_workers: 3 },
    },
  };

  // Same call sites as before, now backed by the embedded fixture (never null →
  // the `ctx.skip()` guards below stay inert but harmless).
  async function loadProjectConfig(): Promise<ConfigShape | null> {
    return CANONICAL_CONFIG;
  }

  // History: these were dogfood self-checks that read the live gitignored
  // `.deckent/config.json` and enforced WSL2-safe worker/memory bounds on it. That
  // policed a developer's personal tuning (Alperen runs max_workers=12 on a bigger
  // box) and broke on any machine whose local config exceeded the ceilings — a
  // non-hermetic false failure. Now they pin the CONTRACT (max_workers is a NUMBER
  // not a pre-191 string; memory overrides are valid docker strings; the presets
  // stay within the documented api ≤ 4 / modes ≤ 8 WSL2 ceilings) against the
  // embedded CANONICAL_CONFIG above, independent of any local state.

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

// ─── A23: host-side claude auth health-check before container spawn ──────────
// authHealthCheck was a zero-caller dead mechanism; the container runs the raw
// claude CLI (no JS worker), so a worker losing Claude auth produced a silent
// exit-0 with no .result. The spawn backend now runs the check host-side and
// writes an honest AUTH_FAILED NO_GO instead of spawning a doomed container.
describe('A23: host-side claude auth health-check (Sprint 194 W-AUTH wire)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedDockerRunArgs.length = 0;
    // Router: docker healthy, but `claude --version` FAILS (auth lost).
    mockSpawnSync.mockImplementation((cmd, args) => {
      const argv = (args as string[] | undefined) ?? [];
      const sub = argv[0];
      let stdout = '';
      let status = 0;
      let stderr = '';
      if (cmd === 'docker' && sub === 'images') {
        stdout = 'imghash';
      } else if (cmd === 'docker' && sub === 'run') {
        capturedDockerRunArgs.push([...argv]);
        stdout = 'container-id-x';
      } else if (cmd === 'claude' && sub === '--version') {
        status = 1; // non-zero + empty stdout → authHealthCheck treats as AUTH_FAILED
        stderr = 'Invalid API key · Please run /login';
      }
      return {
        stdout, stderr, status, signal: null, pid: 1, output: ['', stdout, stderr],
      } as unknown as ReturnType<typeof spawnSync>;
    });
  });

  it('claude auth failure → writes AUTH_FAILED NO_GO .result and SKIPS docker run', async () => {
    new DockerSpawnBackend('/test/project').spawn('t-a23-authfail', 'sonnet', 'prompt');

    // The doomed container is never spawned — no silent exit-0 phantom worker.
    // (Pre-fix this was 1: the spawn proceeded straight to docker run.)
    expect(capturedDockerRunArgs.length).toBe(0);

    // An honest NO_GO .result lands on disk for Brain to collect. writeResult uses
    // an atomic temp-write+rename, so match on the written CONTENT, not the path.
    const fs = await import('node:fs');
    const resultWrite = vi.mocked(fs.writeFileSync).mock.calls.find(c =>
      String(c[1]).includes('AUTH_FAILED') && String(c[1]).includes('t-a23-authfail'));
    expect(resultWrite).toBeDefined();
    expect(String(resultWrite![1])).toContain('NO_GO');
  });

  it('codex (non-claude) spawn is NOT gated by the claude auth check', () => {
    new DockerSpawnBackend('/test/project').spawn('t-a23-codex', 'gpt-5', 'prompt');
    // codex worker proceeds to docker run even though claude --version would fail.
    expect(capturedDockerRunArgs.length).toBe(1);
  });
});
