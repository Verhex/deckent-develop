/**
 * tests/orchestra/f1014-auth-isolation.test.ts
 *
 * F1-014r: Docker per-worker auth-isolation non-leak regression tests.
 * Verifies provider-specific secrets do not cross container boundaries.
 *
 * Cases:
 * (a) claude-subscription spawn → OPENAI_API_KEY/GOOGLE_API_KEY NOT in docker -e
 * (b) codex spawn → ANTHROPIC_API_KEY NOT in docker -e
 * (c) 2 concurrent different-provider workers → each container has only its own secret
 * (d) CLAUDE_AUTH_REQUIRED only injected for claude provider (WM-5 guard)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  spawn: vi.fn(() => {
    const stub = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn(), resume: vi.fn() },
      on: vi.fn(),
      once: vi.fn(),
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
import { DockerSpawnBackend } from '../../src/orchestra/spawn-backend-docker.js';
import type { ModelType } from '../../src/core/types.js';

const mockSpawnSync = vi.mocked(spawnSync);
const TEST_EXECUTION_OPTIONS = { executionBudget: { maxTurns: 1 } } as const;

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
      stdout = 'container-id-f1014';
    } else if (cmd === 'docker' && sub === 'inspect') {
      stdout = 'true|0';
    } else if (cmd === 'claude' && argv.join(' ') === 'auth status --json') {
      stdout = '{"loggedIn":true}';
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

/** Returns true if the docker run argv contains `-e KEY` or `-e KEY=...`. */
function hasEnvFlag(argv: string[], key: string): boolean {
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i] === '-e') {
      const val = argv[i + 1] ?? '';
      if (val === key || val.startsWith(`${key}=`)) return true;
    }
  }
  return false;
}

// ─── (a) claude-subscription → no OPENAI/GOOGLE leak ─────────────────────────

describe('F1-014r (a): claude-subscription spawn — no OPENAI_API_KEY / GOOGLE_API_KEY in docker -e', () => {
  let savedOpenai: string | undefined;
  let savedGoogle: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    installSpawnRouter();
    savedOpenai = process.env.OPENAI_API_KEY;
    savedGoogle = process.env.GOOGLE_API_KEY;
    process.env.OPENAI_API_KEY = 'openai-test-secret';
    process.env.GOOGLE_API_KEY = 'google-test-secret';
  });

  afterEach(() => {
    if (savedOpenai === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = savedOpenai;
    }
    if (savedGoogle === undefined) {
      delete process.env.GOOGLE_API_KEY;
    } else {
      process.env.GOOGLE_API_KEY = savedGoogle;
    }
  });

  it('does NOT inject OPENAI_API_KEY into claude (sonnet) container', () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('t-f1014a-sonnet', 'claude-sonnet-5' as ModelType, 'prompt', TEST_EXECUTION_OPTIONS);

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasEnvFlag(argv, 'OPENAI_API_KEY')).toBe(false);
  });

  it('does NOT inject GOOGLE_API_KEY into claude (sonnet) container', () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('t-f1014a-sonnet-g', 'claude-sonnet-5' as ModelType, 'prompt', TEST_EXECUTION_OPTIONS);

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasEnvFlag(argv, 'GOOGLE_API_KEY')).toBe(false);
  });

  it('does NOT inject OPENAI_API_KEY into claude (opus) container', () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('t-f1014a-opus', 'claude-opus-4-8' as ModelType, 'prompt', TEST_EXECUTION_OPTIONS);

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasEnvFlag(argv, 'OPENAI_API_KEY')).toBe(false);
    expect(hasEnvFlag(argv, 'GOOGLE_API_KEY')).toBe(false);
  });
});

// ─── (b) codex spawn → no ANTHROPIC leak ─────────────────────────────────────

describe('F1-014r (b): codex spawn (subscription) — no ANTHROPIC_API_KEY in docker -e', () => {
  let savedAnthropic: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    installSpawnRouter();
    savedAnthropic = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'anthropic-test-secret';
  });

  afterEach(() => {
    if (savedAnthropic === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = savedAnthropic;
    }
  });

  it.each([
    ['t-f1014b-gpt41', 'gpt-4.1'],
    ['t-f1014b-gpt5', 'gpt-5.6-sol'],
    ['t-f1014b-gemini', 'gemini-2.5-flash'],
  ] as const)('%s is held before any credential forwarding', (taskId, model) => {
    expect(() => new DockerSpawnBackend('/test/project')
      .spawn(taskId, model as ModelType, 'prompt', TEST_EXECUTION_OPTIONS))
      .toThrow(/does not expose incremental measured usage/);
    expect(capturedDockerRunArgs).toHaveLength(0);
  });
});

