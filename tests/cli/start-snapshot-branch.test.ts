// ═══ start-snapshot-branch — E2E-CLI (427-021) ══════════════════════════════
//
// Action-handler-level e2e for cli/commands/start.ts's --flow-id branch
// (TERM-FLOW-UNIFY Sprint-4, 426-001): consuming an approved RunFlow snapshot
// instead of planning fresh. runSprint is mocked (the ONLY thing standing
// between this test and a real sprint spawn); core/run-flow-store.ts and
// orchestra/run-job-service.ts run for REAL against a per-test tmpdir root
// (hermetic store-fixture, same pattern as tests/cli/run-flow-mount.test.ts)
// so the CAS/persistence contract is genuinely exercised.
//
// Three branches (goCriteria): (1) flag-on + valid snapshot -> runSprint is
// called with preplannedSprint, never a fresh planSprint replan; (2) a
// digest/revision mismatch (or no approved snapshot at all) -> a typed
// RunJobError exits the process without ever calling runSprint; (3) no flow
// flags given at all (flag-off) -> the pre-existing legacy path runs
// byte-identical, calling runSprint WITHOUT preplannedSprint and never
// touching the run-flow-store.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Mocks ──────────────────────────────────────────────────────────────

vi.mock('../../src/core/config.js', () => ({
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

vi.mock('../../src/core/provider.js', () => ({
  bootstrapProviders: vi.fn().mockResolvedValue({ registered: [], skipped: [], defaultProvider: null }),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn(),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatSprintSummary: vi.fn().mockReturnValue('Sprint summary'),
  formatTable: vi.fn().mockReturnValue('Task table'),
}));

vi.mock('../../src/cli/commands/doctor.js', () => ({
  runDoctorChecks: vi.fn().mockReturnValue({ checks: [] }),
}));

vi.mock('../../src/cli/commands/quick-start.js', () => ({
  prepareZeroConfig: vi.fn(),
  cleanupZeroConfig: vi.fn(),
}));

import { loadConfig } from '../../src/core/config.js';
import { runSprint, readContext, planSprint } from '../../src/orchestra/brain.js';
import { resolveProjectRoot } from '../../src/cli/helpers/process.js';
import { print, printError, formatSprintSummary } from '../../src/cli/helpers/output.js';
import { registerStart } from '../../src/cli/commands/start.js';
import { saveApprovedSnapshot, loadRunHandle, type StoredApprovedSnapshot } from '../../src/core/run-flow-store.js';
import { SprintStatus, SprintPhase, TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task, ResolvedConfig } from '../../src/core/types.js';

const mockLoadConfig = vi.mocked(loadConfig);
const mockRunSprint = vi.mocked(runSprint);
const mockReadContext = vi.mocked(readContext);
const mockPlanSprint = vi.mocked(planSprint);
const mockResolveProjectRoot = vi.mocked(resolveProjectRoot);

// ─── Fixtures ───────────────────────────────────────────────────────────

function makeConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 4, brain_model: 'opus', default_model: 'sonnet',
      haiku_allowed: true, brain_planning: 'auto',
    },
    modes: {} as ResolvedConfig['modes'],
    language: 'en', projectName: 'test-project', projectRoot: '/mock/root',
    version: '1.0.0',
    ...overrides,
  } as ResolvedConfig;
}

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: '001-001', title: 'Do the thing', description: 'Do the thing well.', model: 'sonnet',
    effort: 'normal', priority: 'NORMAL', reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING, sprintId: 'sprint-approved-001', createdAt: '2026-07-12T00:00:00.000Z',
    ...overrides,
  } as Task;
}

function makeSprint(overrides?: Partial<Sprint>): Sprint {
  return {
    id: 'sprint-approved-001', number: 42,
    status: SprintStatus.PLANNING, phase: SprintPhase.PLAN,
    tasks: [makeTask()], workers: ['w-001-001'],
    ...overrides,
  };
}

function makeApprovedSnapshot(overrides?: Partial<StoredApprovedSnapshot>): StoredApprovedSnapshot {
  return {
    flowId: 'flow-1',
    revision: 1,
    planDigest: 'digest-abc123',
    approvedBy: { id: 'alperen' },
    approvedAt: '2026-07-12T00:00:00.000Z',
    sprint: makeSprint(),
    ...overrides,
  };
}

