// ═══ do-real-plan — N678B: `deckent do`/propose_run gate-e2e with a REAL ═══
//                    fake-planner-driven multi-task plan (429-002, 511 hermetik ikizi)
//
// born-678 (429-001) replaced compileRunProposalIntent's single-task TODO
// scaffold with an injectable `RunProposalPlanner` seam that, by default,
// delegates to the real AI/structured planner core (`callZeroConfigPlanner`,
// orchestra/planner.ts). tests/orchestra/run-proposal-planner.test.ts already
// proves that seam in isolation (calling compileRunProposalIntent/
// compileRunProposal directly with an injected fake planner). What it does
// NOT prove: that the seam is actually reachable from `deckent do`'s real
// call path. `run-flow-controller.ts`'s `proposeRun()` calls
// `compileRunProposal(proposal)` with a single argument — always
// `defaultRunProposalPlanner` — so from `do.ts`'s CLI surface there is no
// caller-suppliable `RunProposalPlanner` parameter at all. The only injection
// point reachable from a test with write-scope limited to this file is the
// AI/provider BOUNDARY `callZeroConfigPlanner` itself (`vi.mock`'d below) —
// everything above it (compileRunProposalIntent, compileRunProposal,
// buildDirectives) stays the REAL, unmocked module chain, so a genuine
// multi-task DirectiveBuildIntent + DIRECTIVES markdown is produced, not a
// canned fixture standing in for it.
//
// This mirrors tests/cli/term-flow-composition.test.ts's own philosophy
// ("only the boundary that would otherwise require a real AI/provider
// bootstrap is faked; every other real module runs together in one
// continuous trajectory") and tests/cli/do-runflow-adapter.test.ts's exact
// CLI-level harness (`registerDo` + commander `parseAsync`, not a bare
// function call) — this file is the composition-gate for `deckent do`'s
// flag-on path specifically, covering two things do-runflow-adapter.test.ts
// does not: (a) a REAL multi-task plan flowing all the way from the
// fake-planner boundary into the printed preview + persisted snapshot, and
// (b) a genuinely GATE-RED (`promptGate.ok=false`, simulating a criteria-less
// plan) scenario, proving `deckent do` shows the human the true GATE:
// FAIL / POLICY: NEEDS APPROVAL state and still honestly rejects without an
// explicit `--yes` — never silently starting a red-gated plan.
//
// A real-binary host-side dogfood run (511) is this test's non-hermetic twin.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../../src/core/config.js', () => ({
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn(),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  planSprint: vi.fn(),
  readContext: vi.fn(),
}));

// The fake-planner boundary (born-678/429-001): compileRunProposalIntent's
// default `RunProposalPlanner` calls this real export directly. Faking it
// (instead of the compiler itself) keeps compileRunProposalIntent/
// compileRunProposal/buildDirectives genuinely REAL and unmocked.
vi.mock('../../src/orchestra/planner.js', () => ({
  callZeroConfigPlanner: vi.fn(),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn(),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

import { loadConfig } from '../../src/core/config.js';
import { planSprint, readContext } from '../../src/orchestra/brain.js';
import { callZeroConfigPlanner } from '../../src/orchestra/planner.js';
import { resolveProjectRoot } from '../../src/cli/helpers/process.js';
import { print, printError } from '../../src/cli/helpers/output.js';
import { registerDo, type DoSeamDeps } from '../../src/cli/commands/do.js';
import {
  createRunFlowController,
  type RunFlowController,
  type RunFlowControllerDeps,
} from '../../src/cli/repl/run-flow-controller.js';
import { loadApprovedSnapshot, loadRunHandle } from '../../src/core/run-flow-store.js';
import type { RunHandle } from '../../src/orchestra/run-job-service.js';
import { SprintStatus, SprintPhase, TaskStatus } from '../../src/core/types.js';
import type {
  Sprint, Task, ResolvedConfig, BrainContext, PlannerResult, PlannerTask,
} from '../../src/core/types.js';
import type { PromptGateResult } from '../../src/core/prompt-gate-types.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

const mockLoadConfig = vi.mocked(loadConfig);
const mockPlanSprint = vi.mocked(planSprint);
const mockReadContext = vi.mocked(readContext);
const mockCallZeroConfigPlanner = vi.mocked(callZeroConfigPlanner);
const mockResolveProjectRoot = vi.mocked(resolveProjectRoot);

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 8, brain_model: 'opus', default_model: 'sonnet',
      haiku_allowed: true, brain_planning: 'auto',
    },
    modes: {} as any,
    language: 'en', projectName: 'test', projectRoot: '/mock/root',
    version: '1.0.0', auto_docs: { tier1: true, tier2: true, tier3: false },
    terminal: { run_flow_v2: true } as any,
    ...overrides,
  } as ResolvedConfig;
}