// ─── (c) mixed-fleet: each container has only its own provider's secret ───────

describe('F1-014r (c): mixed-fleet — 2 workers each gets only its own provider secret', () => {
  let savedAnthropic: string | undefined;
  let savedOpenai: string | undefined;
  let savedGoogle: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    installSpawnRouter();
    savedAnthropic = process.env.ANTHROPIC_API_KEY;
    savedOpenai = process.env.OPENAI_API_KEY;
    savedGoogle = process.env.GOOGLE_API_KEY;
    // All three keys set on host — isolation must prevent cross-provider injection
    process.env.ANTHROPIC_API_KEY = 'anthropic-test-secret';
    process.env.OPENAI_API_KEY = 'openai-test-secret';
    process.env.GOOGLE_API_KEY = 'google-test-secret';
  });

  afterEach(() => {
    if (savedAnthropic === undefined) { delete process.env.ANTHROPIC_API_KEY; } else { process.env.ANTHROPIC_API_KEY = savedAnthropic; }
    if (savedOpenai === undefined) { delete process.env.OPENAI_API_KEY; } else { process.env.OPENAI_API_KEY = savedOpenai; }
    if (savedGoogle === undefined) { delete process.env.GOOGLE_API_KEY; } else { process.env.GOOGLE_API_KEY = savedGoogle; }
  });

  it('subscription Claude and Codex containers inherit no host API keys', () => {
    const claudeBackend = new DockerSpawnBackend('/test/project');
    claudeBackend.spawn('t-f1014c-claude', 'claude-sonnet-5' as ModelType, 'prompt', TEST_EXECUTION_OPTIONS);

    expect(() => new DockerSpawnBackend('/test/project')
      .spawn('t-f1014c-codex', 'gpt-4.1' as ModelType, 'prompt', TEST_EXECUTION_OPTIONS))
      .toThrow(/does not expose incremental measured usage/);

    const claudeArgv = capturedDockerRunArgs[0]!;
    expect(capturedDockerRunArgs).toHaveLength(1);

    // claude container must not receive OPENAI or GOOGLE keys
    expect(hasEnvFlag(claudeArgv, 'OPENAI_API_KEY')).toBe(false);
    expect(hasEnvFlag(claudeArgv, 'GOOGLE_API_KEY')).toBe(false);
  });

  it('subscription Claude and Gemini containers inherit no host API keys', () => {
    const claudeBackend = new DockerSpawnBackend('/test/project');
    claudeBackend.spawn('t-f1014c-claude2', 'claude-sonnet-5' as ModelType, 'prompt', TEST_EXECUTION_OPTIONS);

    expect(() => new DockerSpawnBackend('/test/project')
      .spawn('t-f1014c-gemini', 'gemini-2.5-flash' as ModelType, 'prompt', TEST_EXECUTION_OPTIONS))
      .toThrow(/does not expose incremental measured usage/);

    const claudeArgv = capturedDockerRunArgs[0]!;
    expect(capturedDockerRunArgs).toHaveLength(1);
    expect(hasEnvFlag(claudeArgv, 'GOOGLE_API_KEY')).toBe(false);
  });
});

// ─── (d) CLAUDE_AUTH_REQUIRED only for claude (WM-5) ─────────────────────────

describe('F1-014r (d): CLAUDE_AUTH_REQUIRED injected only for claude provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSpawnRouter();
  });

  it('injects CLAUDE_AUTH_REQUIRED for claude (sonnet)', () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('t-f1014d-claude', 'claude-sonnet-5' as ModelType, 'prompt', TEST_EXECUTION_OPTIONS);

    expect(capturedDockerRunArgs.length).toBe(1);
    expect(hasEnvFlag(capturedDockerRunArgs[0]!, 'CLAUDE_AUTH_REQUIRED')).toBe(true);
  });

  it.each([
    ['t-f1014d-codex', 'gpt-4.1'],
    ['t-f1014d-gemini', 'gemini-2.5-flash'],
  ] as const)('%s is held before CLAUDE_AUTH_REQUIRED can leak', (taskId, model) => {
    expect(() => new DockerSpawnBackend('/test/project')
      .spawn(taskId, model as ModelType, 'prompt', TEST_EXECUTION_OPTIONS))
      .toThrow(/does not expose incremental measured usage/);
    expect(capturedDockerRunArgs).toHaveLength(0);
  });
});