async function runCommand(root: string, args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerStart(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride
  }
  void root;
}

function runFlowStoreDir(root: string): string {
  return join(root, '.deckent', 'runtime', 'run-flow-store');
}

// ─── Setup ────────────────────────────────────────────────────────────────

describe('start --flow-id branch (427-021)', () => {
  let root: string;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    root = mkdtempSync(join(tmpdir(), 'start-snapshot-branch-'));
    mockResolveProjectRoot.mockReturnValue(root);
    mockReadContext.mockReturnValue({ memory: '', retro: '', debt: '', patterns: [] } as any);
    mockPlanSprint.mockResolvedValue(makeSprint() as any);
    mockRunSprint.mockResolvedValue(makeSprint() as any);
  });

  afterEach(() => {
    process.exitCode = undefined;
    rmSync(root, { recursive: true, force: true });
  });

  // ─── Branch 1: flag-on + valid snapshot -> preplannedSprint, no replan ───

  describe('flag-on + valid snapshot', () => {
    beforeEach(() => {
      mockLoadConfig.mockResolvedValue(makeConfig({ terminal: { run_flow_v2: true } } as any));
    });

    it('calls runSprint with the approved snapshot as preplannedSprint (no fresh planSprint replan)', async () => {
      const snapshot = makeApprovedSnapshot();
      saveApprovedSnapshot(root, snapshot);

      await runCommand(root, [
        'start', '--flow-id', snapshot.flowId,
        '--revision', String(snapshot.revision),
        '--plan-digest', snapshot.planDigest,
      ]);

      expect(mockRunSprint).toHaveBeenCalledTimes(1);
      expect(mockRunSprint).toHaveBeenCalledWith(
        root,
        expect.anything(),
        expect.objectContaining({ preplannedSprint: snapshot.sprint }),
      );
      expect(mockPlanSprint).not.toHaveBeenCalled();
    });

    it('persists a run handle durably via the real run-flow-store (not just in-memory)', async () => {
      const snapshot = makeApprovedSnapshot();
      saveApprovedSnapshot(root, snapshot);

      expect(loadRunHandle(root, snapshot.flowId)).toBeUndefined();

      await runCommand(root, [
        'start', '--flow-id', snapshot.flowId,
        '--revision', String(snapshot.revision),
        '--plan-digest', snapshot.planDigest,
      ]);

      const handle = loadRunHandle(root, snapshot.flowId);
      expect(handle).toBeDefined();
      expect(handle?.revision).toBe(snapshot.revision);
      expect(handle?.planDigest).toBe(snapshot.planDigest);
      expect(handle?.handle.jobId).toBe(`flow-${snapshot.flowId}-r${snapshot.revision}`);
    });

    it('prints the formatted sprint summary on success (no error, no non-zero exit)', async () => {
      const snapshot = makeApprovedSnapshot();
      saveApprovedSnapshot(root, snapshot);

      await runCommand(root, [
        'start', '--flow-id', snapshot.flowId,
        '--revision', String(snapshot.revision),
        '--plan-digest', snapshot.planDigest,
      ]);

      expect(formatSprintSummary).toHaveBeenCalled();
      expect(print).toHaveBeenCalledWith('Sprint summary');
      expect(printError).not.toHaveBeenCalled();
      expect(process.exitCode).toBeUndefined();
    });

    it('a second identical start is a no-op-duplicate — spawnStart-equivalent runSprint is NOT called twice', async () => {
      const snapshot = makeApprovedSnapshot();
      saveApprovedSnapshot(root, snapshot);
      const args = [
        'start', '--flow-id', snapshot.flowId,
        '--revision', String(snapshot.revision),
        '--plan-digest', snapshot.planDigest,
      ];

      await runCommand(root, args);
      await runCommand(root, args);

      // First start spawns (runSprint called once); the second, identical
      // (flowId, revision, planDigest) start is idempotent — run-job-service's
      // no-op-duplicate path returns early, before ever reaching runSprint again.
      expect(mockRunSprint).toHaveBeenCalledTimes(1);
      expect(print).toHaveBeenCalledWith(expect.stringContaining('already started'));
    });
  });

  // ─── Branch 2: digest/revision mismatch -> typed error exit ─────────────

  describe('digest mismatch / not-approved -> typed error exit', () => {
    beforeEach(() => {
      mockLoadConfig.mockResolvedValue(makeConfig({ terminal: { run_flow_v2: true } } as any));
    });

    it('revision mismatch -> printError + exitCode=1, runSprint never called', async () => {
      const snapshot = makeApprovedSnapshot({ revision: 1 });
      saveApprovedSnapshot(root, snapshot);

      await runCommand(root, [
        'start', '--flow-id', snapshot.flowId,
        '--revision', '2', // mismatched
        '--plan-digest', snapshot.planDigest,
      ]);

      expect(printError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('revision=2') }),
      );
      expect(process.exitCode).toBe(1);
      expect(mockRunSprint).not.toHaveBeenCalled();
      expect(loadRunHandle(root, snapshot.flowId)).toBeUndefined();
    });

    it('planDigest mismatch -> printError + exitCode=1, runSprint never called', async () => {
      const snapshot = makeApprovedSnapshot({ planDigest: 'digest-real' });
      saveApprovedSnapshot(root, snapshot);

      await runCommand(root, [
        'start', '--flow-id', snapshot.flowId,
        '--revision', String(snapshot.revision),
        '--plan-digest', 'digest-wrong',
      ]);

      expect(printError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('digest-wrong') }),
      );
      expect(process.exitCode).toBe(1);
      expect(mockRunSprint).not.toHaveBeenCalled();
    });

    it('no approved snapshot at all -> RunJobFlowNotApprovedError, exitCode=1, runSprint never called', async () => {
      await runCommand(root, [
        'start', '--flow-id', 'flow-never-approved',
        '--revision', '1',
        '--plan-digest', 'digest-x',
      ]);

      expect(printError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('no approved snapshot') }),
      );
      expect(process.exitCode).toBe(1);
      expect(mockRunSprint).not.toHaveBeenCalled();
    });

    it('--flow-id without --revision/--plan-digest -> validation error, exitCode=1', async () => {
      await runCommand(root, ['start', '--flow-id', 'flow-1']);

      expect(printError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('must be supplied together') }),
      );
      expect(process.exitCode).toBe(1);
      expect(mockRunSprint).not.toHaveBeenCalled();
    });

    it('flags given but config.terminal.run_flow_v2 is not true -> validation error, exitCode=1', async () => {
      mockLoadConfig.mockResolvedValue(makeConfig({ terminal: { run_flow_v2: false } } as any));
      const snapshot = makeApprovedSnapshot();
      saveApprovedSnapshot(root, snapshot);

      await runCommand(root, [
        'start', '--flow-id', snapshot.flowId,
        '--revision', String(snapshot.revision),
        '--plan-digest', snapshot.planDigest,
      ]);

      expect(printError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('run_flow_v2') }),
      );
      expect(process.exitCode).toBe(1);
      expect(mockRunSprint).not.toHaveBeenCalled();
    });
  });

  // ─── Branch 3: flag-off (no flow flags) -> legacy path bit-identical ────

  describe('flag-off (no --flow-id/--revision/--plan-digest) -> legacy path unchanged', () => {
    beforeEach(() => {
      // run_flow_v2 left unset — the legacy path must not depend on it either way.
      mockLoadConfig.mockResolvedValue(makeConfig());
    });

    it('calls runSprint WITHOUT a preplannedSprint key (legacy call-shape)', async () => {
      await runCommand(root, ['start', '--force']);

      expect(mockRunSprint).toHaveBeenCalledTimes(1);
      const optsArg = mockRunSprint.mock.calls[0]?.[2] as Record<string, unknown> | undefined;
      expect(optsArg).toBeDefined();
      expect(optsArg).not.toHaveProperty('preplannedSprint');
    });

    it('never touches the run-flow-store — no store directory is created', async () => {
      await runCommand(root, ['start', '--force']);

      expect(existsSync(runFlowStoreDir(root))).toBe(false);
    });

    it('prints the formatted sprint summary on success (legacy success path unaffected)', async () => {
      await runCommand(root, ['start', '--force']);

      expect(formatSprintSummary).toHaveBeenCalled();
      expect(print).toHaveBeenCalledWith('Sprint summary');
      expect(printError).not.toHaveBeenCalled();
    });
  });
});
