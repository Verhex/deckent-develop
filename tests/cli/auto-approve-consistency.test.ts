// born-561 (382-007): `--auto-approve` must mean the same thing everywhere.
//
// Before this fix, `start.ts` hardcoded `autoApprove: true` into every
// `runSprint()` call regardless of the `--auto-approve` flag, and `run.ts`
// hardcoded `const autoApprove = true;` regardless of `opts.autoApprove` —
// so `--auto-approve` was silently ignored by both CLI commands while MCP's
// `deckent_start` already implemented the correct default-false semantics
// (src/mcp/tools/start.ts: `autoApprove === true`, schema default `false`).
//
// This suite asserts the CLI now matches that MCP-established contract:
// flag absent → false, `--auto-approve` present → true, for both commands.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

// ─── Hoisted spy (referenced inside the spawn-backend mock factory) ───────

const hoisted = vi.hoisted(() => ({
  backendSpawn: vi.fn(),
}));

// ─── Mocks ─────────────────────────────────────────────────────────────
// Shared across both `start` and `run` command paths — see comments below
// for why each module is (or isn't) mocked.

vi.mock('../../src/core/config.js', () => ({
  resolveBrainModel: () => 'claude-sonnet-5',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveDefaultModel: () => 'claude-sonnet-5',
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn(),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  runSprint: vi.fn(),
  readContext: vi.fn(),
  planSprint: vi.fn(),
  buildWorkerPrompt: vi.fn().mockReturnValue('You are a worker...'),
  BrainError: class BrainError extends Error {
    phase?: string;
    constructor(message: string, phase?: string) {
      super(message);
      this.name = 'BrainError';
      this.phase = phase;
    }
  },
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  isSessionActive: vi.fn(),
  setupWatchWindow: vi.fn(),
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
  TmuxError: class TmuxError extends Error {
    command?: string;
    constructor(msg: string, cmd?: string) {
      super(msg);
      this.name = 'TmuxError';
      this.command = cmd;
    }
  },
}));

// `run` command's spawn path resolves via config.spawn_backend (default
// 'docker' in production) — mock the factory so backend.spawn is the
// observable call, mirroring tests/cli/run.test.ts's proven pattern.
// start.ts also imports createSandboxBackend from this module (only invoked
// under --sandbox, which these tests never pass).
vi.mock('../../src/orchestra/spawn-backend.js', () => ({
  SpawnBackendFactory: {
    create: vi.fn(() => ({
      name: 'docker',
      liveUsageBudgetSupport: 'measured-stream',
      spawn: hoisted.backendSpawn,
      kill: vi.fn(),
      list: vi.fn().mockReturnValue([]),
      isAvailable: vi.fn().mockResolvedValue(true),
    })),
    createAsync: vi.fn(async () => ({
      name: 'docker',
      liveUsageBudgetSupport: 'measured-stream',
      spawn: hoisted.backendSpawn,
      kill: vi.fn(),
      list: vi.fn().mockReturnValue([]),
      isAvailable: vi.fn().mockResolvedValue(true),
    })),
    isTmuxAvailable: vi.fn(() => true),
  },
  resolveBackend: vi.fn((b: string) => (b === 'auto' ? 'docker' : b)),
  resetTmuxDeprecationWarning: vi.fn(),
  createSandboxBackend: vi.fn(),
  SpawnBackendError: class SpawnBackendError extends Error {
    backendName: string;
    constructor(msg: string, backendName: string) {
      super(msg);
      this.name = 'SpawnBackendError';
      this.backendName = backendName;
    }
  },
  TmuxBackend: class TmuxBackend {},
  SubprocessBackend: class SubprocessBackend {},
}));

vi.mock('../../src/core/provider.js', () => ({
  bootstrapProviders: vi.fn().mockResolvedValue({ registered: [], skipped: [], defaultProvider: null }),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatSprintSummary: vi.fn().mockReturnValue('Sprint summary'),
  formatTable: vi.fn().mockReturnValue('Task table'),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn(),
}));

