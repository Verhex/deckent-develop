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
} from '../../core/run-flow-contract.js';
import type { ActorContext, RequestOrigin } from '../../core/work-model.js';
import type { BrainPlanningMode, ResolvedConfig, SprintSizeRecommendation } from '../../core/types.js';
import { reduceRunFlow } from '../../orchestra/run-flow-reducer.js';
import { compileRunProposal } from '../../orchestra/run-proposal-compiler.js';
import { generatePlanPreview } from '../../orchestra/plan-preview-service.js';
import { readContext } from '../../orchestra/brain.js';

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
}

function defaultRecommendation(config: ResolvedConfig): SprintSizeRecommendation {
  return {
    size: 'full',
    maxWorkers: typeof config.activeModeConfig.max_workers === 'number' ? config.activeModeConfig.max_workers : 4,
    modelConstraint: null,
    reason: 'No usage constraints',
  };
}

export function createRunFlowController(deps: RunFlowControllerDeps): RunFlowController {
  let context: RunFlowContext = createInitialRunFlowContext();
  const nowFn = deps.now ?? (() => new Date().toISOString());
  const generateFlowId = deps.generateFlowId ?? (() => randomUUID());

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

    const compiled = compileRunProposal(proposal);
    const brainContext = { ...readContext(deps.root), directives: compiled.directivesMarkdown };
    const recommendation = deps.recommendation ?? defaultRecommendation(deps.config);
    const result = await generatePlanPreview(deps.root, deps.config, brainContext, recommendation, {
      mode: deps.mode ?? 'structured',
    });

    const preview: PlanPreview = {
      flowId,
      revision,
      planDigest: result.planDigest,
      taskSummaries: result.taskSummaries,
      policyDecision: result.policyDecision,
      gateResult: result.gateResult,
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

  return {
    getContext: () => context,
    proposeRun,
    approve,
    reject,
  };
}