function makeBrainContext(): BrainContext {
  return {
    directives: '', memory: '', retro: '', debt: [], patterns: '', decisions: '',
    existingTasks: [], projectState: { gitStatus: '', fileTree: [] },
  };
}

/** The fake-planner's own PlannerTask fixture — mirrors
 *  tests/orchestra/run-proposal-planner.test.ts's makePlannerTask/
 *  makeRealMultiTaskPlan exactly (thematic consistency across the two files
 *  covering 429-001's seam and 429-002's do-command wiring of it). */
function makePlannerTask(overrides?: Partial<PlannerTask>): PlannerTask {
  return {
    title: 'Backend export endpoints',
    description: 'Add POST /export/csv and /export/json handlers.',
    model: 'sonnet', effort: 'normal', priority: 'NORMAL',
    reason: 'Single-module CRUD change, follows existing route pattern.',
    scope: { directories: ['src/api/'], filesRead: ['src/api/router.ts'], filesWrite: ['src/api/export.ts'] },
    dependencies: [],
    goNogo: {
      goCriteria: 'POST /export/csv and /export/json both return 200 with correct content-type.',
      noGoCriteria: 'Either endpoint 500s or returns the wrong content-type.',
      techDebtAcceptable: 'Streaming for very large exports can follow up later.',
    },
    ...overrides,
  };
}

function makeRealMultiTaskPlan(): PlannerResult {
  return {
    reasoning: 'Split into backend, frontend, and integration-test tasks.',
    tasks: [
      makePlannerTask(),
      makePlannerTask({
        title: 'Export UI button',
        description: 'Add an "Export" dropdown to the toolbar (CSV / JSON).',
        scope: { directories: ['src/dashboard/'], filesRead: [], filesWrite: ['src/dashboard/ExportButton.tsx'] },
        dependencies: ['Backend export endpoints'],
        goNogo: {
          goCriteria: 'Clicking Export CSV/JSON triggers the matching endpoint and downloads a file.',
          noGoCriteria: 'The button is present but clicking it does nothing or errors.',
          techDebtAcceptable: '',
        },
      }),
      makePlannerTask({
        title: 'Integration tests',
        description: 'E2E test hitting both export endpoints against a seeded dataset.',
        scope: { directories: ['tests/api/'], filesRead: [], filesWrite: ['tests/api/export.test.ts'] },
        dependencies: ['Backend export endpoints', 'Export UI button'],
        goNogo: {
          goCriteria: 'tests/api/export.test.ts passes and asserts both response bodies.',
          noGoCriteria: 'Test file is missing or does not assert response content.',
          techDebtAcceptable: '',
        },
      }),
    ],
  };
}

/** The (separately mocked) Brain-plan Sprint fixture — same 3 task titles as
 *  the fake-planner plan above, purely for narrative consistency; planSprint
 *  is mocked independently (its own real AI/provider bootstrap is out of
 *  scope here, exactly like term-flow-composition.test.ts's own convention). */
function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: '001-001', title: 'Backend export endpoints',
    description: 'Add POST /export/csv and /export/json handlers.',
    model: 'sonnet', effort: 'normal', priority: 'NORMAL', reason: 'test',
    scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/export.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING, sprintId: 'sprint-rp-1', createdAt: new Date(0).toISOString(),
    ...overrides,
  } as Task;
}

function makeGreenSprint(): Sprint {
  return {
    id: 'sprint-rp-1', number: 1,
    status: SprintStatus.PLANNING, phase: SprintPhase.PLAN,
    tasks: [
      makeTask(),
      makeTask({ id: '001-002', title: 'Export UI button', description: 'Add an Export dropdown to the toolbar.' }),
      makeTask({ id: '001-003', title: 'Integration tests', description: 'E2E test hitting both export endpoints.' }),
    ],
    workers: ['w-001-001', 'w-001-002', 'w-001-003'],
    // no promptGate -> plan-preview-service computes gateResult 'skipped', policyDecision 'allow'.
  };
}

