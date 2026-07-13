// ═══ run-flow-routes — TERM-FLOW-UNIFY Sprint-7 dilim (429-008) ════════════
//
// docs/analysis/term-flow-unify-design-2026-07-11.md, Sprint-7 row: "Yeni
// api/run-flow-routes.ts, api/run-flow-event-stream.ts" — "Desktop aynı
// flow-service'i tüketir". This is the REST consumer of the SAME
// compiler/preview-service/reducer/store services cli/repl/run-flow-
// controller.ts already drives — NOT a second flow-engine. Every state
// transition below goes through the one pure reducer (`reduceRunFlow`);
// nothing here hand-rolls approval/rejection semantics.
//
// ADR-D-004 C3 (surfaces MUST NOT import one another — api/ <-> cli/):
// run-flow-controller.ts lives under cli/repl/, so it cannot be imported
// from here. This module reimplements the controller's exact event
// sequence (PROPOSAL_SUBMITTED -> PREVIEW_STARTED -> PREVIEW_READY ->
// APPROVAL_GRANTED/APPROVAL_REJECTED) directly against the shared
// orchestra/core services instead — "yeniden-icat yok" refers to the
// compiler/preview-service/reducer/store, not the (necessarily duplicated,
// per-surface) sequencing glue around them.
//
// Four routes only, flag-gated behind `terminal.run_flow_v2` (default off —
// the whole /api/run-flow/* namespace answers 404 while off, same
// "config-gated default-off -> 404" contract as oidc-callback-endpoint.ts's
// dashboard_oidc gate):
//   POST /api/run-flow/propose            — NL intentSummary -> proposal + REAL plan preview
//   GET  /api/run-flow/:flowId            — full flow state (flow-state-get)
//   GET  /api/run-flow/:flowId/preview    — the live PlanPreview only (preview-get)
//   POST /api/run-flow/:flowId/decision   — {decision:'approve'|'reject', reason?} (approve/reject)
//
// NO start endpoint in this slice (design doc Sprint-7 row / DIRECTIVES.md
// Task 8: "start dilim-sonrası karar") — approve() persists the resulting
// ApprovedPlanSnapshot to core/run-flow-store.ts (the same durable store a
// future start-endpoint would read back via loadApprovedSnapshot) but
// nothing here ever calls startApprovedRun or spawns a process.
//
// State is in-process only: a module-level Map<flowId, FlowRecord> — same
// single-process lifetime assumption server.ts's own `activeJobs` Map
// already makes for /api/start's job tracking. A flow's pre-approval stages
// (PROPOSAL_READY/PREVIEWING/AWAITING_APPROVAL) do not survive an API
// process restart; only the APPROVED state's ApprovedPlanSnapshot is durable
// (core/run-flow-store.ts).
//
// Auth/rate-limit: this module intentionally carries NEITHER — both already
// apply centrally in server.ts's dispatch (SlidingWindowRateLimiter +
// bearerAuthMiddleware guard every /api/* path) once this module is wired in
// a later task. The only thing this module does itself is derive
// tenant/role from the verified bearer via deriveRequestPrincipal (never
// from the request body — anti-spoofing), exactly like every other route
// module in this directory (missions-route.ts, process-endpoint.ts).
//
// Tenant isolation mirrors missions-route.ts: a flow's tenant is pinned from
// `proposal.tenant` (itself derived from the request principal at propose
// time, never client-supplied). A caller from a different tenant (and not
// role==='admin') gets 404 — no existence leak.
//
// KNOWN STALE-PIN NOTE (see .result docImpact): tests/orchestra/run-flow-
// reducer.test.ts's KNOWN_CONSUMERS allowlist does not yet list this file —
// DIRECTIVES.md Task 10 (429-010) is the planned follow-up that adds it
// after this task and its SSE sibling (429-009) land.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { z } from 'zod';
import { loadConfig } from '../core/config.js';
import type { ResolvedConfig, Sprint, SprintSizeRecommendation } from '../core/types.js';
import {
  RUN_FLOW_EVENT_SCHEMA_VERSION,
  RunFlowTransitionError,
  createInitialRunFlowContext,
  type PlanPreview,
  type RunFlowContext,
  type RunProposal,
} from '../core/run-flow-contract.js';
import { saveApprovedSnapshot, type StoredApprovedSnapshot } from '../core/run-flow-store.js';
import { reduceRunFlow } from '../orchestra/run-flow-reducer.js';
import { compileRunProposal, type RunProposalPlanner } from '../orchestra/run-proposal-compiler.js';
import { generatePlanPreview } from '../orchestra/plan-preview-service.js';
import { readContext } from '../orchestra/brain.js';
import { deriveRequestPrincipal } from './auth-me-endpoint.js';