// Deliberately NOT mocked (real modules run against a real, empty tmpdir —
// same proven-safe pattern as tests/cli/commands/start.test.ts and
// tests/cli/run.test.ts): node:fs, core/cost-*.js, core/notify*.js,
// core/event-stream.js, connectors/kpi-summary-dispatch.js,
// orchestra/sprint-controller.js, core/agent-pool.js, core/skill-pool.js,
// core/stack-detector.js, core/routing-engine.js,
// orchestra/execution-request-builder.js, cli/commands/doctor.js (skipped
// via --force), cli/commands/quick-start.js (skipped — no description arg).

import { loadConfig } from '../../src/core/config.js';
import { runSprint } from '../../src/orchestra/brain.js';
import { resolveProjectRoot } from '../../src/cli/helpers/process.js';
import { registerStart } from '../../src/cli/commands/start.js';
import { registerRun } from '../../src/cli/commands/run.js';

// ─── Fixtures ──────────────────────────────────────────────────────────

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    activeModeConfig: { brain_model: 'claude-opus-4-8', max_workers: 3 },
    brain_planning: 'auto',
    language: 'en',
    // Drives run.ts's spawn call to SpawnBackendFactory (production default —
    // see src/core/config.ts:1202) instead of the tmux fallback path.
    spawn_backend: 'docker',
    execution_budget: { roles: { worker: { default: { maxTurns: 1 } } } },
    ...overrides,
  };
}

function makeSprint(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sprint-001',
    number: 1,
    tasks: [{ id: '001-001', title: 'Task One', model: 'claude-sonnet-5', priority: 'NORMAL' }],
    reasoning: 'Test reasoning',
    planningMode: 'structured',
    ...overrides,
  };
}

let tmpRoot: string;

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'deckent-auto-approve-'));
  vi.mocked(resolveProjectRoot).mockReturnValue(tmpRoot);
  vi.mocked(loadConfig).mockResolvedValue(makeConfig() as any);
  vi.mocked(runSprint).mockResolvedValue(makeSprint() as any);
});

afterEach(() => {
  process.exitCode = undefined;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// ─── `deckent start` ─────────────────────────────────────────────────

describe('deckent start — --auto-approve consistency (born-561)', () => {
  async function runStart(...args: string[]): Promise<void> {
    const program = new Command();
    program.exitOverride();
    registerStart(program);
    try {
      await program.parseAsync(['node', 'deckent', 'start', '--force', ...args]);
    } catch {
      // commander exitOverride
    }
  }

  it('defaults autoApprove to false when --auto-approve is not passed', async () => {
    await runStart();
    expect(runSprint).toHaveBeenCalledWith(
      tmpRoot,
      expect.anything(),
      expect.objectContaining({ autoApprove: false }),
    );
  });

  it('honors --auto-approve: sets autoApprove to true', async () => {
    await runStart('--auto-approve');
    expect(runSprint).toHaveBeenCalledWith(
      tmpRoot,
      expect.anything(),
      expect.objectContaining({ autoApprove: true }),
    );
  });
});

// ─── `deckent run` ───────────────────────────────────────────────────

describe('deckent run — --auto-approve consistency (born-561)', () => {
  async function runRun(...args: string[]): Promise<void> {
    const program = new Command();
    program.exitOverride();
    registerRun(program);
    try {
      // Short timeout: no real worker ever writes a .result file in this
      // hermetic tmpdir — waitForRunResult times out quickly (matches the
      // existing "returns null on timeout" pattern in tests/cli/run.test.ts).
      // The spawn call (and its autoApprove arg) happens synchronously
      // before the wait, so the timeout does not affect this assertion.
      await program.parseAsync(['node', 'deckent', 'run', 'do the thing', '--timeout', '150', ...args]);
    } catch {
      // commander exitOverride
    }
  }

  it('defaults autoApprove to false when --auto-approve is not passed', async () => {
    await runRun();
    expect(hoisted.backendSpawn).toHaveBeenCalledWith(
      expect.stringMatching(/^run-/),
      'claude-sonnet-5',
      expect.any(String),
      expect.objectContaining({ autoApprove: false }),
    );
  });

  it('honors --auto-approve: sets autoApprove to true', async () => {
    await runRun('--auto-approve');
    expect(hoisted.backendSpawn).toHaveBeenCalledWith(
      expect.stringMatching(/^run-/),
      'claude-sonnet-5',
      expect.any(String),
      expect.objectContaining({ autoApprove: true }),
    );
  });
});