/** Same 3-task plan as the green fixture, but with a BLOCK prompt-gate
 *  finding simulating a criteria-less task — gateResult 'fail',
 *  policyDecision 'needs-approval' (plan-preview-service.ts's own mapping). */
function makeRedSprint(): Sprint {
  const promptGate: PromptGateResult = {
    ok: false,
    findings: [{
      taskId: '001-001', lint: 'decision-space', level: 'block', agentId: 'generic',
      message: 'goCriteria is empty/non-verifiable for this task — no concrete go/no-go decision was defined (criteria-less plan).',
      suggestion: 'Author a concrete, checkable goCriteria before approving this plan.',
    }],
    blockers: [{
      taskId: '001-001', lint: 'decision-space', level: 'block', agentId: 'generic',
      message: 'goCriteria is empty/non-verifiable for this task — no concrete go/no-go decision was defined (criteria-less plan).',
      suggestion: 'Author a concrete, checkable goCriteria before approving this plan.',
    }],
  };
  return { ...makeGreenSprint(), id: 'sprint-rp-2', promptGate };
}

/** Builds a `deps.createRunFlowController` factory backed by the REAL
 *  createRunFlowController, seeded deterministically — mirrors
 *  tests/cli/do-runflow-adapter.test.ts's own makeControllerFactory. */
function makeControllerFactory(spawnStart?: RunFlowControllerDeps['spawnStart']) {
  let created: RunFlowController | undefined;
  const factory = (deps: RunFlowControllerDeps): RunFlowController => {
    created = createRunFlowController({
      ...deps,
      now: () => new Date(Date.UTC(2026, 0, 1)).toISOString(),
      generateFlowId: () => 'flow-rp-1',
      ...(spawnStart ? { spawnStart } : {}),
    });
    return created;
  };
  return { factory, getController: () => created! };
}

async function runCommand(args: string[], deps: DoSeamDeps = {}): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerDo(program, deps);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride throws on exit
  }
}

function output(): string {
  return vi.mocked(print).mock.calls.map((c) => c[0] as string).join('\n');
}

// ─── Suite ──────────────────────────────────────────────────────────────────

