// src/nervous/decision-memory.ts
//
// Decision Memory — the durable finding-fingerprint → decision registry.
// APPROVAL-LOOP root fix (sprint-443; Alperen: "reddetsem de kabul etsem de aynı
// onay sürekli geliyor — 25. kez ele alınıyor").
//
// Root cause chain this module kills:
//   1. Detectors re-emit a PERSISTING condition as a fresh finding every scan.
//   2. The proposer minted a NEW uuid (and a uuid-derived shortCode) each time,
//      so an operator decision only ever terminated ONE instance — never the
//      finding. Nothing anywhere remembered "this exact finding was already
//      rejected/accepted".
//   3. The executor's auto-proceed timer then re-EXECUTED the same suggestion
//      every cycle (history evidence: SCOPE_COLLISION_REORDER every ~5 minutes).
//
// This registry is keyed by the content-fingerprint (proposer mints it from
// detectorId + groupKey + action ids — stable across re-emissions) and is
// consulted by the pipeline BEFORE dispatch:
//   rejected  → suppress the fingerprint for `reject_suppress_ms` (default 6h);
//   accepted / executed → suppress for `accept_cooldown_ms` (default 30m) while
//     the action takes effect; a re-fire AFTER the window is allowed but flagged
//     `repeatAfterAction` so the surface can escalate ("the action did not clear
//     this") instead of re-asking the same question verbatim.
//
// Durable on disk (.deckent/nervous/nervous-decisions.json) so the bot host and
// a sprint host share one memory (the cross-process half of born-679). All I/O
// is fail-soft: a corrupt/absent file never throws — it only weakens back to
// pre-fix behavior for one cycle.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// ─── Defaults (single source — config keys override) ────────────────────────

/** Default suppression window for a REJECTED fingerprint (6 hours). */
export const DEFAULT_REJECT_SUPPRESS_MS = 6 * 60 * 60 * 1000;
/** Default cool-down for an ACCEPTED/EXECUTED fingerprint (30 minutes). */
export const DEFAULT_ACCEPT_COOLDOWN_MS = 30 * 60 * 1000;

export type FindingDecision = 'accepted' | 'rejected' | 'executed';

export interface DecisionRecord {
  readonly decision: FindingDecision;
  /** ISO 8601 — when the LAST decision on this fingerprint landed. */
  readonly decidedAt: string;
  /** How many times this fingerprint has been decided/executed in total. */
  readonly count: number;
}

export interface SuppressionVerdict {
  /** True → the pipeline must DROP this notification (no dispatch, no execute). */
  readonly suppress: boolean;
  /** True → allowed through, but this same finding already had its action run
   *  and the condition STILL persists — surface as an escalation, not a re-ask. */
  readonly repeatAfterAction: boolean;
  readonly reason: string;
}

interface SuppressionConfig {
  readonly reject_suppress_ms?: number;
  readonly accept_cooldown_ms?: number;
}

// ─── Storage ────────────────────────────────────────────────────────────────

function decisionsPath(projectRoot: string): string {
  return join(projectRoot, '.deckent', 'nervous', 'nervous-decisions.json');
}

function readAll(projectRoot: string): Record<string, DecisionRecord> {
  const p = decisionsPath(projectRoot);
  try {
    if (!existsSync(p)) return {};
    const parsed: unknown = JSON.parse(readFileSync(p, 'utf-8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, DecisionRecord>)
      : {};
  } catch {
    return {}; // fail-soft: unreadable memory = empty memory, never a throw
  }
}

function writeAll(projectRoot: string, all: Record<string, DecisionRecord>): void {
  const p = decisionsPath(projectRoot);
  try {
    mkdirSync(dirname(p), { recursive: true });
    // tmp+rename: a concurrent reader never sees a half-written file.
    const tmp = `${p}.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify(all, null, 1), 'utf-8');
    renameSync(tmp, p);
  } catch {
    // fail-soft: losing one write weakens suppression for one window, never crashes
  }
}

// ─── API ────────────────────────────────────────────────────────────────────

/**
 * Record an operator/executor decision for a finding-fingerprint.
 * Last-decision-wins; `count` accumulates across decisions (repeat evidence).
 */
export function recordDecision(
  projectRoot: string,
  fingerprint: string,
  decision: FindingDecision,
  now: Date = new Date(),
): void {
  if (!fingerprint) return;
  const all = readAll(projectRoot);
  const prev = all[fingerprint];
  all[fingerprint] = {
    decision,
    decidedAt: now.toISOString(),
    count: (prev?.count ?? 0) + 1,
  };
  writeAll(projectRoot, all);
}

/** Read a single fingerprint's record (test/inspection surface). */
export function getDecision(projectRoot: string, fingerprint: string): DecisionRecord | undefined {
  return readAll(projectRoot)[fingerprint];
}

/**
 * Should a freshly-proposed notification with this fingerprint be suppressed?
 * Consulted by the pipeline BEFORE dispatch/execute.
 */
export function evaluateSuppression(
  projectRoot: string,
  fingerprint: string,
  config?: SuppressionConfig,
  now: Date = new Date(),
): SuppressionVerdict {
  if (!fingerprint) {
    return { suppress: false, repeatAfterAction: false, reason: 'no-fingerprint' };
  }
  const rec = readAll(projectRoot)[fingerprint];
  if (!rec) {
    return { suppress: false, repeatAfterAction: false, reason: 'undecided' };
  }

  const ageMs = now.getTime() - Date.parse(rec.decidedAt);
  if (Number.isNaN(ageMs)) {
    return { suppress: false, repeatAfterAction: false, reason: 'unreadable-record' };
  }

  if (rec.decision === 'rejected') {
    const window = config?.reject_suppress_ms ?? DEFAULT_REJECT_SUPPRESS_MS;
    return ageMs < window
      ? { suppress: true, repeatAfterAction: false, reason: `rejected ${Math.round(ageMs / 1000)}s ago — suppressed for ${window}ms` }
      : { suppress: false, repeatAfterAction: false, reason: 'reject-window expired' };
  }

  // accepted / executed → cool-down, then escalate-not-reask
  const window = config?.accept_cooldown_ms ?? DEFAULT_ACCEPT_COOLDOWN_MS;
  return ageMs < window
    ? { suppress: true, repeatAfterAction: false, reason: `${rec.decision} ${Math.round(ageMs / 1000)}s ago — cool-down ${window}ms` }
    : { suppress: false, repeatAfterAction: true, reason: `${rec.decision} action did not clear the condition (decided ${rec.count}x)` };
}
