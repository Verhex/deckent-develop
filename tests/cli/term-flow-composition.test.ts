// ═══ term-flow-composition — T6F composition-gate test (TERM-6, 428-009) ═══
//
// docs/analysis/term-flow-unify-design-2026-07-11.md's own composition-gate for
// Sprint 3-5 (425/426/427): ONE fixture drives the entire chain —
//   NL -> typed-proposal -> builder-validation -> actual-preview ->
//   digest-bound-approval -> exact-snapshot -> tek-detached-job(mock-spawn) ->
//   rich-result -> idle-new-turn
// through the REAL services/reducer every prior sprint slice already unit-tested
// in isolation (run-flow-controller.ts, run-flow-reducer.ts,
// run-proposal-compiler.ts, plan-preview-service.ts, run-flow-store.ts,
// run-job-service.ts, run-completion-watch.ts, run.tsx's result-watch wiring,
// chat-turn-queue.ts) — this file is the first to walk ALL of them together in
// one continuous trajectory instead of per-module isolation. Only the
// controller's own detached-spawn boundary (`spawnStart`) is faked — no real
// subprocess/`dist/cli/entry.js` invocation happens here. A real-binary
// host-side dogfood run (511) is this test's non-hermetic twin (see task note).
//
// Hermeticity mirrors tests/cli/run-flow-mount.test.ts /
// tests/cli/run-flow-controller-complete.test.ts / tests/cli/run-flow-result-turn.test.ts
// exactly: only orchestra/brain.js's planSprint/readContext are mocked (they would
// otherwise require a real AI/provider bootstrap); everything else — reducer,
// compiler, preview service, durable store, job service, completion watch,
// result-watch wiring, turn queue — is the REAL production module running
// against a per-test tmpdir root.
//
// Risk-pin (design doc: "flowId + planDigest atomic idempotency olmadan cutover
// yapılmamalı"): a duplicate completion EVENT — the exact race
// run-completion-watch.ts's own header calls out (fs.watch AND an
// always-on poll timer both firing for the same underlying change) — must
// never produce a second detached job or a second result-turn. Proven here at
// TWO independent layers: (a) the watch's own per-jobId dedup set, and (b) the
// controller/reducer's state-based idempotent-replay guard, working together.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 429-001 (born-678): compiler artık scaffold üretmez — AI/provider SINIRI olan
// callZeroConfigPlanner mock'lanır (do-real-plan.test.ts emsali); canned tek-task
// GERÇEK-şekilli plan döner, böylece propose-yolu hermetik kalır.
vi.mock('../../src/orchestra/planner.js', () => ({
  resolvePlanTimeoutMs: vi.fn(() => 900_000), // F-2: sprint-planner/do.ts resolve the plan timeout through this
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
  createRunFlowController,
  type RunFlowControllerDeps,
} from '../../src/cli/repl/run-flow-controller.js';
import { compileRunProposal } from '../../src/orchestra/run-proposal-compiler.js';
import { buildSprintCompletionRecord } from '../../src/orchestra/sprint-finalizer.js';
import { loadApprovedSnapshot, loadRunHandle } from '../../src/core/run-flow-store.js';
import type { RunHandle } from '../../src/orchestra/run-job-service.js';
import {
  createRunCompletionWatch,
  parseRunCompletionRecord,
  type RunCompletionWatchFsWatcher,
} from '../../src/cli/repl/run-completion-watch.js';
import {
  wireRunFlowResultWatch,
  buildRunFlowResultLabels,
  buildRunFlowResultEvent,
} from '../../src/cli/repl/run.js';
import { createChatTurnQueue } from '../../src/cli/repl/chat-turn-queue.js';
import type { ChatTurnBgEvent, ChatTurnPayload } from '../../src/cli/repl/chat-turn-queue.js';
import { getMessage } from '../../src/cli/helpers/messages.js';
import { JOBS_DIR } from '../../src/core/constants.js';
import { parseStructuredDirectives } from '../../src/orchestra/task-builder.js';
import type { RunProposal } from '../../src/core/run-flow-contract.js';
import { SprintStatus, SprintPhase, TaskStatus, TaskEvaluation } from '../../src/core/types.js';
import type { Sprint, Task, ResolvedConfig, BrainContext } from '../../src/core/types.js';

const mockPlanSprint = vi.mocked(planSprint);
const mockReadContext = vi.mocked(readContext);

// ─── Fixtures (mirrors tests/cli/run-flow-mount.test.ts's own style) ───────

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
    terminal: { run_flow_v2: true } as any,
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
    id: '001-001', title: 'Export module A', description: 'Build the CSV exporter.',
    model: 'sonnet', effort: 'normal', priority: 'NORMAL', reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING, sprintId: 'sprint-tf-1', createdAt: new Date(0).toISOString(),
    ...overrides,
  } as Task;
}

