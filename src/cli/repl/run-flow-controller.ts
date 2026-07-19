// ═══ run-flow-controller — TERM-FLOW-UNIFY Sprint-3 dilim (425-001) ════════
//
// docs/analysis/term-flow-unify-design-2026-07-11.md ("Net Öneri"): the first
// real caller of the Sprint-1 contract/reducer (core/run-flow-contract.ts,
// orchestra/run-flow-reducer.ts) and the Sprint-2 shared-preview layer
// (orchestra/run-proposal-compiler.ts, orchestra/plan-preview-service.ts).
// Host-owned coordinator behind `terminal.run_flow_v2` (default OFF) — drives
// a `deckent_propose_run` native-tool call from PROPOSAL_SUBMITTED through
// PREVIEW_READY (a REAL Brain plan preview, not a stub) up to APPROVED via
// approve()/reject(). Never constructs START_REQUESTED — no method here can
// reach STARTING/DETACHED_RUNNING; that is dilim-4's job (design doc Sprint-4,
// "Exact-snapshot start", run-job-service.ts/run-flow-store.ts).
//
// ADR-D-004 (Layer-1 import direction): this file lives under cli/repl/ (a
// "surface") and imports orchestra/ entrypoints only (run-flow-reducer,
// run-proposal-compiler, plan-preview-service, brain.js's readContext) — C2/C3
// explicitly allow a surface to call approved orchestra/ entrypoints; nothing
// here re-implements orchestration logic (C3: surfaces host no reusable
// business logic — every actual decision is delegated to the reducer/services
// above, "yeniden-icat yok").
//
// Single-flow-per-instance by design: `proposeRun` may run exactly once per
// controller (COLLECTING -> PROPOSAL_READY is a one-way door in the reducer
// itself); a second call surfaces the reducer's own RunFlowTransitionError
// rather than a redundant guard duplicated here — this is also the "ikinci
// plan-yolu doğarsa NO_GO" invariant: there is structurally only one path
// from a fresh controller to a plan preview.
//
// Factory-closure shape (not a class) — matches this directory's existing
// stateful-module convention (createApprovalCardQueue in approval-card.tsx,
// createCliToolDispatcher in chat-tool-bridge.ts, createDefaultSkillDispatcher
// above in native-tool-registry.ts).

import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import {
  RUN_FLOW_EVENT_SCHEMA_VERSION,
  type PlanPreview,
  type RunFlowContext,
  type RunProposal,
  createInitialRunFlowContext,
  isTerminalRunFlowState,
} from '../../core/run-flow-contract.js';
import type { ActorContext, RequestOrigin } from '../../core/work-model.js';
import type { BrainPlanningMode, ResolvedConfig, Sprint, SprintSizeRecommendation } from '../../core/types.js';
import { reduceRunFlow } from '../../orchestra/run-flow-reducer.js';
// Dogfood-449 B1 — front-door mirror of the child's PLAN-phase scope gate
// (born-698a's scope twin; see proposeRun below). ASYNC spawn on purpose:
// the spawnSync ratchet (lint-no-spawnsync) exists because sync probes froze
// the Brain event loop (R8/ADR-087) — same discipline as run-proposal-compiler's
// readTrackedFileTree, which this helper mirrors with a cwd parameter.
import { spawn } from 'node:child_process';
import { evaluateScopeGate } from '../../core/scope-gate.js';
import type { RunFlowGateResult } from '../../core/run-flow-contract.js';
import { debugLog } from '../../core/utils.js';
import { compileRunProposal } from '../../orchestra/run-proposal-compiler.js';
import { generatePlanPreview } from '../../orchestra/plan-preview-service.js';
import { readContext } from '../../orchestra/brain.js';
// TERM-FLOW-UNIFY Sprint-4 mount (426-002) — Task-1's durable store + start
// service (426-001). USE ONLY: this file never writes to run-flow-store.ts or
// run-job-service.ts, it imports their exported API (task write-scope boundary).
import { saveApprovedSnapshot, loadRunHandle, type StoredApprovedSnapshot } from '../../core/run-flow-store.js';
import { startApprovedRun, type RunHandle } from '../../orchestra/run-job-service.js';
import { spawnDetachedDeckent } from '../helpers/detached-start.js';
// TERM5-CTRL (sprint-427, task 5) — the SAME completion-notification shape
// run.tsx already receives from `createRunCompletionWatch`'s `onComplete`
// callback (wireBgTurnsProducer, run.tsx) — see applyRunCompletion below.
import type { RunCompletionInfo } from './run-completion-watch.js';

