// ═══ run-flow-controller + deckent_propose_run + plan-preview-card tests ═══
// (TERM-FLOW-UNIFY Sprint-3 dilim, 425-001)
//
// Three concerns, one file (this task's write scope allows exactly one new
// test file):
//   1. native-tool-registry.ts's `runFlow` option — flag-off is a byte-
//      identical zero-behavior-change pin; flag-on registers exactly one new
//      tool (`deckent_propose_run`, 'silent' tier) and appends an escape-
//      hatch note to set/plan/start's descriptions.
//   2. run-flow-controller.ts's trajectory — propose (REAL generatePlanPreview
//      + compileRunProposal, only orchestra/brain.js's planSprint/readContext
//      mocked, mirroring tests/orchestra/plan-preview-service.test.ts's exact
//      hermetic pattern) -> AWAITING_APPROVAL -> approve()/reject() ->
//      APPROVED/CANCELLED. Never reaches STARTING (no such method exists on
//      the controller — see run-flow-controller.ts).
//   3. plan-preview-card.tsx's pure logic (key-mapper, rendering helpers,
//      i18n label-builder) — no ink-testing-library, same no-Ink-render
//      approach as approval-card.test.tsx.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadApprovedSnapshot } from '../../src/core/run-flow-store.js';

// 429-001 (born-678): compiler artık scaffold üretmez — AI/provider SINIRI olan
// callZeroConfigPlanner mock'lanır (do-real-plan.test.ts emsali); canned tek-task
// GERÇEK-şekilli plan döner, böylece propose-yolu hermetik kalır.
vi.mock('../../src/orchestra/planner.js', () => ({
  callZeroConfigPlanner: vi.fn(() => ({
    reasoning: 'canned single-task plan (hermetic planner boundary)',
    tasks: [{
      title: 'Planned task',
      description: 'Canned single-task plan for RunFlow tests (429-001 planner-seam).',
      scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/planned.ts'] },
      dependencies: [],
      model: 'sonnet', effort: 'normal', priority: 'NORMAL', reason: 'canned',
      goNogo: { goCriteria: 'The planned change works.', noGoCriteria: 'The planned change breaks.', techDebtAcceptable: '' },
    }],
  })),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  planSprint: vi.fn(),
  readContext: vi.fn(),
}));

import { planSprint, readContext } from '../../src/orchestra/brain.js';
import {
  buildNativeToolRegistry,
  resolveRunFlowEnabled,
} from '../../src/cli/repl/native-tool-registry.js';
import {
  RUN_FLOW_PROPOSAL_TOOL_NAME,
  RUN_FLOW_ESCAPE_HATCH_NOTE,
  RUN_FLOW_ESCAPE_HATCH_NAMES,
} from '../../src/cli/repl/cli-bridge-tool-specs.js';
import { createRunFlowController, type RunFlowController } from '../../src/cli/repl/run-flow-controller.js';
import {
  mapPlanPreviewKey,
  formatTaskSummaryLine,
  formatDigestShort,
  buildPlanPreviewCardLabels,
} from '../../src/cli/repl/plan-preview-card.js';
import type { RunFlowContext } from '../../src/core/run-flow-contract.js';
import { SprintStatus, SprintPhase, TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task, ResolvedConfig, BrainContext } from '../../src/core/types.js';

const mockPlanSprint = vi.mocked(planSprint);
const mockReadContext = vi.mocked(readContext);

// ─── Fixtures ────────────────────────────────────────────────────────────

function makeConfig(): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 8, brain_model: 'opus', default_model: 'sonnet',
      haiku_allowed: true, brain_planning: 'auto',
    },
    modes: {} as any,
    language: 'en', projectName: 'test', projectRoot: '/mock/root',
    version: '1.0.0', auto_docs: { tier1: true, tier2: true, tier3: false },
  } as ResolvedConfig;
}

function makeBrainContext(): BrainContext {
  return {
    directives: '', memory: '', retro: '', debt: [], patterns: '', decisions: '',
    existingTasks: [], projectState: { gitStatus: '', fileTree: [] },
  };
}

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: '001-001', title: 'Do the thing', description: 'Do the thing well.', model: 'sonnet',
    effort: 'normal', priority: 'NORMAL', reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING, sprintId: 'sprint-001', createdAt: new Date(0).toISOString(),
    ...overrides,
  } as Task;
}