const RUN_FLOW_PREFIX = '/api/run-flow/';
const RUN_FLOW_DISABLED_MESSAGE =
  'run-flow API is disabled — set terminal.run_flow_v2: true in .deckent/config.json to enable /api/run-flow/*';

/** Path-segment guard for `:flowId` — flowId ultimately reaches
 *  core/run-flow-store.ts, which joins it straight into a filename with no
 *  sanitization of its own (path-traversal defense-in-depth, same
 *  convention as server.ts's APPROVAL_ID_RE). Production flowIds are always
 *  randomUUID() output, which this pattern already covers. */
const FLOW_ID_RE = /^[a-zA-Z0-9_-]+$/;

const ProposeRunSchema = z.object({
  intentSummary: z.string().min(1).max(20_000),
}).strict();

const DecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().max(2000).optional(),
}).strict();

// ─── In-process flow state ──────────────────────────────────────────────

interface FlowRecord {
  context: RunFlowContext;
  /** The exact planned Sprint captured at proposal time — needed to build a
   *  StoredApprovedSnapshot on approve() (core/run-flow-store.ts's stored
   *  shape is richer than the reducer's own ApprovedPlanSnapshot). */
  plannedSprint: Sprint;
}

const flowStore = new Map<string, FlowRecord>();

/** Test-only seam — clears all in-process flow state between tests. */
export function _resetRunFlowRoutesState(): void {
  flowStore.clear();
}

/**
 * Test seam for the NL -> plan step (mirrors setChatStreamAdapter /
 * setRpcLimitProbeSpawnImpl in server.ts). Production default is
 * `undefined`, which lets compileRunProposal fall back to its own real
 * AI/structured planner core. Tests inject a hermetic fake planner instead —
 * the real default spawns a provider CLI via spawnSync (orchestra/planner.ts
 * callZeroConfigPlanner) and must never run in a test process.
 */
let proposalPlannerOverride: RunProposalPlanner | undefined;

/** Install (or clear) the RunProposalPlanner used by POST /api/run-flow/propose. Pass undefined to reset. */
export function setRunFlowProposalPlanner(planner: RunProposalPlanner | undefined): void {
  proposalPlannerOverride = planner;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, { error: message }, status);
}

/** Mirrors run-flow-controller.ts's own defaultRecommendation — duplicated
 *  (not imported) because that function lives in cli/repl/, unreachable
 *  from api/ under ADR-D-004 C3; the pure ~6-line body is cheaper to
 *  duplicate than to relocate a cli/repl/-owned helper for one new caller. */
function defaultRecommendation(config: ResolvedConfig): SprintSizeRecommendation {
  return {
    size: 'full',
    maxWorkers: typeof config.activeModeConfig.max_workers === 'number' ? config.activeModeConfig.max_workers : 4,
    modelConstraint: null,
    reason: 'No usage constraints',
  };
}

/** Looks up a flow, enforcing tenant isolation (same fail-closed/no-leak
 *  contract as missions-route.ts's findApprovalEntry-adjacent checks):
 *  a caller outside the flow's tenant (and not role==='admin') gets
 *  `undefined`, indistinguishable from a genuinely unknown flowId. */