export interface RunFlowControllerDeps {
  /** Project root — threaded straight into readContext()/generatePlanPreview(). */
  root: string;
  config: ResolvedConfig;
  tenant?: string;
  project?: string;
  actor?: ActorContext;
  origin?: RequestOrigin;
  /** Seam for tests — production default is crypto.randomUUID(). */
  generateFlowId?: () => string;
  /** Seam for tests — production default is `() => new Date().toISOString()`. */
  now?: () => string;
  /** Sprint-size recommendation override — production default mirrors
   *  cli/commands/plan.ts's own inline object (full-size, config-derived maxWorkers). */
  recommendation?: SprintSizeRecommendation;
  /** Defaults to 'structured' — deterministic, no AI/provider bootstrap, the
   *  same forced mode CLI `plan --dry-run` already uses (see plan.ts). */
  mode?: BrainPlanningMode;
  /**
   * TERM-FLOW-UNIFY Sprint-4 mount (426-002) — seam for startApproved()'s
   * actual detached spawn. Production default builds the SAME
   * `deckent start --flow-id <id> --revision <n> --plan-digest <digest>` CLI
   * args as mcp/tools/start.ts's own spawnStart closure (see startApproved's
   * doc comment below) via spawnDetachedDeckent — no reinvention. Tests
   * inject a fake so no real sprint is ever spawned.
   */
  spawnStart?: (sprint: Sprint, flowId: string) => RunHandle;
  /**
   * Dogfood-449 B1 — operator's `--force-scope` consent. Two effects, both
   * mirroring `deckent start`: (a) proposeRun's front-door scope-gate mirror
   * acknowledges write-suspects instead of failing the preview, (b) the
   * default spawnStart forwards `--force-scope` to the detached child so the
   * child's own PLAN-phase gate makes the SAME decision. Default: false.
   */
  forceScope?: boolean;
}