function makeSprint(overrides?: Partial<Sprint>): Sprint {
  return {
    id: 'sprint-001', number: 1,
    status: SprintStatus.PLANNING, phase: SprintPhase.PLAN,
    tasks: [makeTask()], workers: ['w-001-001'],
    ...overrides,
  };
}

function fakeController(): RunFlowController {
  const collecting: RunFlowContext = { state: 'COLLECTING' };
  const awaitingApproval: RunFlowContext = { state: 'AWAITING_APPROVAL' };
  const approved: RunFlowContext = { state: 'APPROVED' };
  const cancelled: RunFlowContext = { state: 'CANCELLED' };
  return {
    getContext: () => collecting,
    proposeRun: vi.fn(async () => awaitingApproval),
    approve: vi.fn(() => approved),
    reject: vi.fn(() => cancelled),
  };
}

// ─── native-tool-registry.ts — `runFlow` option (flag-off/flag-on pin) ─────

describe('deckent_propose_run — flag-gated registration (terminal.run_flow_v2)', () => {
  it('resolveRunFlowEnabled — only literal true enables (fail-closed)', () => {
    expect(resolveRunFlowEnabled(undefined)).toBe(false);
    expect(resolveRunFlowEnabled({})).toBe(false);
    expect(resolveRunFlowEnabled({ run_flow_v2: false })).toBe(false);
    expect(resolveRunFlowEnabled({ run_flow_v2: true })).toBe(true);
  });

  it('flag-off (omitted): no deckent_propose_run, set/plan/start descriptions carry no escape-hatch note', () => {
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir() });
    expect(reg.get(RUN_FLOW_PROPOSAL_TOOL_NAME)).toBeUndefined();
    for (const name of RUN_FLOW_ESCAPE_HATCH_NAMES) {
      expect(reg.get(name)!.description).not.toContain(RUN_FLOW_ESCAPE_HATCH_NOTE);
    }
  });

  it('flag-off (explicit enabled:false): identical tool list/descriptions/tiers to omitted — zero behavior change pin', () => {
    const omitted = buildNativeToolRegistry({ cwd: () => tmpdir() });
    const explicitOff = buildNativeToolRegistry({
      cwd: () => tmpdir(),
      runFlow: { enabled: false, controller: fakeController() },
    });
    const namesOmitted = omitted.list().map((t) => t.name).sort();
    const namesOff = explicitOff.list().map((t) => t.name).sort();
    expect(namesOff).toEqual(namesOmitted);
    for (const name of namesOmitted) {
      expect(explicitOff.get(name)!.description).toBe(omitted.get(name)!.description);
      expect(explicitOff.get(name)!.tier).toBe(omitted.get(name)!.tier);
    }
  });

  it('flag-on: registers deckent_propose_run (silent tier, builtin source) and appends the escape-hatch note to set/plan/start — tool-count pin adds exactly one', () => {
    const baseline = buildNativeToolRegistry({ cwd: () => tmpdir() });
    const flagged = buildNativeToolRegistry({
      cwd: () => tmpdir(),
      runFlow: { enabled: true, controller: fakeController() },
    });

    // tool-count pin — two-state: flag-on adds EXACTLY one tool over flag-off.
    expect(flagged.list().length).toBe(baseline.list().length + 1);

    const def = flagged.get(RUN_FLOW_PROPOSAL_TOOL_NAME);
    expect(def).toBeDefined();
    expect(def!.tier).toBe('silent');
    expect(def!.source).toBe('builtin');
    expect(typeof def!.inputSchema).toBe('object');

    for (const name of RUN_FLOW_ESCAPE_HATCH_NAMES) {
      expect(flagged.get(name)!.description).toContain(RUN_FLOW_ESCAPE_HATCH_NOTE);
      // The note is purely informational — tier is untouched.
      expect(flagged.get(name)!.tier).toBe(baseline.get(name)!.tier);
    }

    // Every OTHER tool's description is untouched by the flag.
    for (const t of baseline.list()) {
      if (RUN_FLOW_ESCAPE_HATCH_NAMES.has(t.name)) continue;
      expect(flagged.get(t.name)!.description).toBe(t.description);
    }
  });

  it('deckent_propose_run handler requires intentSummary and delegates to the controller', async () => {
    const controller = fakeController();
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir(), runFlow: { enabled: true, controller } });
    const def = reg.get(RUN_FLOW_PROPOSAL_TOOL_NAME)!;

    const missing = await def.handler({});
    expect(missing.ok).toBe(false);
    expect(missing.output).toContain('intentSummary');
    expect(controller.proposeRun).not.toHaveBeenCalled();

    const ok = await def.handler({ intentSummary: 'Fix the flaky retry test' });
    expect(ok.ok).toBe(true);
    expect(controller.proposeRun).toHaveBeenCalledWith('Fix the flaky retry test');
    expect(JSON.parse(ok.output)).toMatchObject({ state: 'AWAITING_APPROVAL' });
  });

  it('deckent_propose_run handler surfaces a controller rejection as ok:false (never throws)', async () => {
    const controller = fakeController();
    (controller.proposeRun as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir(), runFlow: { enabled: true, controller } });
    const result = await reg.get(RUN_FLOW_PROPOSAL_TOOL_NAME)!.handler({ intentSummary: 'x' });
    expect(result.ok).toBe(false);
    expect(result.output).toContain('boom');
  });
});