function lookupFlow(flowId: string, req: IncomingMessage): FlowRecord | undefined {
  const record = flowStore.get(flowId);
  if (!record) return undefined;
  const principal = deriveRequestPrincipal(req);
  const callerTenant = principal.tenantId ?? 'local';
  const isAdmin = principal.role === 'admin';
  const flowTenant = record.context.proposal?.tenant ?? 'local';
  if (!isAdmin && flowTenant !== callerTenant) return undefined;
  return record;
}

// ─── POST /api/run-flow/propose ─────────────────────────────────────────

async function handlePropose(
  res: ServerResponse,
  projectRoot: string,
  config: ResolvedConfig,
  body: unknown,
  req: IncomingMessage,
): Promise<boolean> {
  const parsed = ProposeRunSchema.safeParse(body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.message);
    return true;
  }

  // Identity is ALWAYS derived server-side from the verified bearer — never
  // from the request body (anti-spoofing, matches process-endpoint.ts).
  const principal = deriveRequestPrincipal(req);
  const flowId = randomUUID();
  const revision = 1;
  const proposal: RunProposal = {
    flowId,
    tenant: principal.tenantId ?? 'local',
    project: basename(projectRoot),
    actor: { id: principal.id, ...(principal.role ? { role: principal.role } : {}) },
    origin: 'api',
    revision,
    intentSummary: parsed.data.intentSummary.trim(),
  };

  let context: RunFlowContext = createInitialRunFlowContext();
  context = reduceRunFlow(context, {
    schemaVersion: RUN_FLOW_EVENT_SCHEMA_VERSION,
    flowId,
    timestamp: new Date().toISOString(),
    type: 'PROPOSAL_SUBMITTED',
    proposal,
  });
  context = reduceRunFlow(context, {
    schemaVersion: RUN_FLOW_EVENT_SCHEMA_VERSION,
    flowId,
    timestamp: new Date().toISOString(),
    type: 'PREVIEW_STARTED',
    revision,
  });

  let plannedSprint: Sprint;
  let preview: PlanPreview;
  try {
    // born-690: forward the live config (same contract as the terminal
    // controller) so brain-model resolution never falls back to balanced-mode.
    const compiled = compileRunProposal(proposal, proposalPlannerOverride, config);
    const brainContext = { ...readContext(projectRoot), directives: compiled.directivesMarkdown };
    const recommendation = defaultRecommendation(config);
    const result = await generatePlanPreview(projectRoot, config, brainContext, recommendation, {
      mode: 'structured',
    });
    plannedSprint = result.sprint;
    preview = {
      flowId,
      revision,
      planDigest: result.planDigest,
      taskSummaries: result.taskSummaries,
      policyDecision: result.policyDecision,
      gateResult: result.gateResult,
    };
  } catch (err) {
    // A proposal that cannot be planned is a typed failure, never a
    // silently degraded scaffold (mirrors RunProposalPlanError's own
    // contract) — nothing is persisted to flowStore for a failed proposal.
    sendError(res, 502, err instanceof Error ? err.message : 'run-flow: preview generation failed');
    return true;
  }

  context = reduceRunFlow(context, {
    schemaVersion: RUN_FLOW_EVENT_SCHEMA_VERSION,
    flowId,
    timestamp: new Date().toISOString(),
    type: 'PREVIEW_READY',
    preview,
  });

  flowStore.set(flowId, { context, plannedSprint });
  sendJson(res, context, 201);
  return true;
}

// ─── GET /api/run-flow/:flowId ──────────────────────────────────────────

function handleFlowStateGet(res: ServerResponse, flowId: string, req: IncomingMessage): boolean {
  const record = lookupFlow(flowId, req);
  if (!record) {
    sendError(res, 404, 'Flow not found');
    return true;
  }
  sendJson(res, record.context);
  return true;
}

// ─── GET /api/run-flow/:flowId/preview ──────────────────────────────────

function handlePreviewGet(res: ServerResponse, flowId: string, req: IncomingMessage): boolean {
  const record = lookupFlow(flowId, req);
  if (!record || !record.context.preview) {
    sendError(res, 404, 'Flow not found');
    return true;
  }
  sendJson(res, record.context.preview);
  return true;
}