function makeSprint(): Sprint {
  return {
    id: 'sprint-tf-1', number: 1,
    status: SprintStatus.PLANNING, phase: SprintPhase.PLAN,
    tasks: [
      makeTask(),
      makeTask({ id: '001-002', title: 'Export module B', description: 'Build the JSON exporter.' }),
    ],
    workers: ['w-001-001', 'w-001-002'],
  };
}

/** Manual watch stub (mirrors tests/cli/run-flow-result-turn.test.ts's own
 *  makeManualWatch) — the test controls exactly when a re-scan fires, which is
 *  what lets it simulate the fs.watch+poll duplicate-fire race deterministically. */
function makeManualWatch(): { watch: RunCompletionWatchFsWatcher; fire: () => void } {
  let onChange: (() => void) | undefined;
  const watch: RunCompletionWatchFsWatcher = (_dir, cb) => {
    onChange = cb;
    return { close: () => {} };
  };
  return { watch, fire: () => onChange?.() };
}

// ─── Suite ──────────────────────────────────────────────────────────────────

describe('term-flow composition-gate — full chain in ONE fixture (TERM-6, 428-009)', () => {
  let root: string;
  let tick: number;
  const nowFn = (): string => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();

  beforeEach(() => {
    vi.clearAllMocks();
    tick = 0;
    mockReadContext.mockReturnValue(makeBrainContext());
    mockPlanSprint.mockReturnValue(makeSprint() as any);
    root = mkdtempSync(join(tmpdir(), 'term-flow-composition-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it(
    'NL -> typed-proposal -> builder-validation -> actual-preview -> digest-bound-approval -> ' +
    'exact-snapshot -> tek-detached-job(mock-spawn) -> rich-result -> idle-new-turn, ' +
    'duplicate-event never produces a double-start',
    async () => {
      const spawnStart = vi.fn((_sprint: Sprint, flowId: string): RunHandle => ({
        flowId, jobId: `job-${flowId}`, logRef: '/fake/log.log',
      }));
      const deps: RunFlowControllerDeps = {
        root, config: makeConfig(), now: nowFn, generateFlowId: () => 'flow-tf-1', spawnStart,
      };
      const controller = createRunFlowController(deps);

      // ── 1. NL -> typed-proposal ────────────────────────────────────────
      const nlGoal = 'Ship the natural language triggered exporter feature end to end';
      const proposed = await controller.proposeRun(nlGoal);

      expect(proposed.state).toBe('AWAITING_APPROVAL');
      expect(proposed.proposal).toBeDefined();
      expect(proposed.proposal!.intentSummary).toBe(nlGoal);
      expect(proposed.proposal!.flowId).toBe('flow-tf-1');
      expect(proposed.proposal!.revision).toBe(1);

      // ── 2. builder-validation ──────────────────────────────────────────
      // Re-runs the SAME real compiler the controller used internally, directly
      // on the controller's own typed proposal — proving the RunProposal ->
      // DirectiveBuildIntent -> DIRECTIVES-markdown adapter validated the field
      // as safe (a reserved-label/heading collision would have THROWN, not
      // silently emitted corrupt markdown — see the dedicated negative test below).
      const compiled = await compileRunProposal(proposed.proposal!);
      expect(compiled.directivesMarkdown).toContain(nlGoal);
      expect(compiled.directivesMarkdown).toContain('flow-tf-1');
      expect(compiled.intent.tasks).toHaveLength(1);
      // 429-001 (born-678): title artık NL-hedefin verbatim kopyası değil,
      // PLANNER-ayrıştırmasının task-başlığı (buradaki canned-mock: 'Planned task').
      expect(compiled.intent.tasks[0]!.title).toBe('Planned task');

      // ── 3. actual-preview (real generatePlanPreview, not a stub) ────────
      expect(proposed.preview).toBeDefined();
      const preview = proposed.preview!;
      expect(preview.planDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(preview.taskSummaries).toEqual([
        { title: 'Export module A', summary: 'Build the CSV exporter.' },
        { title: 'Export module B', summary: 'Build the JSON exporter.' },
      ]);
      expect(preview.gateResult).toBe('skipped');
      expect(preview.policyDecision).toBe('allow');
      expect(mockPlanSprint).toHaveBeenCalledTimes(1);

      // ── 4. digest-bound-approval ─────────────────────────────────────
      // approve() self-derives revision/planDigest from the LIVE preview — there
      // is no caller-suppliable digest parameter to smuggle a stale approval in.
      const approved = controller.approve({ id: 'alperen', role: 'operator' });
      expect(approved.state).toBe('APPROVED');
      expect(approved.approvedSnapshot!.planDigest).toBe(preview.planDigest);
      expect(approved.approvedSnapshot!.revision).toBe(preview.revision);
      expect(approved.approvedSnapshot!.approvedBy).toEqual({ id: 'alperen', role: 'operator' });
      expect(approved.handle).toBeUndefined();

      // ── 5. exact-snapshot -> tek-detached-job(mock-spawn) ────────────
      const started = controller.startApproved!();
      expect(started.state).toBe('DETACHED_RUNNING');
      expect(spawnStart).toHaveBeenCalledTimes(1);
      expect(spawnStart).toHaveBeenCalledWith(expect.objectContaining({ id: 'sprint-tf-1' }), 'flow-tf-1');
      // startApproved() never re-plans — the exact previewed Sprint is consumed.
      expect(mockPlanSprint).toHaveBeenCalledTimes(1);

      const storedSnapshot = loadApprovedSnapshot(root, 'flow-tf-1');
      expect(storedSnapshot?.planDigest).toBe(preview.planDigest);
      expect(storedSnapshot?.revision).toBe(preview.revision);
      expect(storedSnapshot?.sprint.id).toBe('sprint-tf-1');

      // born-681 tek-yazar: parent disk-handle yazmaz (child persist-before-run);
      // iş-kimliği in-memory context.handle'da.
      expect(loadRunHandle(root, 'flow-tf-1')).toBeUndefined();
      expect(started.handle?.jobId).toBe('job-flow-tf-1');

      // Double-start pin, layer 1: a second startApproved() call (e.g. a
      // duplicated caller invocation) is a CAS-verified no-op — spawnStart is
      // NEVER invoked a second time (run-job-service.ts's own contract).
      const startedAgain = controller.startApproved!();
      expect(startedAgain.state).toBe('DETACHED_RUNNING');
      expect(startedAgain.handle!.jobId).toBe('job-flow-tf-1');
      expect(spawnStart).toHaveBeenCalledTimes(1);

      // ── 6. rich-result + idle-new-turn ───────────────────────────────
      const jobsDir = join(root, JOBS_DIR);
      mkdirSync(jobsDir, { recursive: true });

      const manual = makeManualWatch();
      const chatQueue = createChatTurnQueue();
      expect(chatQueue.userTurnActive).toBe(false); // idle REPL

      const drainedTurns: ChatTurnPayload[][] = [];
      const onResult = (event: ChatTurnBgEvent) => {
        drainedTurns.push(chatQueue.enqueueCorrelatedResult(event, true));
      };
      const labels = buildRunFlowResultLabels((k) => getMessage(k, 'en'));
      // Constructed against an EMPTY jobsDir — its baseline scan seeds nothing,
      // so the completion file written below is observed as a genuinely NEW
      // terminal record (mirrors run-completion-watch.ts's own "pre-existing
      // history never resurfaces" baseline contract).
      const watchHandle = wireRunFlowResultWatch(
        true, jobsDir, controller, labels, onResult,
        (dir, handlers) => createRunCompletionWatch(dir, handlers, { watch: manual.watch, pollIntervalMs: 999_000 }),
      );

      // 432-005 (SURF-0.5): the completion record is now produced by the REAL
      // finalizer function `buildSprintCompletionRecord(sprint, evals, results,
      // flowId)` — its own `if (flowId) record.flowId = flowId` conditional is
      // what threads the flowId onto the on-disk artifact, NOT a hand-injected
      // literal. So the flowId the watch surfaces below is one production
      // finalizer code emitted, exercising the exact `completionRecord.flowId`
      // path a real sprint's finalizeSprint writes to jobs/<sprintId>.json.
      const finalizeEvaluations = new Map<string, TaskEvaluation>([
        ['001-001', TaskEvaluation.DONE],
        ['001-002', TaskEvaluation.GO_WITH_TECH_DEBT],
      ]);
      const completionRecord = buildSprintCompletionRecord(
        makeSprint(), finalizeEvaluations, new Map(), 'flow-tf-1',
      );
      // The REAL function carried the flowId — not the test literal.
      expect(completionRecord.flowId).toBe('flow-tf-1');

      writeFileSync(
        join(jobsDir, 'job-flow-tf-1.json'),
        JSON.stringify({
          status: 'COMPLETE',
          sprintId: 'sprint-tf-1',
          metrics: { totalTasks: 2, done: 1, techDebt: 1, noGo: 0 },
          completionRecord,
        }),
        'utf-8',
      );

      manual.fire(); // first observation — the genuine completion
      // Double-start pin, layer 2 (duplicate-event): fs.watch AND the
      // always-on poll timer can both observe the SAME underlying change —
      // run-completion-watch.ts's own header names this exact race. A second
      // re-scan for an already-fired jobId must be a silent no-op.
      manual.fire();

      expect(drainedTurns).toHaveLength(1); // NOT 2 — duplicate-event did not double-fire
      expect(controller.getContext().state).toBe('COMPLETED');
      expect(spawnStart).toHaveBeenCalledTimes(1); // still exactly one detached job, ever

      const [firstDrain] = drainedTurns;
      expect(firstDrain).toEqual<ChatTurnPayload[]>([
        {
          source: 'flow-tf-1',
          events: [{
            source: 'flow-tf-1',
            // SURF-3 result-evidence — the aggregate header now carries per-task
            // evidence lines from completionRecord.taskSummary (bare here: the
            // fixture tasks report no files/tests, so it's icon + id + title).
            summary: 'Run flow-tf-1 completed — 1/2 DONE · 1 TECH_DEBT · 0 NO_GO\n  ✅ 001-001 Export module A\n  ⚠ 001-002 Export module B',
          }],
        },
      ]);
      // idle-new-turn: the REPL was idle, so the turn was produced and drained
      // immediately — nothing is left sitting in the queue.
      expect(chatQueue.size()).toBe(0);

      // Double-start pin, layer 3 (defense in depth): even a completely
      // independent redelivery of the SAME completion info straight through
      // the controller (bypassing the watch's own dedup set entirely, e.g. a
      // second watcher attached after a process restart) is a silent,
      // state-based no-op — proven directly against reduceRunFlow's terminal
      // guard, not just the watch layer's bookkeeping.
      const replayed = controller.applyRunCompletion!({
        jobId: 'job-flow-tf-1', sprintId: 'sprint-tf-1', status: 'COMPLETE', flowId: 'flow-tf-1',
      });
      expect(replayed.state).toBe('COMPLETED');
      expect(spawnStart).toHaveBeenCalledTimes(1);

      watchHandle!.dispose();
    },
  );
});

// ─── legacy (flowId-less) completion record — dual-read preserved ──────────
//
// goCriteria #2 (432-005): a completion record produced BEFORE the flowId
// field existed (or by any sprint started off the run-flow-v2 path) carries no
// flowId. The finalizer's own `if (flowId) record.flowId = flowId` guard omits
// the key entirely, and the watch parser must read that legacy shape without a
// throw, surfacing `flowId: undefined` — and the result-turn must fall back to
// the sprintId, never inventing a correlation id. Proven end-to-end here with
// the REAL finalizer + REAL parser + REAL result-turn builder (no mock, no
// hand-injected id): the flowless path is the exact inverse of the main test.

describe('term-flow composition-gate — legacy (flowId-less) record dual-read (432-005)', () => {
  it('a finalizer completion record built WITHOUT a flowId reads back undefined — no throw, absent semantics + sprintId fallback preserved', () => {
    const evaluations = new Map<string, TaskEvaluation>([
      ['001-001', TaskEvaluation.DONE],
      ['001-002', TaskEvaluation.GO_WITH_TECH_DEBT],
    ]);
    // REAL finalizer function, NO flowId arg — the `if (flowId)` guard must
    // leave the key entirely absent (not `flowId: undefined` serialized).
    const legacyRecord = buildSprintCompletionRecord(makeSprint(), evaluations, new Map());
    expect('flowId' in legacyRecord).toBe(false);
    expect(legacyRecord.flowId).toBeUndefined();

    const rawJob = JSON.stringify({
      status: 'COMPLETE',
      sprintId: 'sprint-tf-1',
      metrics: { totalTasks: 2, done: 1, techDebt: 1, noGo: 0 },
      completionRecord: legacyRecord,
    });

    // REAL watch parser — a legacy job reads cleanly, flowId stays undefined.
    const info = parseRunCompletionRecord(rawJob, 'job-legacy');
    expect(info).not.toBeNull();
    expect(info!.status).toBe('COMPLETE');
    expect(info!.sprintId).toBe('sprint-tf-1');
    expect(info!.flowId).toBeUndefined();

    // REAL result-turn builder — with no flowId the correlation source falls
    // back to sprintId (never a fabricated id); the summary still renders.
    const labels = buildRunFlowResultLabels((k) => getMessage(k, 'en'));
    const event = buildRunFlowResultEvent(info!, labels);
    expect(event.source).toBe('sprint-tf-1');
    expect(event.summary).toContain('1/2');
  });
});

// ─── builder-validation is a genuine gate, not a pass-through ──────────────

describe('term-flow composition-gate — builder-validation neutralizes unsafe input', () => {
  // 429-001+429-003 sonrası sözleşme: label-görünümlü user-metni artık hard-error
  // DEĞİL — planner-ayrıştırması + delimiter/label-güvenli katlama nötrler; kanıt:
  // markdown round-trip'te TEK task kalır ve sahte 'Model:' satırı direktif OLMAZ.
  it('compileRunProposal folds a reserved-label-looking intentSummary safely (no parser fracture, no label hijack)', async () => {
    const unsafeProposal: RunProposal = {
      flowId: 'flow-unsafe', tenant: 'local', project: 'test',
      actor: { id: 'native-agent' }, origin: 'chat', revision: 1,
      intentSummary: 'Model: gpt-4-turbo (a stray reserved-label line)',
    };

    const { directivesMarkdown } = await compileRunProposal(unsafeProposal);
    const parsed = parseStructuredDirectives(directivesMarkdown);
    expect(parsed).toHaveLength(1);
    // Planner-mock 'sonnet' der; user-metnindeki sahte label bunu EZEMEZ.
    expect(parsed[0]!.forceModel).not.toBe('gpt-4-turbo');
  });
});