// ─── run-flow-controller.ts — trajectory ────────────────────────────────────

describe('createRunFlowController — trajectory (propose -> preview -> approve/reject)', () => {
  let tick = 0;
  const nowFn = (): string => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();

  beforeEach(() => {
    vi.clearAllMocks();
    tick = 0;
    mockReadContext.mockReturnValue(makeBrainContext());
    mockPlanSprint.mockReturnValue(makeSprint() as any);
  });

  function makeControllerDeps() {
    return {
      root: '/mock/root',
      config: makeConfig(),
      now: nowFn,
      generateFlowId: () => 'flow-1',
    };
  }

  it('proposeRun drives COLLECTING -> AWAITING_APPROVAL with a REAL plan preview (real generatePlanPreview+compileRunProposal — only planSprint/readContext mocked)', async () => {
    const controller = createRunFlowController(makeControllerDeps());
    const context = await controller.proposeRun('Fix the flaky retry test');

    expect(context.state).toBe('AWAITING_APPROVAL');
    expect(context.flowId).toBe('flow-1');
    expect(context.proposal?.intentSummary).toBe('Fix the flaky retry test');
    expect(context.preview?.taskSummaries).toEqual([{ title: 'Do the thing', summary: 'Do the thing well.' }]);
    expect(context.preview?.planDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(context.preview?.gateResult).toBe('skipped');
    expect(context.preview?.policyDecision).toBe('allow');

    // run-proposal-compiler (424) actually ran end-to-end: readContext's directives
    // were overridden with the RunProposal-compiled markdown before reaching planSprint.
    expect(mockPlanSprint).toHaveBeenCalledTimes(1);
    const [, , brainContextArg] = mockPlanSprint.mock.calls[0]!;
    expect((brainContextArg as BrainContext).directives).toContain('Fix the flaky retry test');
    expect((brainContextArg as BrainContext).directives).toContain('flow-1');
  });

  it('approve() -> APPROVED with an approvedSnapshot CAS-matched to the live preview; never reaches STARTING/handle', async () => {
    const controller = createRunFlowController(makeControllerDeps());
    const previewed = await controller.proposeRun('Ship the thing');
    const approved = controller.approve({ id: 'alperen' });

    expect(approved.state).toBe('APPROVED');
    expect(approved.approvedSnapshot).toBeDefined();
    expect(approved.approvedSnapshot?.revision).toBe(previewed.preview!.revision);
    expect(approved.approvedSnapshot?.planDigest).toBe(previewed.preview!.planDigest);
    expect(approved.approvedSnapshot?.approvedBy).toEqual({ id: 'alperen' });
    expect(approved.handle).toBeUndefined();
    expect(controller.getContext().state).toBe('APPROVED');
  });

  it('startApproved persists the proposal into the durable snapshot — REAL controller write path (G1)', async () => {
    // Unlike the inbox read-side test (which seeds the snapshot directly), this
    // drives the ACTUAL controller — proposeRun -> approve -> startApproved — and
    // asserts on what landed ON DISK. It is the write side the read-side test
    // structurally cannot prove: if startApproved ever stopped persisting
    // context.proposal, this fails while the seeded test would still pass.
    const root = mkdtempSync(join(tmpdir(), 'runflow-g1-'));
    try {
      const intent = 'Fix the flaky retry test';
      const controller = createRunFlowController({
        ...makeControllerDeps(),
        root,
        // Inject a fake spawn so startApproved never launches a real child.
        spawnStart: (_sprint, fid) => ({ flowId: fid, jobId: `test-job-${fid}`, logRef: 'test-log' }),
      });
      await controller.proposeRun(intent);
      controller.approve({ id: 'alperen' });
      // startApproved is an optional interface member (427-005 seam); the concrete
      // controller always defines it, so assert-present matches this file's style.
      const started = controller.startApproved!();
      expect(started.state).toBe('DETACHED_RUNNING');

      // G1's whole point: a do-flow's ONLY durable trail is this snapshot (the
      // in-process controller never writes events.jsonl), so it must carry the
      // proposal for the inbox legacy-read to show intentSummary, not a bare UUID.
      const persisted = loadApprovedSnapshot(root, 'flow-1');
      expect(persisted).toBeDefined();
      expect(persisted?.proposal?.intentSummary).toBe(intent);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reject() -> CANCELLED', async () => {
    const controller = createRunFlowController(makeControllerDeps());
    await controller.proposeRun('Ship the thing');
    const rejected = controller.reject('not now');

    expect(rejected.state).toBe('CANCELLED');
    expect(rejected.cancelReason).toBe('rejected');
  });

  it('a second proposeRun on the same controller throws — no second plan-path', async () => {
    const controller = createRunFlowController(makeControllerDeps());
    await controller.proposeRun('First proposal');
    await expect(controller.proposeRun('Second proposal')).rejects.toThrow();
  });

  it('approve() before any proposal throws a descriptive error, not a raw TypeError', () => {
    const controller = createRunFlowController(makeControllerDeps());
    expect(() => controller.approve({ id: 'alperen' })).toThrow(/live preview/);
  });

  it('reject() before any proposal throws a descriptive error', () => {
    const controller = createRunFlowController(makeControllerDeps());
    expect(() => controller.reject()).toThrow(/active flow/);
  });
});

// ─── plan-preview-card.tsx — pure logic (no Ink render) ─────────────────────

describe('mapPlanPreviewKey', () => {
  it.each([
    ['y', 'approve'], ['Y', 'approve'],
    ['n', 'reject'], ['N', 'reject'],
    ['d', 'details'], ['D', 'details'],
  ] as const)('maps %s -> %s', (input, expected) => {
    expect(mapPlanPreviewKey(input)).toBe(expected);
  });

  it.each(['x', '', 'q', '1', 'a'])('unmapped key %j is a no-op (null)', (input) => {
    expect(mapPlanPreviewKey(input)).toBeNull();
  });
});

describe('formatTaskSummaryLine / formatDigestShort', () => {
  it('formats a 1-indexed task summary line', () => {
    expect(formatTaskSummaryLine(0, { title: 'Fix bug', summary: 'Root-cause and fix.' }))
      .toBe('1. Fix bug — Root-cause and fix.');
    expect(formatTaskSummaryLine(2, { title: 'Third', summary: 'Third task.' }))
      .toBe('3. Third — Third task.');
  });

  it('truncates a long digest, leaves a short one untouched', () => {
    const long = 'a'.repeat(64);
    expect(formatDigestShort(long)).toBe(`${'a'.repeat(12)}…`);
    expect(formatDigestShort('short')).toBe('short');
  });
});

describe('buildPlanPreviewCardLabels — i18n en/tr (sourced from messages.ts)', () => {
  it('every label is a non-empty, genuinely-translated string (en !== tr)', () => {
    const en = buildPlanPreviewCardLabels('en');
    const tr = buildPlanPreviewCardLabels('tr');

    expect(en.heading.length).toBeGreaterThan(0);
    expect(tr.heading.length).toBeGreaterThan(0);
    expect(en.heading).not.toBe(tr.heading);

    for (const result of ['pass', 'fail', 'skipped'] as const) {
      expect(en.gateLabels[result].length).toBeGreaterThan(0);
      expect(en.gateLabels[result]).not.toBe(tr.gateLabels[result]);
    }
    for (const decision of ['allow', 'deny', 'needs-approval'] as const) {
      expect(en.policyLabels[decision].length).toBeGreaterThan(0);
      expect(en.policyLabels[decision]).not.toBe(tr.policyLabels[decision]);
    }
    expect(en.hint).not.toBe(tr.hint);
    expect(en.detailsHeading).not.toBe(tr.detailsHeading);
    expect(en.noTasks).not.toBe(tr.noTasks);
  });

  it('falls back to en for an unknown lang (getMessage contract)', () => {
    const fallback = buildPlanPreviewCardLabels('fr');
    expect(fallback.heading).toBe(buildPlanPreviewCardLabels('en').heading);
  });
});
