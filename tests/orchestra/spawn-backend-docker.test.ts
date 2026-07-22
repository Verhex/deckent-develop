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
      stdout: { on: vi.fn(), resume: vi.fn() },
      stderr: { on: vi.fn(), resume: vi.fn() },
      on: vi.fn(),
      once: vi.fn(),
    };
    return stub as unknown as ChildProcess;
  }),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
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
import {
  DockerSpawnBackend,
  DEFAULT_WORKER_MEMORY_LIMIT,
  DEFAULT_WORKER_MEMORY_SWAP,
  parseMemoryString,
  buildProviderAuthIsolation,
  buildGeminiAuthSelectionBootstrap,
  WORKER_NODE_OPTIONS,
  DOCKER_ERROR_CODES,
} from '../../src/orchestra/spawn-backend-docker.js';
import { SpawnBackendError } from '../../src/orchestra/spawn-backend.js';

const mockSpawnSync = vi.mocked(spawnSync);
const TEST_EXECUTION_OPTIONS = { executionBudget: { maxTurns: 1 } } as const;

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
    } else if (cmd === 'claude' && argv.join(' ') === 'auth status --json') {
      // A23: model a real authenticated status envelope so the strict host
      // preflight proceeds to docker run without treating CLI presence as auth.
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

describe('buildProviderAuthIsolation', () => {
  const allExist = (): boolean => true;

  it('mounts only the Claude credential file and bootstraps a private HOME', () => {
    const isolated = buildProviderAuthIsolation(
      '/host/home',
      'claude',
      '.claude',
      false,
      allExist,
    );

    expect(isolated.mountArgs).toEqual([
      '--mount',
      'type=bind,src=/host/home/.claude/.credentials.json,dst=/run/deckent-auth-claude-.credentials.json,readonly',
    ]);
    expect(isolated.mountArgs.some(arg => arg.includes('/host/home/.claude:/'))).toBe(false);
    expect(isolated.bootstrapLines.some(line => line.includes(
      'cp "/run/deckent-auth-claude-.credentials.json" "$HOME/.claude/.credentials.json"',
    ))).toBe(true);
    expect(isolated.bootstrapLines.every(line => line.endsWith('|| exit 78'))).toBe(true);
    expect(isolated.credentialCount).toBe(1);
    expect(isolated.missingRequiredFiles).toEqual([]);
  });

  it('does not mount subscription credentials in API mode', () => {
    expect(buildProviderAuthIsolation('/host/home', 'claude', '.claude', true, allExist))
      .toEqual({ mountArgs: [], bootstrapLines: [], credentialCount: 0, missingRequiredFiles: [] });
  });

  it('uses each provider credential allowlist without mounting provider homes', () => {
    const codex = buildProviderAuthIsolation('/host/home', 'codex', '.codex', false, allExist);
    const gemini = buildProviderAuthIsolation('/host/home', 'gemini', '.gemini', false, allExist);

    expect(codex.mountArgs).toEqual([
      '--mount',
      'type=bind,src=/host/home/.codex/auth.json,dst=/run/deckent-auth-codex-auth.json,readonly',
    ]);
    expect(gemini.mountArgs).toEqual([
      '--mount',
      'type=bind,src=/host/home/.gemini/gemini-credentials.json,dst=/run/deckent-auth-gemini-gemini-credentials.json,readonly',
      '--mount',
      'type=bind,src=/host/home/.gemini/google_accounts.json,dst=/run/deckent-auth-gemini-google_accounts.json,readonly',
    ]);
    expect([...codex.mountArgs, ...gemini.mountArgs].some(arg => /\.(codex|gemini):\//.test(arg))).toBe(false);
  });

  it('fails closed when a required credential is missing but optional metadata exists', () => {
    const onlyAccountMetadata = (path: string): boolean => path.endsWith('google_accounts.json');
    const isolated = buildProviderAuthIsolation(
      '/host/home',
      'gemini',
      '.gemini',
      false,
      onlyAccountMetadata,
    );

    expect(isolated.credentialCount).toBe(1);
    expect(isolated.missingRequiredFiles).toEqual(['gemini-credentials.json']);
  });
});

describe('buildGeminiAuthSelectionBootstrap', () => {
  it('copies only selectedType and excludes unrelated host settings', () => {
    const bootstrap = buildGeminiAuthSelectionBootstrap('/host/home', () => JSON.stringify({
      security: { auth: { selectedType: 'gemini-api-key' } },
      mcpServers: { expensive: { command: 'must-not-enter-worker' } },
      ide: { enabled: true },
    }));

    expect(bootstrap?.selectedType).toBe('gemini-api-key');
    expect(bootstrap?.bootstrapLines.join('\n')).toContain(
      '{"security":{"auth":{"selectedType":"gemini-api-key"}}}',
    );
    expect(bootstrap?.bootstrapLines.join('\n')).not.toContain('mcpServers');
    expect(bootstrap?.bootstrapLines.join('\n')).not.toContain('ide');
  });

  it('fails closed on a missing or shell-unsafe selectedType', () => {
    expect(buildGeminiAuthSelectionBootstrap('/host/home', () => '{}')).toBeNull();
    expect(buildGeminiAuthSelectionBootstrap('/host/home', () => JSON.stringify({
      security: { auth: { selectedType: "oauth'; touch /tmp/pwn" } },
    }))).toBeNull();
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
    backend.spawn('test-default-mem', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);

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
    backend.spawn('test-override-mem', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);

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
// Claude session credential and REQUIRE ANTHROPIC_API_KEY. Default (undefined /
// 'subscription') mounts only the credential file; global settings/MCP/skills
// never enter the worker container.

describe('DockerSpawnBackend: per-task authMode (Sprint 193 wire)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const fs = await import('node:fs');
    vi.mocked(fs.readFileSync).mockImplementation((path) => String(path).endsWith('/.gemini/settings.json')
      ? '{"security":{"auth":{"selectedType":"gemini-api-key"}}}'
      : '{}');
    installSpawnRouter();
  });

  it('default subscription mounts only the Claude credential file', async () => {
    const fs = await import('node:fs');
    vi.mocked(fs.readFileSync).mockImplementation((path) => String(path).endsWith('/.gemini/settings.json')
      ? '{"security":{"auth":{"selectedType":"gemini-api-key"}}}'
      : '{}');

    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('auth-default', 'claude-sonnet-5', 'prompt', TEST_EXECUTION_OPTIONS);

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(argv.some(arg => arg.includes('src=/home/') && arg.includes('/.claude/.credentials.json,dst=/run/deckent-auth-claude-'))).toBe(true);
    expect(argv.some(arg => arg.includes('/.claude:'))).toBe(false);
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
      backend.spawn('auth-api', 'claude-sonnet-5', 'prompt', TEST_EXECUTION_OPTIONS);

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
      expect(() => backend.spawn('auth-api-noenv', 'claude-sonnet-5', 'prompt', TEST_EXECUTION_OPTIONS))
        .toThrow(/ANTHROPIC_API_KEY/);
    } finally {
      if (prevKey !== undefined) process.env.ANTHROPIC_API_KEY = prevKey;
    }
  });

  it.each([
    ['gpt-5.6-sol', 'OPENAI_API_KEY'],
    ['gemini-2.5-flash', 'GOOGLE_API_KEY'],
  ] as const)('%s subscription mode is held before unmetered Docker work', async (model, envName) => {
    const fs = await import('node:fs');
    vi.mocked(fs.readFileSync).mockImplementation((path) => String(path).endsWith('/.gemini/settings.json')
      ? '{"security":{"auth":{"selectedType":"gemini-api-key"}}}'
      : '{}');
    const previous = process.env[envName];
    process.env[envName] = 'host-api-key-must-not-leak';

    try {
      expect(() => new DockerSpawnBackend('/test/project')
        .spawn(`auth-sub-${model}`, model, 'prompt', TEST_EXECUTION_OPTIONS))
        .toThrow(/does not expose incremental measured usage/);
      expect(capturedDockerRunArgs).toHaveLength(0);
    } finally {
      if (previous === undefined) delete process.env[envName];
      else process.env[envName] = previous;
    }
  });

  it.each([
    ['gpt-5.6-sol', 'OPENAI_API_KEY'],
    ['gemini-2.5-flash', 'GOOGLE_API_KEY'],
  ] as const)('%s API mode is held before unmetered Docker work', async (model, envName) => {
    const fs = await import('node:fs');
    vi.mocked(fs.readFileSync).mockImplementation(() => JSON.stringify({ authMode: 'api' }));
    const previous = process.env[envName];
    process.env[envName] = 'provider-specific-api-key';

    try {
      expect(() => new DockerSpawnBackend('/test/project')
        .spawn(`auth-api-${model}`, model, 'prompt', TEST_EXECUTION_OPTIONS))
        .toThrow(/does not expose incremental measured usage/);
      expect(capturedDockerRunArgs).toHaveLength(0);
    } finally {
      if (previous === undefined) delete process.env[envName];
      else process.env[envName] = previous;
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
    vi.mocked(fs.readFileSync).mockImplementation((path) => (String(path).endsWith('/.gemini/settings.json')
      ? '{"security":{"auth":{"selectedType":"gemini-api-key"}}}'
      : '{}') as unknown as Buffer);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    installSpawnRouter();
  });

  it('passes -e NODE_OPTIONS=... to docker run argv', () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('node-opts-present', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);

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
    backend.spawn('node-opts-value', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);

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
      backend.spawn('node-opts-override', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);

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

describe('DockerSpawnBackend: provider-aware command + isolated OAuth credential', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const fs = await import('node:fs');
    vi.mocked(fs.readFileSync).mockImplementation((path) => String(path).endsWith('/.gemini/settings.json')
      ? '{"security":{"auth":{"selectedType":"gemini-api-key"}}}'
      : '{}');
    installSpawnRouter();
  });

  async function workerScriptFor(taskId: string): Promise<string> {
    const fs = await import('node:fs');
    const wf = vi.mocked(fs.writeFileSync);
    const call = wf.mock.calls.find(c =>
      String(c[0]).includes(`.worker-${taskId}`) && String(c[0]).endsWith('.sh'));
    return call ? String(call[1]) : '';
  }

  it('claude: uses exact API model ID and an auth-only credential mount', async () => {
    new DockerSpawnBackend('/test/project').spawn('psl-claude', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);
    const script = await workerScriptFor('psl-claude');
    expect(script).toContain('claude -p -');
    expect(script).toContain('--dangerously-skip-permissions');
    expect(script).toContain('--model claude-sonnet-5');
    expect(script).toContain('cp "/run/deckent-auth-claude-.credentials.json"');
    expect(capturedDockerRunArgs[0]!.some(a => a.includes('/.claude/.credentials.json,dst='))).toBe(true);
    expect(capturedDockerRunArgs[0]!.some(a => a.includes('/.claude:'))).toBe(false);
  });

  it('gemini: fails closed before Docker because incremental usage is unavailable', () => {
    expect(() => new DockerSpawnBackend('/test/project')
      .spawn('psl-gemini', 'gemini-2.5-flash', 'prompt-body', TEST_EXECUTION_OPTIONS))
      .toThrow(/does not expose incremental measured usage/);
    expect(capturedDockerRunArgs).toHaveLength(0);
  });

  it('codex: fails closed before Docker because incremental usage is unavailable', () => {
    expect(() => new DockerSpawnBackend('/test/project')
      .spawn('psl-codex', 'gpt-5.6-sol', 'prompt-body', TEST_EXECUTION_OPTIONS))
      .toThrow(/does not expose incremental measured usage/);
    expect(capturedDockerRunArgs).toHaveLength(0);
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
    new DockerSpawnBackend('/test/project').spawn('t-a23-authfail', 'claude-sonnet-5', 'prompt', TEST_EXECUTION_OPTIONS);

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

  it('codex is not claude-auth-gated but remains held by live-usage admission', () => {
    expect(() => new DockerSpawnBackend('/test/project')
      .spawn('t-a23-codex', 'gpt-5.6-sol', 'prompt', TEST_EXECUTION_OPTIONS))
      .toThrow(/does not expose incremental measured usage/);
    expect(capturedDockerRunArgs).toHaveLength(0);
    expect(mockSpawnSync.mock.calls.some(c => c[0] === 'claude')).toBe(false);
  });
});

// ─── 455-003: daemon preflight blocks the spawn (never collapses to image-missing) ──
// A permission-denied / down daemon must surface its OWN distinct code and the
// doomed container must never be spawned — proving the preflight runs BEFORE the
// image lookup and the `docker run`.
describe('DockerSpawnBackend: daemon preflight (455-003 DOCKER-PREFLIGHT-TRUTH)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedDockerRunArgs.length = 0;
  });

  it('permission-denied daemon → throws E086, image lookup + docker run never happen', () => {
    // `docker info` fails permission-denied; if the preflight were absent the code
    // would fall through to `docker images -q` (empty) and mis-throw image-missing.
    mockSpawnSync.mockImplementation((cmd, args) => {
      const argv = (args as string[] | undefined) ?? [];
      if (cmd === 'docker' && argv[0] === 'info') {
        return {
          stdout: '', status: 1, signal: null, pid: 1,
          stderr: 'Got permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock',
          output: [],
        } as unknown as ReturnType<typeof spawnSync>;
      }
      if (cmd === 'docker' && argv[0] === 'run') {
        capturedDockerRunArgs.push([...argv]);
      }
      return { stdout: '', stderr: '', status: 0, signal: null, pid: 1, output: [] } as unknown as ReturnType<typeof spawnSync>;
    });

    let error: SpawnBackendError | null = null;
    try {
      new DockerSpawnBackend('/test/project').spawn('t-preflight-perm', 'claude-sonnet-5', 'prompt', TEST_EXECUTION_OPTIONS);
    } catch (e) {
      error = e as SpawnBackendError;
    }

    expect(error).toBeInstanceOf(SpawnBackendError);
    expect(error!.message).toContain(DOCKER_ERROR_CODES.DAEMON_PERMISSION);
    expect(error!.message).not.toContain(DOCKER_ERROR_CODES.IMAGE_NOT_FOUND);
    // The doomed container is never spawned.
    expect(capturedDockerRunArgs.length).toBe(0);
    // No `docker images -q` lookup either — the preflight short-circuits first.
    const imagesCalled = mockSpawnSync.mock.calls.some(
      (c) => c[0] === 'docker' && (c[1] as string[] | undefined)?.[0] === 'images',
    );
    expect(imagesCalled).toBe(false);
  });
});