describe('deckent do — flag-on, fake-planner-driven real multi-task plan (N678B, 429-002)', () => {
  let tmpRoot: string;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-do-real-plan-'));
    mockResolveProjectRoot.mockReturnValue(tmpRoot);
    mockReadContext.mockReturnValue(makeBrainContext());
    mockLoadConfig.mockResolvedValue(makeConfig());
  });

  afterEach(() => {
    process.exitCode = undefined;
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe('gate-green: propose -> real multi-task preview(digest) -> approve -> exact-snapshot start', () => {
    it('drives the fake-planner plan through the REAL compileRunProposal/buildDirectives chain, then approves + starts via the real RunFlow services (runSprint mock)', async () => {
      mockCallZeroConfigPlanner.mockReturnValue(makeRealMultiTaskPlan());
      mockPlanSprint.mockReturnValue(makeGreenSprint() as any);
      const spawnStart = vi.fn((_sprint: Sprint, flowId: string): RunHandle => ({
        flowId, jobId: `job-${flowId}`, logRef: '/fake/log.log',
      }));
      const { factory, getController } = makeControllerFactory(spawnStart);
      const goal = 'Ship the CSV+JSON exporter feature end to end';

      await runCommand(['do', goal, '--run', '--yes'], { createRunFlowController: factory });

      // ── the fake-planner boundary really drove compileRunProposal (429-001's
      // seam), reachable from deckent do's own call path — not a hardcoded scaffold ──
      expect(mockCallZeroConfigPlanner).toHaveBeenCalledTimes(1);
      const [description, model] = mockCallZeroConfigPlanner.mock.calls[0]!;
      expect(description).toBe(goal);
      expect(model).toBe('sonnet');

      // ── the REAL (unmocked) compileRunProposal/buildDirectives chain turned
      // that fake plan into genuine multi-task DIRECTIVES markdown — observed
      // via the brainContext.directives the mocked planSprint actually received ──
      expect(mockPlanSprint).toHaveBeenCalledTimes(1);
      const brainContextArg = mockPlanSprint.mock.calls[0]![2] as BrainContext;
      expect(brainContextArg.directives).toContain('## Task 1: Backend export endpoints');
      expect(brainContextArg.directives).toContain('## Task 2: Export UI button');
      expect(brainContextArg.directives).toContain('## Task 3: Integration tests');
      expect(brainContextArg.directives).not.toMatch(/TODO-fill-in/);

      // ── real preview(digest): gate passes, policy allows, all 3 real tasks shown ──
      const controller = getController();
      const preview = controller.getContext().preview!;
      expect(preview.gateResult).toBe('skipped');
      expect(preview.policyDecision).toBe('allow');
      expect(preview.taskSummaries).toHaveLength(3);
      expect(preview.planDigest).toMatch(/^[0-9a-f]{64}$/);

      const out = output();
      expect(out).toContain('GATE: SKIPPED');
      expect(out).toContain('POLICY: ALLOW');
      expect(out).toContain('Backend export endpoints');
      expect(out).toContain('Export UI button');
      expect(out).toContain('Integration tests');
      expect(out).toContain(getMessage('runFlow.planPreview.digestLabel', 'en'));

      // ── digest-bound-approval -> exact-snapshot -> detached job (mocked spawnStart
      // stands in for the real `deckent start`/runSprint subprocess) ──
      expect(spawnStart).toHaveBeenCalledTimes(1);
      expect(spawnStart).toHaveBeenCalledWith(expect.objectContaining({ id: 'sprint-rp-1' }), 'flow-rp-1');
      expect(controller.getContext().state).toBe('DETACHED_RUNNING');
      expect(out).toContain(getMessage('runFlow.mount.started', 'en', { jobId: 'job-flow-rp-1' }));

      const storedSnapshot = loadApprovedSnapshot(tmpRoot, 'flow-rp-1');
      expect(storedSnapshot?.planDigest).toBe(preview.planDigest);
      expect(storedSnapshot?.sprint.tasks).toHaveLength(3);
      // born-681 tek-yazar: parent disk-handle yazmaz (child persist-before-run).
      expect(loadRunHandle(tmpRoot, 'flow-rp-1')).toBeUndefined();
      expect(process.exitCode).toBeUndefined();
    });
  });

  describe('gate-red (criteria-less plan): honest reject, never starts', () => {
    it('still builds the real fake-planner multi-task plan, honestly shows GATE: FAIL / POLICY: NEEDS APPROVAL, and rejects without --yes', async () => {
      mockCallZeroConfigPlanner.mockReturnValue(makeRealMultiTaskPlan());
      mockPlanSprint.mockReturnValue(makeRedSprint() as any);
      const spawnStart = vi.fn();
      const { factory, getController } = makeControllerFactory(spawnStart);
      const goal = 'Ship a criteria-less exporter plan end to end';

      await runCommand(['do', goal, '--run'], { createRunFlowController: factory });

      // The fake-planner boundary still ran for real — a red gate does not
      // short-circuit plan compilation, only the approve/start decision.
      expect(mockCallZeroConfigPlanner).toHaveBeenCalledTimes(1);

      const controller = getController();
      const preview = controller.getContext().preview!;
      expect(preview.gateResult).toBe('fail');
      expect(preview.policyDecision).toBe('needs-approval');
      expect(preview.taskSummaries).toHaveLength(3); // genuinely multi-task, not degenerate

      const out = output();
      expect(out).toContain('GATE: FAIL');
      expect(out).toContain('POLICY: NEEDS APPROVAL');
      expect(out).toContain(getMessage('do.cancelled', 'en', { stage: 'AWAITING_APPROVAL', reason: 'yes-required' }));

      // Honest reject: no approve/startApproved was ever reached.
      expect(spawnStart).not.toHaveBeenCalled();
      expect(controller.getContext().state).toBe('CANCELLED');
      expect(loadApprovedSnapshot(tmpRoot, 'flow-rp-1')).toBeUndefined();
      expect(loadRunHandle(tmpRoot, 'flow-rp-1')).toBeUndefined();
      expect(process.exitCode).toBeUndefined();
    });
  });
});
