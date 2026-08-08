// ═══ start-snapshot-branch — E2E-CLI (427-021) ══════════════════════════════
//
// Action-handler-level e2e for cli/commands/start.ts's --flow-id branch
// (TERM-FLOW-UNIFY Sprint-4, 426-001): consuming an approved RunFlow snapshot
// instead of planning fresh. runSprint is mocked (the ONLY thing standing
// between this test and a real sprint spawn); core/run-flow-store.ts,
// orchestra/run-job-service.ts, orchestra/exact-plan-start-service.ts and the
// run-flow coordinator run for REAL against a per-test tmpdir root (hermetic
// store-fixture, same pattern as tests/cli/run-flow-mount.test.ts) so the
// CAS/persistence contract is genuinely exercised.
//
// FAZ4B exact-child contract (current production truth in start.ts):
// the --flow-id child ingress additionally requires the one-shot detached-child
// capability (--exact-attempt-id/--exact-owner-nonce/--exact-log-ref) plus a
// durable start attempt in state PROCESS_SPAWNED whose recorded process
// identity matches THIS process. The parent seam that authors that attempt is
// orchestra/exact-plan-start-service.ts (prepareInProcessExactRun); this suite
// drives it for real so the child sees exactly what a production spawn sees.
//
// Three branches (goCriteria): (1) flag-on + valid snapshot + capability ->
// runSprint is called with preplannedSprint, never a fresh planSprint replan;
// (2) a digest/revision mismatch (or no approved snapshot at all) -> a typed
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
  resolveBrainModel: () => 'sonnet',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
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

vi.mock('../../src/core/provider.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/provider.js')>();
  return {
    ...actual,
    bootstrapProviders: vi.fn().mockResolvedValue({ registered: [], skipped: [], defaultProvider: null }),
  };
});

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

vi.mock('../../src/core/cost-config-loader.js', () => ({
  initCostConfig: vi.fn(),
  loadCostConfig: vi.fn(() => ({
    // KN2 contract: a LOADED cost config always carries `estimator` (resolved
    // from the bundled baseline by the real loader) — mocks must honor it.
    estimator: { default_input_tokens: 2700, output_tokens_by_effort: { low: 500, normal: 1500, high: 4000 }, budget_headroom_factor: 3 },
    _version: '1.0',
    providers: {},
    cost_limits: { sprint_max_usd: 5, daily_max_usd: 50, auto_confirm_below_usd: 2 },
    update_config: { sources_priority: ['bundled'] },
  })),
}));

vi.mock('../../src/core/cost-gate.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/cost-gate.js')>('../../src/core/cost-gate.js');
  return { ...actual, evaluateCostGate: vi.fn() };
});

import { loadConfig } from '../../src/core/config.js';
import { runSprint, readContext, planSprint } from '../../src/orchestra/brain.js';
import { resolveProjectRoot } from '../../src/cli/helpers/process.js';
import { print, printError, formatSprintSummary } from '../../src/cli/helpers/output.js';
import { registerStart } from '../../src/cli/commands/start.js';
import { saveApprovedSnapshot, loadRunHandle, type StoredApprovedSnapshot } from '../../src/core/run-flow-store.js';
import { prepareInProcessExactRun, type ExactStartLineageInput } from '../../src/orchestra/exact-plan-start-service.js';
import { getRunFlowCoordinator, _resetRunFlowCoordinatorsForTests } from '../../src/orchestra/run-flow-coordinator-registry.js';
import { getMessage } from '../../src/cli/helpers/messages.js';
import { SprintStatus, SprintPhase, TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task, ResolvedConfig } from '../../src/core/types.js';
import { evaluateCostGate } from '../../src/core/cost-gate.js';

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
      max_workers: 4, brain_model: 'claude-opus-4-8', default_model: 'claude-sonnet-5',
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
  const flowId = (overrides?.flowId ?? 'flow-1');
  const revision = overrides?.revision ?? 1;
  return {
    flowId,
    revision,
    planDigest: 'digest-abc123',
    approvedBy: { id: 'alperen' },
    approvedAt: '2026-07-12T00:00:00.000Z',
    // FAZ4B: proposal + planLineage are the durable lineage the exact-plan
    // start service demands before it will author a start attempt.
    proposal: {
      flowId,
      tenant: 'tenant-1',
      project: 'test-project',
      actor: { id: 'planner' },
      origin: 'api',
      revision,
      intentSummary: 'approved snapshot fixture',
    },
    planLineage: {
      tenantId: 'tenant-1',
      actor: { id: 'planner' },
      origin: 'api',
      correlationId: 'plan-correlation',
      idempotencyKey: 'plan-idempotency',
      sourceRef: 'source-plan',
    },
    sprint: makeSprint(),
    ...overrides,
  } as StoredApprovedSnapshot;
}

