// ═══ Tool Dispatch — execution bridge over TOOL-1/TOOL-2 (TERM-4, sprint-353 task-353-012) ═
// TOOL-1 (`./tool-registry.js`) is a pure catalog (register/get/list/validate — no exec).
// TOOL-2 (`./tool-search.js`) adds progressive disclosure + `planCall` — validates args and
// labels risk, but never runs anything either. This module is the first thing in that stack
// allowed to actually run a tool: it takes a `planCall` verdict, gates risky calls behind an
// injected confirm seam, runs an injected exec seam, and returns a structured result +
// telemetry. `dispatchToolCall` itself never throws — every failure (confirm rejection,
// execImpl throw) is caught and reported as a structured error on the returned result.
//
// Both `confirm` and `execImpl` are pure injection seams (no default implementation beyond
// the fail-closed deny-on-missing-confirm behavior below): this module never performs real
// command execution or renders UI (out of scope by design — TERM-4 nogo). Wiring `confirm` to
// the runtime-wide ApprovalBroker (`./approval-worker-gate.js`) is explicitly future work; this
// module has zero import dependency on the approval-* family so that wiring stays a caller
// concern, not a change here.
//
// ADR-D-004 (Layer-1 Import Direction) C1: core/ MUST NOT import orchestra/cli/api/mcp. This
// module only imports from ./tool-registry.js and ./tool-search.js (both core/).

import type { ToolCategory, ToolRiskLevel } from './tool-registry.js';
import type { ToolCallPlan } from './tool-search.js';

// ─── Risk gate ──────────────────────────────────────────────────────────────

/** Total order over {@link ToolRiskLevel} — higher number = more caution warranted. */
export const RISK_ORDER: Record<ToolRiskLevel, number> = {
  safe: 0,
  moderate: 1,
  destructive: 2,
};

/** Default confirm-gate threshold: 'safe' tools skip confirm; 'moderate'+'destructive' need it. */
export const DEFAULT_RISK_THRESHOLD: ToolRiskLevel = 'moderate';

/** True when `risk` meets or exceeds `threshold` on the {@link RISK_ORDER} scale. */
export function meetsRiskThreshold(risk: ToolRiskLevel, threshold: ToolRiskLevel): boolean {
  return RISK_ORDER[risk] >= RISK_ORDER[threshold];
}

// ─── Dispatch input ─────────────────────────────────────────────────────────

/**
 * `ToolCallPlan` (the real `planCall()` output) plus the `args` that produced it.
 * `planCall` itself never carries `args` (TOOL-2 is validate-only, no exec, no args
 * echo) — a caller wires this up as `{ ...index.planCall(name, args), args }` so
 * `execImpl` has something to actually run against.
 */
export interface ToolDispatchPlan extends ToolCallPlan {
  args: unknown;
}

// ─── Confirm seam ───────────────────────────────────────────────────────────

export type ConfirmDecision = 'allow' | 'deny';

/** Context handed to the injected {@link ConfirmFn} for a risk-gated call. */
export interface ConfirmContext {
  toolName: string;
  risk: ToolRiskLevel;
  category?: ToolCategory;
  args: unknown;
}

/**
 * Injectable approval seam. Real production wiring (APR-workergate /
 * `WorkerApprovalGate#guard`) is out of scope here — this is intentionally just the
 * narrow contract a caller supplies. Sync or async; awaited uniformly.
 */
export type ConfirmFn = (ctx: ConfirmContext) => ConfirmDecision | Promise<ConfirmDecision>;

// ─── Exec seam ──────────────────────────────────────────────────────────────

/** Context handed to the injected {@link ExecImplFn}. */
export interface ExecImplContext {
  name: string;
  args: unknown;
}

/**
 * Injectable execution seam — the only place a real tool handler is ever invoked.
 * Production callers inject the real dispatch (e.g. resolving `handlerRef` and
 * calling it); tests inject a fake. Sync or async; awaited uniformly.
 */
export type ExecImplFn = (ctx: ExecImplContext) => unknown | Promise<unknown>;

// ─── Result + telemetry ─────────────────────────────────────────────────────