// ─── POST /api/run-flow/:flowId/decision ────────────────────────────────

function handleDecision(
  res: ServerResponse,
  projectRoot: string,
  flowId: string,
  body: unknown,
  req: IncomingMessage,
): boolean {
  const parsed = DecisionSchema.safeParse(body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.message);
    return true;
  }

  const record = lookupFlow(flowId, req);
  if (!record) {
    sendError(res, 404, 'Flow not found');
    return true;
  }

  const principal = deriveRequestPrincipal(req);
  const timestamp = new Date().toISOString();
  let context = record.context;

  try {
    if (parsed.data.decision === 'approve') {
      const { preview } = context;
      if (!preview) {
        sendError(res, 409, 'run-flow: no live preview to approve');
        return true;
      }
      context = reduceRunFlow(context, {
        schemaVersion: RUN_FLOW_EVENT_SCHEMA_VERSION,
        flowId,
        timestamp,
        type: 'APPROVAL_GRANTED',
        revision: preview.revision,
        planDigest: preview.planDigest,
        approvedBy: { id: principal.id, ...(principal.role ? { role: principal.role } : {}) },
      });
      if (context.state === 'APPROVED' && context.approvedSnapshot) {
        const stored: StoredApprovedSnapshot = {
          flowId,
          revision: context.approvedSnapshot.revision,
          planDigest: context.approvedSnapshot.planDigest,
          approvedBy: context.approvedSnapshot.approvedBy,
          approvedAt: context.approvedSnapshot.approvedAt,
          sprint: record.plannedSprint,
        };
        saveApprovedSnapshot(projectRoot, stored);
      }
    } else {
      context = reduceRunFlow(context, {
        schemaVersion: RUN_FLOW_EVENT_SCHEMA_VERSION,
        flowId,
        timestamp,
        type: 'APPROVAL_REJECTED',
        revision: context.preview?.revision ?? context.proposal?.revision ?? 1,
        ...(parsed.data.reason !== undefined ? { reason: parsed.data.reason } : {}),
      });
    }
  } catch (err) {
    if (err instanceof RunFlowTransitionError) {
      sendError(res, 409, err.message);
      return true;
    }
    throw err;
  }

  flowStore.set(flowId, { context, plannedSprint: record.plannedSprint });
  sendJson(res, context);
  return true;
}

// ─── Dispatch ────────────────────────────────────────────────────────────

/**
 * Handle run-flow HTTP routes. Returns true when the route matched (a
 * response was sent), false to let the caller fall through. Async — the
 * flag check and the propose handler both need a loaded ResolvedConfig.
 */
export async function registerRunFlowRoutes(
  url: string,
  method: string,
  res: ServerResponse,
  body: unknown,
  projectRoot: string,
  req: IncomingMessage,
): Promise<boolean> {
  const path = new URL(url, 'http://localhost').pathname;
  if (!path.startsWith(RUN_FLOW_PREFIX)) return false;

  const config = await loadConfig(projectRoot);
  if (config.terminal?.run_flow_v2 !== true) {
    sendError(res, 404, RUN_FLOW_DISABLED_MESSAGE);
    return true;
  }

  const rest = path.slice(RUN_FLOW_PREFIX.length);
  const segments = rest.split('/').filter(Boolean);
  if (segments.length === 0) return false;

  if (method === 'POST' && segments.length === 1 && segments[0] === 'propose') {
    return handlePropose(res, projectRoot, config, body, req);
  }

  const flowId = decodeURIComponent(segments[0]!);
  if (!FLOW_ID_RE.test(flowId)) {
    sendError(res, 400, 'Invalid flow id');
    return true;
  }

  if (segments.length === 1 && method === 'GET') {
    return handleFlowStateGet(res, flowId, req);
  }
  if (segments.length === 2 && segments[1] === 'preview' && method === 'GET') {
    return handlePreviewGet(res, flowId, req);
  }
  if (segments.length === 2 && segments[1] === 'decision' && method === 'POST') {
    return handleDecision(res, projectRoot, flowId, body, req);
  }

  return false;
}