function makeStartLineage(idempotencyKey = 'start-idempotency'): ExactStartLineageInput {
  return {
    tenantId: 'tenant-1',
    actor: { id: 'alperen' }, // must equal snapshot.approvedBy (approved-actor authorization)
    origin: 'terminal',
    correlationId: 'start-correlation',
    causationId: 'plan-correlation', // causally references the plan lineage
    idempotencyKey,
    sourceId: 'terminal-session',
    authorization: { kind: 'approved-actor' },
  };
}

interface SeededChildCapability {
  attemptId: string;
  ownerNonce: string;
  logRef: string;
}

/**
 * Production-faithful parent seam: drives the run-flow coordinator to
 * STARTING (propose → preview → approve → start-request) and authors the
 * durable start attempt via the REAL exact-plan-start-service, recording THIS
 * process as the spawned child (prepareInProcessExactRun captures
 * process.pid + the real platform start token — exactly what start.ts
 * re-derives and compares).
 */
function seedStartedFlow(root: string, snapshot: StoredApprovedSnapshot): SeededChildCapability {
  const coordinator = getRunFlowCoordinator(root);
  coordinator.proposeFlow({
    proposal: snapshot.proposal!,
    commandId: `propose-${snapshot.flowId}`,
  });
  coordinator.recordPreview({
    preview: {
      flowId: snapshot.flowId,
      revision: snapshot.revision,
      planDigest: snapshot.planDigest,
      taskSummaries: [],
      policyDecision: 'allow',
      gateResult: 'pass',
    },
    commandId: `preview-${snapshot.flowId}`,
  });
  coordinator.grantApproval({
    flowId: snapshot.flowId,
    revision: snapshot.revision,
    planDigest: snapshot.planDigest,
    approvedBy: snapshot.approvedBy,
    commandId: `approve-${snapshot.flowId}`,
  });
  coordinator.requestStart({
    flowId: snapshot.flowId,
    revision: snapshot.revision,
    planDigest: snapshot.planDigest,
    commandId: `start-request-${snapshot.flowId}`,
  });

  const prepared = prepareInProcessExactRun({
    root,
    exactRef: {
      schemaVersion: 1,
      flowId: snapshot.flowId,
      revision: snapshot.revision,
      planDigest: snapshot.planDigest,
    },
    approvedSnapshot: snapshot,
    lineage: makeStartLineage(`start-${snapshot.flowId}`),
  });
  if (prepared.status !== 'process-spawned') {
    throw new Error(`unexpected prepare status: ${prepared.status}`);
  }
  return {
    attemptId: prepared.capability.attemptId,
    ownerNonce: prepared.capability.ownerNonce,
    logRef: join(root, '.deckent', 'recently-works', `start-${snapshot.flowId}.log`),
  };
}

function exactFlowArgs(
  snapshot: Pick<StoredApprovedSnapshot, 'flowId' | 'revision' | 'planDigest'>,
  capability: SeededChildCapability,
  overrides?: { revision?: string; planDigest?: string },
): string[] {
  return [
    'start', '--flow-id', snapshot.flowId,
    '--revision', overrides?.revision ?? String(snapshot.revision),
    '--plan-digest', overrides?.planDigest ?? snapshot.planDigest,
    '--exact-attempt-id', capability.attemptId,
    '--exact-owner-nonce', capability.ownerNonce,
    '--exact-log-ref', capability.logRef,
  ];
}