export const DISPATCH_STATUSES = ['executed', 'denied', 'invalid', 'unknown_tool', 'error'] as const;
export type DispatchStatus = (typeof DISPATCH_STATUSES)[number];

/** Structured, never-rethrown error shape — any `confirm`/`execImpl` throw lands here. */
export interface DispatchError {
  name: string;
  message: string;
  stack?: string;
}

export interface DispatchTelemetry {
  toolName: string;
  status: DispatchStatus;
  risk?: ToolRiskLevel;
  category?: ToolCategory;
  /** True iff risk met/exceeded the threshold, i.e. a confirm decision was required. */
  confirmRequired: boolean;
  /** Present only when `confirmRequired` was true and a decision was reached. */
  confirmDecision?: ConfirmDecision;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export interface DispatchResult {
  status: DispatchStatus;
  /** Present only when `status === 'executed'` — whatever `execImpl` returned. */
  result?: unknown;
  /** Present only when `status === 'error'`. */
  error?: DispatchError;
  telemetry: DispatchTelemetry;
}

// ─── Options ─────────────────────────────────────────────────────────────────

export interface DispatchToolCallOptions {
  /** Runs the actual tool. Mandatory — this is the only seam that produces a real result. */
  execImpl: ExecImplFn;
  /**
   * Approval seam for risk-gated calls. Optional — but a call whose risk meets/exceeds
   * `riskThreshold` with no `confirm` supplied is denied (fail-closed), never executed.
   */
  confirm?: ConfirmFn;
  /** Defaults to {@link DEFAULT_RISK_THRESHOLD} ('moderate'). */
  riskThreshold?: ToolRiskLevel;
  /** Clock seam for deterministic tests. Defaults to `() => new Date()`. */
  now?: () => Date;
}

function toStructuredError(err: unknown): DispatchError {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      ...(err.stack ? { stack: err.stack } : {}),
    };
  }
  return { name: 'NonErrorThrown', message: String(err) };
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

/**
 * Execution bridge over a `planCall()` verdict: short-circuits on `invalid`/`unknown_tool`
 * (no confirm, no exec), gates `valid` calls whose risk meets/exceeds `riskThreshold` behind
 * the injected `confirm` seam (fail-closed deny when `confirm` is absent), then runs the
 * injected `execImpl` seam. Never throws — every branch, including a `confirm`/`execImpl`
 * throw, resolves to a {@link DispatchResult} with `status` + telemetry.
 */
export async function dispatchToolCall(
  plan: ToolDispatchPlan,
  options: DispatchToolCallOptions,
): Promise<DispatchResult> {
  const now = options.now ?? (() => new Date());
  const threshold = options.riskThreshold ?? DEFAULT_RISK_THRESHOLD;
  const startedAt = now();
  let confirmRequired = false;
  let confirmDecision: ConfirmDecision | undefined;

  const settle = (status: DispatchStatus, rest: { result?: unknown; error?: DispatchError } = {}): DispatchResult => {
    const finishedAt = now();
    return {
      status,
      ...rest,
      telemetry: {
        toolName: plan.name,
        status,
        risk: plan.risk,
        category: plan.category,
        confirmRequired,
        ...(confirmDecision !== undefined ? { confirmDecision } : {}),
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      },
    };
  };

  if (plan.status === 'unknown_tool' || plan.status === 'invalid') {
    return settle(plan.status);
  }

  // plan.status === 'valid' from here — planCall always attaches risk for a known tool.
  // Fallback to 'destructive' (most cautious) is defensive-only and should never trigger.
  const risk: ToolRiskLevel = plan.risk ?? 'destructive';

  if (meetsRiskThreshold(risk, threshold)) {
    confirmRequired = true;
    if (!options.confirm) {
      confirmDecision = 'deny';
      return settle('denied');
    }
    try {
      confirmDecision = await options.confirm({
        toolName: plan.name,
        risk,
        category: plan.category,
        args: plan.args,
      });
    } catch (err) {
      return settle('error', { error: toStructuredError(err) });
    }
    if (confirmDecision !== 'allow') {
      return settle('denied');
    }
  }

  try {
    const result = await options.execImpl({ name: plan.name, args: plan.args });
    return settle('executed', { result });
  } catch (err) {
    return settle('error', { error: toStructuredError(err) });
  }
}