export interface RunFlowController {
  getContext(): RunFlowContext;
  /** Runs exactly once per controller instance — see file header. */
  proposeRun(intentSummary: string): Promise<RunFlowContext>;
  /** Approves whatever preview is CURRENTLY live — revision/planDigest are
   *  self-derived from `getContext().preview`, never caller-suppliable (no
   *  stale-digest approval is possible by construction). */
  approve(approvedBy: ActorContext): RunFlowContext;
  reject(reason?: string): RunFlowContext;
  /**
   * TERM-FLOW-UNIFY Sprint-4 mount (426-002) — drives an APPROVED context
   * through Task-1's run-flow-store/run-job-service APIs to STARTING then
   * DETACHED_RUNNING. This is where dilim-3's "approvedSnapshot lives only
   * in-process, stops at APPROVED" limit (see approve()'s doc comment) is
   * actually lifted — deliberately NOT inside approve() itself, which stays
   * pinned to APPROVED/no-handle by tests/cli/run-flow-controller.test.ts
   * (out of this task's write scope). Idempotent when called again while
   * already STARTING/DETACHED_RUNNING (the reducer's own duplicate-replay
   * handling — see run-flow-reducer.ts). Optional so the pre-426-002
   * RunFlowController shape (e.g. that test file's fakeController()) still
   * structurally satisfies this interface without modification.
   */
  startApproved?(): RunFlowContext;
  /**
   * TERM5-CTRL (sprint-427, task 5) — the controller's completion channel:
   * consumes a flowId-correlated completion notification
   * (run-completion-watch.ts's `RunCompletionInfo`, e.g. delivered by
   * `createRunCompletionWatch`'s `onComplete` callback filtered to this
   * controller's own flowId — the same channel run.tsx's
   * `wireBgTurnsProducer` already consumes) and drives
   * DETACHED_RUNNING -> COMPLETED / (STARTING|DETACHED_RUNNING) -> FAILED
   * through the SAME `reduceRunFlow` every other method in this file goes
   * through — no hand-rolled state mutation here.
   *
   * Two invariants, both defense-in-depth against a mis-wired or duplicate
   * caller (the production caller is already flowId-filtered at the watch
   * layer, but this method never assumes that holds):
   *   - a wrong-flow event (`event.flowId` unset, or not equal to the live
   *     `getContext().flowId`) is a loud-logged no-op — context is returned
   *     unchanged.
   *   - once the flow has already reached a terminal state
   *     (COMPLETED/FAILED/CANCELLED/BLOCKED — e.g. this exact event
   *     redelivered by an at-least-once watcher) this is a SILENT no-op —
   *     an expected replay, not an anomaly.
   * A context that is non-terminal but not yet STARTING/DETACHED_RUNNING is
   * a genuine ordering bug, not a race this method smooths over — it is left
   * to surface `reduceRunFlow`'s own typed `RunFlowTransitionError`.
   *
   * Optional for the same reason `startApproved` is: the pre-427-005
   * `RunFlowController` shape (e.g. tests/cli/run-flow-controller.test.ts's
   * `fakeController()`) still structurally satisfies this interface without
   * modification.
   */
  applyRunCompletion?(event: RunCompletionInfo): RunFlowContext;
}

function defaultRecommendation(config: ResolvedConfig): SprintSizeRecommendation {
  return {
    size: 'full',
    maxWorkers: typeof config.activeModeConfig.max_workers === 'number' ? config.activeModeConfig.max_workers : 4,
    modelConstraint: null,
    reason: 'No usage constraints',
  };
}

/**
 * Dogfood-449 B1 — async `git ls-files` for the front-door scope-gate mirror.
 * Mirrors run-proposal-compiler's readTrackedFileTree (SURF-5 discipline: even
 * a fast git call must not block the event loop — the spawnSync ratchet is the
 * enforcement of that lesson), parameterized by cwd. Fail-soft: no git / not a
 * repo / timeout → [] and the caller keeps the gate mirror 'skipped'.
 */
function listTrackedFiles(root: string, timeoutMs = 10_000): Promise<string[]> {
  return new Promise((resolve) => {
    let stdout = '';
    let done = false;
    const finish = (lines: string[]): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(lines);
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn('git', ['ls-files'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      resolve([]);
      return;
    }
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch { /* already gone */ }
      finish([]);
    }, timeoutMs);
    child.stdout?.setEncoding('utf-8');
    child.stdout?.on('data', (chunk: string) => { stdout += chunk; });
    child.on('error', () => finish([]));
    child.on('close', (code) => {
      if (code !== 0 || stdout.length === 0) {
        finish([]);
        return;
      }
      finish(stdout.trim().split('\n').filter((line) => line.length > 0));
    });
  });
}