/** Capability triple for mismatch branches that must die BEFORE the attempt
 *  is ever consulted (the CAS check precedes loadStartAttempt). */
function placeholderCapability(root: string): SeededChildCapability {
  return {
    attemptId: 'attempt-x',
    ownerNonce: 'nonce-x',
    logRef: join(root, '.deckent', 'recently-works', 'start-x.log'),
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
    _resetRunFlowCoordinatorsForTests();
    process.exitCode = undefined;
    root = mkdtempSync(join(tmpdir(), 'start-snapshot-branch-'));
    mockResolveProjectRoot.mockReturnValue(root);
    mockReadContext.mockReturnValue({ memory: '', retro: '', debt: '', patterns: [] } as any);
    mockPlanSprint.mockResolvedValue(makeSprint() as any);
    // Faithful to the real runSprint contract: execution admission fires the
    // exact-plan admission callback (which publishes the durable run handle)
    // and PLAN materialization writes the exact task artifacts.
    mockRunSprint.mockImplementation(async (_root: string, _config: unknown, options?: any) => {
      options?.onExactPlanMaterialize?.();
      await options?.onExecutionAdmitted?.();
      return makeSprint() as any;
    });
    vi.mocked(evaluateCostGate).mockReturnValue({
      ok: true,
      estimate: {
        taskCount: 1,
        retryMultiplier: 1.2,
        cacheHitRatio: 0.7,
        perProvider: {},
        totalUncachedInputTokens: 0,
        totalCacheCreationTokens: 0,
        totalCacheReadTokens: 0,
        totalOutputTokens: 0,
        totalApiCostUsd: 0.5,
        subscriptionImpact: {},
        costNaive: 0.35,
        costRealistic: 0.5,
        costWorstCase: 0.8,
        budgetUsd: 5,
        withinBudget: true,
        percentOfBudget: 10,
        warnings: [],
        recommendations: [],
        unpricedModels: [],
      },
      autoConfirm: true,
      autoConfirmThresholdUsd: 2,
      overrideApplied: false,
    });
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
      const capability = seedStartedFlow(root, snapshot);

      await runCommand(root, exactFlowArgs(snapshot, capability));

      expect(mockRunSprint).toHaveBeenCalledTimes(1);
      expect(mockRunSprint).toHaveBeenCalledWith(
        root,
        expect.anything(),
        expect.objectContaining({
          preplannedSprint: snapshot.sprint,
          flowId: snapshot.flowId,
        }),
      );
      expect(mockPlanSprint).not.toHaveBeenCalled();
      expect(vi.mocked(evaluateCostGate)).toHaveBeenCalledTimes(1);
    });

    it('blocks unknown snapshot pricing under --force before persisting or running', async () => {
      const snapshot = makeApprovedSnapshot();
      saveApprovedSnapshot(root, snapshot);
      const capability = seedStartedFlow(root, snapshot);
      vi.mocked(evaluateCostGate).mockReturnValue({
        ok: false,
        reason: 'COST_PRICING_UNKNOWN',
        ceilingTripped: 'pricing',
        estimate: { costRealistic: 0, budgetUsd: 5 } as never,
        estimatedUsd: 0,
        budgetUsd: 5,
        unpricedModels: ['openrouter/vendor/unknown-paid'],
        message: 'pricing unavailable',
      });

      await runCommand(root, [...exactFlowArgs(snapshot, capability), '--force']);

      expect(process.exitCode).toBe(1);
      expect(mockRunSprint).not.toHaveBeenCalled();
      expect(loadRunHandle(root, snapshot.flowId)).toBeUndefined();
      expect(mockPlanSprint).not.toHaveBeenCalled();
    });

    it('persists a run handle durably via the real run-flow-store (not just in-memory)', async () => {
      const snapshot = makeApprovedSnapshot();
      saveApprovedSnapshot(root, snapshot);
      const capability = seedStartedFlow(root, snapshot);

      expect(loadRunHandle(root, snapshot.flowId)).toBeUndefined();

      await runCommand(root, exactFlowArgs(snapshot, capability));

      const handle = loadRunHandle(root, snapshot.flowId);
      expect(handle).toBeDefined();
      expect(handle?.revision).toBe(snapshot.revision);
      expect(handle?.planDigest).toBe(snapshot.planDigest);
      expect(handle?.handle.jobId).toBe(`flow-${snapshot.flowId}-r${snapshot.revision}`);
    });

    it('prints the formatted sprint summary on success (no error, no non-zero exit)', async () => {
      const snapshot = makeApprovedSnapshot();
      saveApprovedSnapshot(root, snapshot);
      const capability = seedStartedFlow(root, snapshot);

      await runCommand(root, exactFlowArgs(snapshot, capability));

      expect(formatSprintSummary).toHaveBeenCalled();
      expect(print).toHaveBeenCalledWith('Sprint summary');
      expect(printError).not.toHaveBeenCalled();
      expect(process.exitCode).toBeUndefined();
    });

    it('a second identical start is refused as a typed attempt-mismatch — spawnStart-equivalent runSprint is NOT called twice', async () => {
      const snapshot = makeApprovedSnapshot();
      saveApprovedSnapshot(root, snapshot);
      const capability = seedStartedFlow(root, snapshot);
      const args = exactFlowArgs(snapshot, capability);

      await runCommand(root, args);
      await runCommand(root, args);

      // First start spawns (runSprint called once) and settles the attempt
      // COMPLETED. The second, identical child start cannot re-enter a
      // terminal attempt: the current honest child contract refuses it with
      // the typed exact-attempt-mismatch error BEFORE ever reaching runSprint
      // again (the courteous no-op-duplicate messaging lives in the PARENT
      // flow surface — see mcp/tools/start.ts 'start.exact_duplicate').
      expect(mockRunSprint).toHaveBeenCalledTimes(1);
      expect(printError).toHaveBeenCalledWith(
        expect.objectContaining({ message: getMessage('start.exact_attempt_mismatch', 'en') }),
      );
      expect(process.exitCode).toBe(1);
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

      await runCommand(root, exactFlowArgs(snapshot, placeholderCapability(root), { revision: '2' }));

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

      await runCommand(root, exactFlowArgs(snapshot, placeholderCapability(root), { planDigest: 'digest-wrong' }));

      expect(printError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('digest-wrong') }),
      );
      expect(process.exitCode).toBe(1);
      expect(mockRunSprint).not.toHaveBeenCalled();
    });

    it('no approved snapshot at all -> RunJobFlowNotApprovedError, exitCode=1, runSprint never called', async () => {
      await runCommand(root, exactFlowArgs(
        { flowId: 'flow-never-approved', revision: 1, planDigest: 'digest-x' },
        placeholderCapability(root),
      ));

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

    it('flow flags without the detached-child capability triple -> typed capability refusal, exitCode=1', async () => {
      const snapshot = makeApprovedSnapshot();
      saveApprovedSnapshot(root, snapshot);

      // FAZ4B: a bare --flow-id/--revision/--plan-digest child start (no
      // --exact-attempt-id/--exact-owner-nonce/--exact-log-ref) is refused —
      // exact approved-plan execution demands the complete one-shot
      // parent→child capability.
      await runCommand(root, [
        'start', '--flow-id', snapshot.flowId,
        '--revision', String(snapshot.revision),
        '--plan-digest', snapshot.planDigest,
      ]);

      expect(printError).toHaveBeenCalledWith(
        expect.objectContaining({ message: getMessage('start.exact_capability_required', 'en') }),
      );
      expect(process.exitCode).toBe(1);
      expect(mockRunSprint).not.toHaveBeenCalled();
      expect(loadRunHandle(root, snapshot.flowId)).toBeUndefined();
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
