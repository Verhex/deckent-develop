import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// B1a (smoke 2026-08-07, GR-2026-08-07-DOGFOOD-B1A-01). Bare `deckent start`
// used to replan silently — with REAL provider cost (AI planner / routing
// tie-judge calls) — while an approved, unconsumed RunFlow snapshot sat in the
// store, then execute a DIFFERENT plan from the one the owner approved. These
// pins hold the typed refusal, the conscious --force-replan override, and the
// two silence cases (consumed flow / empty store) where behaviour must stay
// byte-identical. The store side is REAL (the actual SQLite run-flow store in
// a hermetic tmpdir) — only the environment around the command is mocked.

vi.mock('../../src/core/config.js', () => ({
  resolveBrainModel: () => 'claude-sonnet-5',
  resolveBrainPlanningMode: (c: { brain_planning?: string }) => c?.brain_planning ?? 'auto',
  loadConfig: vi.fn(),
  readAuthMode: vi.fn().mockResolvedValue('subscription'),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  runSprint: vi.fn(),
  readContext: vi.fn(),
  planSprint: vi.fn(),
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
  isSessionActive: vi.fn().mockReturnValue(false),
  setupWatchWindow: vi.fn(),
}));

vi.mock('../../src/core/provider.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/provider.js')>();
  return {
    ...actual,
    bootstrapProviders: vi.fn().mockResolvedValue({ registered: [], skipped: [], defaultProvider: null }),
  };
});

vi.mock('../../src/cli/commands/doctor.js', () => ({
  runDoctorChecks: vi.fn().mockReturnValue({ checks: [] }),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatSprintSummary: vi.fn().mockReturnValue('Sprint summary'),
  formatTable: vi.fn().mockReturnValue('Task table'),
}));

// The project root is a REAL hermetic tmpdir so the guard exercises the real
// run-flow store, not a mock of it.
let projectRoot = '/unset';
vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn(() => projectRoot),
}));

vi.mock('../../src/cli/commands/quick-start.js', () => ({
  prepareZeroConfig: vi.fn(),
  cleanupZeroConfig: vi.fn(),
}));

import { loadConfig } from '../../src/core/config.js';
import { runSprint, readContext, planSprint } from '../../src/orchestra/brain.js';
import { print } from '../../src/cli/helpers/output.js';
import { registerStart } from '../../src/cli/commands/start.js';
import {
  saveApprovedSnapshot,
  saveRunHandle,
  type StoredApprovedSnapshot,
  type StoredRunHandleRecord,
} from '../../src/core/run-flow-store.js';

function makeConfig() {
  return {
    activeModeConfig: { brain_model: 'claude-opus-4-8', max_workers: 3 },
    brain_planning: 'auto',
    language: 'en',
  };
}

function makeSprint() {
  return {
    id: 'sprint-001',
    number: 1,
    tasks: [{ id: '001-001', title: 'Task One', model: 'claude-sonnet-5', priority: 'NORMAL' }],
    reasoning: 'Test reasoning',
    planningMode: 'structured',
  };
}

function seedApprovedSnapshot(root: string, flowId: string): void {
  saveApprovedSnapshot(root, {
    flowId,
    revision: 1,
    planDigest: 'a'.repeat(64),
    approvedBy: { id: 'owner', kind: 'human' },
    approvedAt: '2026-08-07T12:00:00.000Z',
    sprint: makeSprint(),
  } as unknown as StoredApprovedSnapshot);
}

function seedRunHandle(root: string, flowId: string): void {
  saveRunHandle(root, {
    flowId,
    revision: 1,
    planDigest: 'a'.repeat(64),
    handle: { runId: 'run-1' },
    startedAt: '2026-08-07T12:01:00.000Z',
  } as unknown as StoredRunHandleRecord);
}

async function runStart(...extraArgs: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerStart(program);
  try {
    await program.parseAsync(['node', 'test', 'start', ...extraArgs]);
  } catch {
    // Commander exitOverride throws instead of process.exit — expected.
  }
}

function printedText(): string {
  return vi.mocked(print).mock.calls.map((c) => String(c[0])).join('\n');
}

describe('deckent start — approved-flow guard (B1a)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    projectRoot = mkdtempSync(join(tmpdir(), 'b1a-guard-'));
    vi.mocked(loadConfig).mockResolvedValue(makeConfig() as never);
    vi.mocked(readContext).mockReturnValue({ memory: '', retro: '', debt: '', patterns: [] } as never);
    vi.mocked(planSprint).mockReturnValue(makeSprint() as never);
    vi.mocked(runSprint).mockResolvedValue(makeSprint() as never);
  });

  afterEach(() => {
    process.exitCode = undefined;
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('refuses to silently replan while an approved, unconsumed flow exists', async () => {
    seedApprovedSnapshot(projectRoot, 'flow-approved-1');

    await runStart();

    expect(process.exitCode).toBe(1);
    // Neither planning nor the sprint ran — no provider money was spent.
    expect(runSprint).not.toHaveBeenCalled();
    const out = printedText();
    expect(out).toMatch(/refusing to silently replan/u);
    expect(out).toContain('flow-approved-1');
    expect(out).toMatch(/--force-replan/u);
  });

  it('--force-replan consciously overrides the guard and the sprint proceeds', async () => {
    seedApprovedSnapshot(projectRoot, 'flow-approved-1');

    await runStart('--force-replan');

    expect(process.exitCode).not.toBe(1);
    expect(runSprint).toHaveBeenCalledTimes(1);
    expect(printedText()).toMatch(/overridden via --force-replan/u);
  });

  it('a CONSUMED approved flow (run handle exists) does not trip the guard', async () => {
    seedApprovedSnapshot(projectRoot, 'flow-consumed-1');
    seedRunHandle(projectRoot, 'flow-consumed-1');

    await runStart();

    expect(process.exitCode).not.toBe(1);
    expect(runSprint).toHaveBeenCalledTimes(1);
    expect(printedText()).not.toMatch(/refusing to silently replan/u);
  });

  it('an empty store leaves bare start byte-identical (baseline)', async () => {
    await runStart();

    expect(process.exitCode).not.toBe(1);
    expect(runSprint).toHaveBeenCalledTimes(1);
    expect(printedText()).not.toMatch(/refusing to silently replan/u);
  });
});