export function createRunFlowController(deps: RunFlowControllerDeps): RunFlowController {
  let context: RunFlowContext = createInitialRunFlowContext();
  const nowFn = deps.now ?? (() => new Date().toISOString());
  const generateFlowId = deps.generateFlowId ?? (() => randomUUID());
  // TERM-FLOW-UNIFY Sprint-4 mount (426-002) — the real planned Sprint (task
  // list) from generatePlanPreview's result, retained here so startApproved()
  // can persist a Task-1 StoredApprovedSnapshot (richer than the core
  // ApprovedPlanSnapshot — see run-flow-store.ts's file header). PlanPreview
  // itself carries no task list, only summaries.
  let plannedSprint: Sprint | undefined;

  async function proposeRun(intentSummary: string): Promise<RunFlowContext> {
    const trimmed = intentSummary.trim();
    if (trimmed.length === 0) {
      throw new Error('run-flow-controller: intentSummary must be a non-empty string');
    }

    const flowId = generateFlowId();
    const revision = 1;
    const proposal: RunProposal = {
      flowId,
      tenant: deps.tenant ?? 'local',
      project: deps.project ?? basename(deps.root),
      actor: deps.actor ?? { id: 'native-agent' },
      origin: deps.origin ?? 'chat',
      revision,
      intentSummary: trimmed,
    };

    context = reduceRunFlow(context, {
      schemaVersion: RUN_FLOW_EVENT_SCHEMA_VERSION,
      flowId,
      timestamp: nowFn(),
      type: 'PROPOSAL_SUBMITTED',
      proposal,
    });
    context = reduceRunFlow(context, {
      schemaVersion: RUN_FLOW_EVENT_SCHEMA_VERSION,
      flowId,
      timestamp: nowFn(),
      type: 'PREVIEW_STARTED',
      revision,
    });

    // born-690: forward the live config so the planner seam resolves the real
    // brain model (resolveBrainModel) instead of the balanced-mode fallback —
    // omitting it spawned the DEFAULT provider with a foreign model name.
    const compiled = await compileRunProposal(proposal, undefined, deps.config);
    const brainContext = { ...readContext(deps.root), directives: compiled.directivesMarkdown };
    const recommendation = deps.recommendation ?? defaultRecommendation(deps.config);
    const result = await generatePlanPreview(deps.root, deps.config, brainContext, recommendation, {
      mode: deps.mode ?? 'structured',
    });
    plannedSprint = result.sprint;

    // Dogfood-449 B1 — born-698a'nın scope-ikizi: detached-child'ın PLAN fazı
    // pre-spawn scope-gate'inde FAIL-CLOSED; ön-kapı aynı kararı BURADA verir,
    // yoksa onay "başlatıldı" basar ve koşu PLAN'da sessizce ölür (dogfood-449:
    // 3 ölü-koşu, ölüm yalnız .deckent/recently-works/ logunda). Girdiler
    // sprint-controller'ın gate-çağrısıyla birebir (git ls-files +
    // resolveSuggestions:true); git koşamazsa 'skipped' — child gibi fail-OPEN.
    let scopeGateResult: RunFlowGateResult = 'skipped';
    let scopeGateMessage: string | undefined;
    let scopeGateOverridden = false;
    try {
      const trackedFiles = await listTrackedFiles(deps.root);
      if (trackedFiles.length > 0) {
        const scopeGate = evaluateScopeGate({
          tasks: result.sprint.tasks.map(t => ({ id: t.id, scope: t.scope ?? {} })),
          trackedFiles,
          acknowledgeScopePaths: deps.forceScope === true,
          resolveSuggestions: true,
        });
        if (scopeGate.ok) {
          scopeGateResult = 'pass';
          scopeGateOverridden = scopeGate.overrideApplied === true;
        } else {
          scopeGateResult = 'fail';
          scopeGateMessage = scopeGate.message;
        }
      }
    } catch (err) {
      debugLog('runFlowController:scopeGateMirror', err); // fail-open — child decides
    }

    const preview: PlanPreview = {
      flowId,
      revision,
      planDigest: result.planDigest,
      taskSummaries: result.taskSummaries,
      policyDecision: result.policyDecision,
      gateResult: result.gateResult,
      // born-684: gate-fail nedeni onay-yüzeyine taşınır (digest-dışı additive).
      ...(result.gateFindings.length > 0 ? { gateFindings: result.gateFindings } : {}),
      // Dogfood-449 B1: scope-gate aynası da digest-dışı additive alanlardır.
      scopeGateResult,
      ...(scopeGateMessage !== undefined ? { scopeGateMessage } : {}),
      ...(scopeGateOverridden ? { scopeGateOverridden: true } : {}),
    };

    context = reduceRunFlow(context, {
      schemaVersion: RUN_FLOW_EVENT_SCHEMA_VERSION,
      flowId,
      timestamp: nowFn(),
      type: 'PREVIEW_READY',
      preview,
    });

    return context;
  }

  function approve(approvedBy: ActorContext): RunFlowContext {
    const { preview, flowId } = context;
    if (!preview || !flowId) {
      throw new Error('run-flow-controller: approve() requires a live preview (call proposeRun first; state must be AWAITING_APPROVAL)');
    }
    context = reduceRunFlow(context, {
      schemaVersion: RUN_FLOW_EVENT_SCHEMA_VERSION,
      flowId,
      timestamp: nowFn(),
      type: 'APPROVAL_GRANTED',
      revision: preview.revision,
      planDigest: preview.planDigest,
      approvedBy,
    });
    // TODO(dilim-4 — design doc Sprint-4 "Exact-snapshot start",
    // run-job-service.ts/run-flow-store.ts): the resulting approvedSnapshot
    // lives only in this in-process controller instance. A real START_REQUESTED
    // caller must persist it to a durable run-flow-store before consuming it —
    // this controller intentionally stops here (see file header).
    return context;
  }

  /** See {@link RunFlowController.startApproved} for the full rationale. */
  function startApproved(): RunFlowContext {
    const { flowId, approvedSnapshot, state } = context;
    if (state !== 'APPROVED' && state !== 'STARTING' && state !== 'DETACHED_RUNNING') {
      throw new Error(
        `run-flow-controller: startApproved() requires state 'APPROVED' (call approve() first; current state: '${state}')`,
      );
    }
    // born-681: in-process idempotency artık CONTEXT'ten gelir (disk-handle'dan
    // değil — parent handle YAZMAZ, tek-yazar child). Aynı controller'da ikinci
    // çağrı: iş zaten başladıysa (handle reduce edilmiş) sessiz no-op replay.
    if ((state === 'STARTING' || state === 'DETACHED_RUNNING') && context.handle) {
      return context;
    }
    if (!flowId || !approvedSnapshot) {
      throw new Error('run-flow-controller: startApproved() requires an approved snapshot (call approve() first)');
    }
    if (!plannedSprint) {
      throw new Error('run-flow-controller: startApproved() has no planned Sprint to persist (unexpected — proposeRun must have run)');
    }

    const stored: StoredApprovedSnapshot = {
      flowId,
      revision: approvedSnapshot.revision,
      planDigest: approvedSnapshot.planDigest,
      approvedBy: approvedSnapshot.approvedBy,
      approvedAt: approvedSnapshot.approvedAt,
      sprint: plannedSprint,
      // G1 durable-fix (SURF-3): persist the proposal so the inbox's legacy-read
      // path can show intentSummary instead of a bare flowId (the controller
      // never writes events.jsonl, so this snapshot is the only durable trail).
      ...(context.proposal ? { proposal: context.proposal } : {}),
    };
    saveApprovedSnapshot(deps.root, stored);

    context = reduceRunFlow(context, {
      schemaVersion: RUN_FLOW_EVENT_SCHEMA_VERSION,
      flowId,
      timestamp: nowFn(),
      type: 'START_REQUESTED',
      revision: stored.revision,
      planDigest: stored.planDigest,
    });

    const existingRunHandle = loadRunHandle(deps.root, flowId);
    const spawnStart = deps.spawnStart ?? ((_sprint: Sprint, fid: string): RunHandle => {
      const cliArgs = [
        'start', '--flow-id', fid,
        '--revision', String(stored.revision),
        '--plan-digest', stored.planDigest,
      ];
      // Dogfood-449 B1: the operator's --force-scope consent must reach the
      // child that actually runs PLAN's scope gate — consent at the front
      // door, enforcement in the child (`start` already understands the flag).
      if (deps.forceScope === true) cliArgs.push('--force-scope');
      // 583/N5: the REPL /run flow is a human decision surface — stream live.
      const spawned = spawnDetachedDeckent(cliArgs, { projectRoot: deps.root, flowId: fid, liveTrace: true });
      return { flowId: fid, jobId: `flow-${fid}-r${stored.revision}`, logRef: spawned.logPath };
    });

    const result = startApprovedRun({
      flowId,
      expectedRevision: stored.revision,
      expectedPlanDigest: stored.planDigest,
      approvedSnapshot: stored,
      ...(existingRunHandle ? { existingRunHandle } : {}),
      spawnStart,
    });

    // born-681: parent handle-persist ETMEZ — tek-yazar CHILD'dır
    // (cli/commands/start.ts --flow-id dalı, persist-before-run). Parent'ın
    // spawn-sonrası yazımı child'ın duplicate-check'ini zehirliyordu: child
    // açılır açılmaz kendi handle'ını görüp no-op'luyordu → canlı koşu hiç
    // başlamıyordu (flow-18fb63df canlı-vakası). Parent yalnız loadRunHandle
    // ile GERÇEK duplicate'leri (önceki child-persist'leri) yakalar.

    context = reduceRunFlow(context, {
      schemaVersion: RUN_FLOW_EVENT_SCHEMA_VERSION,
      flowId,
      timestamp: nowFn(),
      type: 'RUN_STARTED',
      handle: result.handle,
    });

    return context;
  }

  function reject(reason?: string): RunFlowContext {
    const { flowId, preview, proposal } = context;
    const revision = preview?.revision ?? proposal?.revision;
    if (!flowId || revision === undefined) {
      throw new Error('run-flow-controller: reject() requires an active flow (call proposeRun first)');
    }
    context = reduceRunFlow(context, {
      schemaVersion: RUN_FLOW_EVENT_SCHEMA_VERSION,
      flowId,
      timestamp: nowFn(),
      type: 'APPROVAL_REJECTED',
      revision,
      ...(reason !== undefined ? { reason } : {}),
    });
    return context;
  }

  /** See {@link RunFlowController.applyRunCompletion} for the full rationale. */
  function applyRunCompletion(event: RunCompletionInfo): RunFlowContext {
    const { flowId, state } = context;

    if (flowId === undefined || event.flowId !== flowId) {
      console.error(
        `[run-flow-controller] ignoring completion event for jobId='${event.jobId}' ` +
          `(event.flowId='${event.flowId ?? '<unset>'}') — controller is tracking flowId='${flowId ?? '<unset>'}'`,
      );
      return context;
    }

    if (isTerminalRunFlowState(state)) {
      // Idempotent replay — the flow already reached a terminal state (most
      // commonly this exact event redelivered by an at-least-once watcher).
      // Silent: this is expected steady-state behavior, not an anomaly.
      return context;
    }

    context = reduceRunFlow(
      context,
      event.status === 'COMPLETE'
        ? {
            schemaVersion: RUN_FLOW_EVENT_SCHEMA_VERSION,
            flowId,
            timestamp: nowFn(),
            type: 'RUN_COMPLETED',
          }
        : {
            schemaVersion: RUN_FLOW_EVENT_SCHEMA_VERSION,
            flowId,
            timestamp: nowFn(),
            type: 'RUN_FAILED',
            error: event.error ?? `run ${event.jobId} failed`,
          },
    );
    return context;
  }

  return {
    getContext: () => context,
    proposeRun,
    approve,
    reject,
    startApproved,
    applyRunCompletion,
  };
}
