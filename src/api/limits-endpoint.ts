// ─── Limits API Endpoint (DASH-LIMITS-CARD) ──────────────────────────────────
// GET /api/limits — subscription-window usage probe (session / week (all
// models) / week (Fable)) for the dashboard LimitsCard. Wraps
// core/limit-preflight.ts#probeSubscriptionLimits with an injectable spawn
// so tests never invoke the real `claude` binary (mirrors
// tests/core/limit-preflight.test.ts's EventEmitter-based fake-spawn pattern).
//
// Fail-honest by design: probe unavailability is surfaced as
// `{ unavailable: true, reason, windows: [] }` with HTTP 200 — never a 500.
// A CLI plain-text-format drift is a UI degrade, not a server error, mirroring
// limit-preflight.ts's own fail-open philosophy (see its file header).
//
// Per-window verdict (ok/warn/block) uses the shared
// DEFAULT_LIMIT_GATE_THRESHOLDS only — same default-path semantics as
// core/limit-preflight.ts#evaluateLimitGateByWindow. Config-driven
// `limit_gate.*` thresholds (cli/commands/limits.ts's
// resolveLimitGateThresholds) are intentionally NOT read here: that module
// lives in cli/, and api/ -> cli/ imports are forbidden by ADR-D-004 C3.
//
// NOT YET WIRED into server.ts — see this task's .result notes for the
// one-line `registerLimitsRoute` call site + import to add.
// Sprint 365 Task 365-006.

import type { ServerResponse } from 'node:http';
import {
  probeSubscriptionLimits,
  DEFAULT_LIMIT_GATE_THRESHOLDS,
  type ProbeSubscriptionLimitsOptions,
  type SubscriptionLimitResult,
  type ResetTime,
  type LimitGateVerdict,
} from '../core/limit-preflight.js';

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export type LimitsWindowName = 'session' | 'week_all' | 'week_fable';

export interface LimitsWindowView {
  readonly name: LimitsWindowName;
  readonly pct: number;
  readonly resetAt: ResetTime | null;
  readonly verdict: LimitGateVerdict;
}

export interface LimitsResponse {
  readonly unavailable: boolean;
  readonly reason: string | null;
  readonly windows: LimitsWindowView[];
}

function verdictForPct(pct: number): LimitGateVerdict {
  if (pct >= DEFAULT_LIMIT_GATE_THRESHOLDS.blockPct) return 'block';
  if (pct >= DEFAULT_LIMIT_GATE_THRESHOLDS.warnPct) return 'warn';
  return 'ok';
}

/**
 * Build the dashboard-facing response shape from a raw probe result.
 * Exported for direct unit testing of the pure formatting logic.
 */
export function buildLimitsResponse(probe: SubscriptionLimitResult): LimitsResponse {
  if (probe.unavailable) {
    return { unavailable: true, reason: probe.reason, windows: [] };
  }

  const windows: LimitsWindowView[] = [
    {
      name: 'session',
      pct: probe.sessionPct,
      resetAt: probe.sessionResetAt,
      verdict: verdictForPct(probe.sessionPct),
    },
    {
      name: 'week_all',
      pct: probe.weekAllPct,
      resetAt: probe.weekAllResetAt,
      verdict: verdictForPct(probe.weekAllPct),
    },
  ];

  if (probe.weekFablePct !== undefined) {
    // The probe has no separate weekFableResetAt field — the weekly windows
    // share a reset time, same fallback cli/commands/limits.ts's
    // runLimitsCommand table row already uses for the Fable row.
    windows.push({
      name: 'week_fable',
      pct: probe.weekFablePct,
      resetAt: probe.weekAllResetAt,
      verdict: verdictForPct(probe.weekFablePct),
    });
  }

  return { unavailable: false, reason: null, windows };
}

/**
 * Handle GET /api/limits. `probeOpts` is a test-only injectable-spawn seam
 * (defaults to the real `claude -p "/usage"` spawn) — the production
 * server.ts call site passes none. Returns true when the route matched.
 */
export async function registerLimitsRoute(
  url: string,
  res: ServerResponse,
  probeOpts: ProbeSubscriptionLimitsOptions = {},
): Promise<boolean> {
  if (url !== '/api/limits') return false;

  const probe = await probeSubscriptionLimits(probeOpts);
  sendJson(res, buildLimitsResponse(probe));
  return true;
}
